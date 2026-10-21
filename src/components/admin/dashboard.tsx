'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Users, Activity, FileText, Package, ArrowRight, RefreshCw,
  CheckCircle2, XCircle, CheckSquare, Square, Sparkles, AlertCircle,
  Eye, Trash2, UploadCloud, Settings2, X, Plus,
  Search, GripVertical, ChevronRight, Loader2,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Skeleton } from '@/components/ui/skeleton';
import { ScrollArea } from '@/components/ui/scroll-area';
import { DynamicIcon } from '@/components/ui/dynamic-icon';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle, DialogTrigger,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { formatCurrency } from '@/lib/utils';

// =====================================================================
// 类型定义（与现有 dashboard / api 完全一致，不变 schema）
// =====================================================================
interface DashboardStats {
  totalUsers: number;
  activeUsersToday: number;
  totalQuotes: number;
  todayQuotes: number;
  totalProducts: number;
  todayProducts?: number;
  totalRevenue?: number;
  todayRevenue?: number;
  totalPoints?: number;
  trends30d?: Array<{ date: string; totalUsers?: number; activeUsers?: number; quotes?: number; products?: number }>;
}

interface AuditItem {
  id: string;
  type?: string;
  title?: string;
  description?: string;
  fileName?: string;
  file_name?: string;
  fileUrl?: string;
  fileSize?: number;
  fileType?: string;
  status?: string;
  uploaderName?: string;
  createdAt?: string;
  metadata?: Record<string, unknown>;
  // knowledge_entries schema fields (audit type=knowledge_entries)
  name?: string;
  category?: string;
  file_url?: string;
  file_size?: number;
  submitted_at?: string;
  submitted_by?: string;
}

interface UploadItem {
  id: string;
  title?: string; // knowledge_entries.title（推荐展示名）
  fileName?: string;
  file_name?: string;
  fileUrl?: string;
  file_url?: string;
  fileKey?: string;
  file_key?: string;
  fileSize?: number;
  file_size?: number;
  fileType?: string;
  file_type?: string;
  uploaderName?: string;
  uploader_name?: string;
  createdAt?: string;
  created_at?: string;
  status?: string;
}

interface QuickActionCandidate {
  action_type: 'module' | 'page';
  action_key: string;
  label: string;
  route: string;
  icon: string;
  module_key?: string;
  module_label?: string;
}

interface QuickActionSelected {
  action_type: 'module' | 'page';
  action_key: string;
  label: string;
  route: string;
  icon: string;
  sort_order: number;
  enabled: boolean;
}

interface ContributorInfo {
  total: number;
  pending: number;
  myThisMonth?: number;
}

interface QuickActionsResponse {
  success: boolean;
  data?: {
    candidates: QuickActionCandidate[];
    selected: QuickActionSelected[];
  };
  error?: string;
}

// =====================================================================
// 颜色与装饰，stagger 顺序按 i 计算，做到视觉对比丰富
// =====================================================================
const STAT_CARDS: Array<{
  key: 'totalUsers' | 'activeUsersToday' | 'totalQuotes' | 'totalProducts';
  label: string;
  desc: string;
  icon: React.ComponentType<{ className?: string }>;
  gradient: string;
  ringClass: string;
  iconBg: string;
  iconColor: string;
}> = [
  {
    key: 'totalUsers',
    label: '总用户数',
    desc: '已注册的用户总规模',
    icon: Users,
    gradient: 'from-sky-50 via-white to-white',
    ringClass: 'ring-sky-100/70',
    iconBg: 'bg-sky-100/80',
    iconColor: 'text-sky-600',
  },
  {
    key: 'activeUsersToday',
    label: '今日活跃',
    desc: '今日有访问行为的用户数',
    icon: Activity,
    gradient: 'from-emerald-50 via-white to-white',
    ringClass: 'ring-emerald-100/70',
    iconBg: 'bg-emerald-100/80',
    iconColor: 'text-emerald-600',
  },
  {
    key: 'totalQuotes',
    label: '报价单数',
    desc: '系统内累计报价单',
    icon: FileText,
    gradient: 'from-violet-50 via-white to-white',
    ringClass: 'ring-violet-100/70',
    iconBg: 'bg-violet-100/80',
    iconColor: 'text-violet-600',
  },
  {
    key: 'totalProducts',
    label: '产品数量',
    desc: '已上架的产品规格数',
    icon: Package,
    gradient: 'from-amber-50 via-white to-white',
    ringClass: 'ring-amber-100/70',
    iconBg: 'bg-amber-100/80',
    iconColor: 'text-amber-600',
  },
];

// =====================================================================
// 工具方法
// =====================================================================
function formatNumber(n: number | undefined | null): string {
  if (n === null || n === undefined || Number.isNaN(n)) return '—';
  if (n >= 10000) return `${(n / 10000).toFixed(n >= 100000 ? 0 : 1)} 万`;
  return String(n);
}

// #[20260901-1100] P2-11：formatCurrency 统一使用 @/lib/utils 权威实现（原本地副本已删除）

function formatBytes(b: number | undefined | null): string {
  if (!b || b < 0) return '';
  if (b < 1024) return `${b} B`;
  if (b < 1024 * 1024) return `${(b / 1024).toFixed(1)} KB`;
  return `${(b / (1024 * 1024)).toFixed(1)} MB`;
}

function relativeTime(iso?: string | null): string {
  if (!iso) return '';
  const t = new Date(iso).getTime();
  if (Number.isNaN(t)) return '';
  const diff = Date.now() - t;
  if (diff < 0) return '刚刚';
  const m = Math.floor(diff / 60000);
  if (m < 1) return '刚刚';
  if (m < 60) return `${m} 分钟前`;
  const h = Math.floor(m / 60);
  if (h < 24) return `${h} 小时前`;
  const d = Math.floor(h / 24);
  if (d < 30) return `${d} 天前`;
  return `${Math.floor(d / 30)} 个月前`;
}

function getAuditDisplayName(a: AuditItem): string {
  return a.title || a.name || a.fileName || a.file_name || '未命名条目';
}

function getAuditFileUrl(a: AuditItem): string | undefined {
  return a.fileUrl || a.file_url;
}

function getAuditFileSize(a: AuditItem): number | undefined {
  return a.fileSize || a.file_size;
}

function getAuditTimestamp(a: AuditItem): string | undefined {
  return a.createdAt || a.submitted_at;
}

function getUploadDisplayName(u: UploadItem): string {
  // 优先使用知识条目标题（中文，规范），回退到 file_name（可能含时间戳前缀/下划线占位）
  return u.title || u.fileName || u.file_name || '未命名文件';
}

function getUploadFileUrl(u: UploadItem): string | undefined {
  const url = u.fileUrl || u.file_url;
  // 仅放行 http(s) URL；非 http URL（如 system://、占位字符串、相对路径）视为无效
  if (!url) return undefined;
  return /^https?:\/\//i.test(url) ? url : undefined;
}

function getUploadFileSize(u: UploadItem): number | undefined {
  return u.fileSize || u.file_size;
}

function getUploadTimestamp(u: UploadItem): string | undefined {
  return u.createdAt || u.created_at;
}

function getUploadStatusBadge(u: UploadItem): string {
  switch ((u.status || '').toLowerCase()) {
    case 'pending': return '待审核';
    case 'approved': return '已通过';
    case 'rejected': return '已拒绝';
    case 'processing': return '处理中';
    default: return '已上传';
  }
}

// 计算昨天同期活跃（基于 stats.trends30d 推算最近两天对比）
function computeDayOnDayTrend(stats: DashboardStats): {
  activeTrend: number | null;
  newQuotesToday: number | null;
  newUsersToday: number | null;
} {
  const trend = stats.trends30d;
  if (!trend || trend.length < 2) {
    return { activeTrend: null, newQuotesToday: null, newUsersToday: null };
  }
  const sorted = [...trend].sort((a, b) => (a.date < b.date ? 1 : -1));
  const today = sorted[0];
  const yesterday = sorted[1];
  const activeTrend =
    today?.activeUsers !== undefined && yesterday?.activeUsers !== undefined && yesterday.activeUsers > 0
      ? Math.round(((today.activeUsers - yesterday.activeUsers) / yesterday.activeUsers) * 100)
      : null;
  const newQuotesToday = stats.todayQuotes ?? null;
  const newUsersToday =
    today?.totalUsers !== undefined && yesterday?.totalUsers !== undefined
      ? Math.max(0, today.totalUsers - yesterday.totalUsers)
      : null;
  return { activeTrend, newQuotesToday, newUsersToday };
}

// 从 localStorage 缓存上次刷新时间，避免闪烁
function setLastRefresh() {
  try { localStorage.setItem('adminDashboard.refreshedAt', new Date().toISOString()); } catch {}
}
function getLastRefresh(): string {
  try { return localStorage.getItem('adminDashboard.refreshedAt') || ''; } catch { return ''; }
}

// =====================================================================
// 组件本体
// =====================================================================
export default function AdminDashboard() {
  const { toast } = useToast();

  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [lastRefresh, setLastRefreshState] = useState('');

  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [auditTotal, setAuditTotal] = useState(0);
  const [uploads, setUploads] = useState<UploadItem[]>([]);
  const [contributor, setContributor] = useState<ContributorInfo | null>(null);

  // 列表批量选择（统一的 Set 存储）
  const [selectedAuditIds, setSelectedAuditIds] = useState<Set<string>>(new Set());
  const [selectedUploadIds, setSelectedUploadIds] = useState<Set<string>>(new Set());

  // 批量操作进行中
  const [batchRunning, setBatchRunning] = useState<null | 'audit' | 'uploads'>(null);

  // 快速操作：自定义
  const [qaDialogOpen, setQaDialogOpen] = useState(false);
  const [qaCandidates, setQaCandidates] = useState<QuickActionCandidate[]>([]);
  const [qaSelected, setQaSelected] = useState<QuickActionSelected[]>([]);
  const [qaOriginal, setQaOriginal] = useState<QuickActionSelected[]>([]); // 打开对话框时服务器已保存的勾选（取消/关闭时回滚）
  const [qaLoading, setQaLoading] = useState(false);
  const [qaSaving, setQaSaving] = useState(false);
  const [qaSearch, setQaSearch] = useState('');
  const [qaError, setQaError] = useState('');

  // ============= 数据加载 =============
  const loadAll = useCallback(async (isRefresh = false) => {
    if (isRefresh) setRefreshing(true); else setLoading(true);
    try {
      const [statsRes, auditRes, uploadsRes, contributorRes] = await Promise.allSettled([
        fetch('/api/admin/stats', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/admin/audit?type=knowledge_entries&status=pending&limit=10', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/knowledge/upload?limit=10', { cache: 'no-store' }).then((r) => r.json()),
        fetch('/api/admin/uploads/pending?status=pending', { cache: 'no-store' }).then((r) => r.json()),
      ]);

      // stats
      if (statsRes.status === 'fulfilled') {
        const data = statsRes.value?.data || statsRes.value || {};
        setStats({
          totalUsers: data.totalUsers ?? 0,
          activeUsersToday: data.activeUsersToday ?? 0,
          totalQuotes: data.totalQuotes ?? 0,
          todayQuotes: data.todayQuotes ?? 0,
          totalProducts: data.totalProducts ?? 0,
          todayProducts: data.todayProducts ?? 0,
          totalPoints: data.totalPoints ?? 0,
          todayRevenue: data.todayRevenue ?? 0,
          totalRevenue: data.totalRevenue ?? 0,
          trends30d: data.trends30d || [],
        });
      } else {
        console.warn('[dashboard] stats fail', statsRes.reason);
        setStats(null);
      }

      // audit（仅 status=pending）
      if (auditRes.status === 'fulfilled') {
        const list = auditRes.value?.data || auditRes.value?.items || [];
        if (Array.isArray(list)) {
          setAuditItems(list.slice(0, 8));
          setAuditTotal(typeof auditRes.value?.total === 'number' ? auditRes.value.total : list.length);
        } else {
          setAuditItems([]);
          setAuditTotal(0);
        }
        setSelectedAuditIds(new Set());
      } else {
        console.warn('[dashboard] audit fail', auditRes.reason);
        setAuditItems([]);
        setAuditTotal(0);
      }

      // uploads（最近上传）
      if (uploadsRes.status === 'fulfilled') {
        const data = uploadsRes.value?.data || uploadsRes.value?.items || [];
        if (Array.isArray(data)) {
          setUploads(data.slice(0, 8));
        } else {
          setUploads([]);
        }
        setSelectedUploadIds(new Set());
      } else {
        console.warn('[dashboard] uploads fail', uploadsRes.reason);
        setUploads([]);
      }

      // contributor（资料贡献者）
      if (contributorRes.status === 'fulfilled') {
        const d = contributorRes.value?.data || contributorRes.value || {};
        const items = d.uploads || d.items || [];
        const pending = items.filter((x: any) => (x.status || '').toLowerCase() === 'pending').length;
        setContributor({
          total: typeof d.total === 'number' ? d.total : items.length,
          pending,
          myThisMonth: typeof d.myThisMonth === 'number' ? d.myThisMonth : 0,
        });
      } else {
        setContributor(null);
      }

      const nowIso = new Date().toISOString();
      setLastRefreshState(nowIso);
      setLastRefresh();
    } catch (e: any) {
      console.error('[dashboard] load error', e);
      toast({ variant: 'destructive', title: '加载失败', description: e?.message || '请稍后再试' });
    } finally {
      setLoading(false);
      setRefreshing(false);
    }
  }, [toast]);

  // 加载快速操作（页面首次挂载即加载用户已保存的快捷入口，对话框打开时复用）
  const loadQuickActions = useCallback(async () => {
    setQaLoading(true);
    setQaError('');
    try {
      const res = await fetch('/api/admin/dashboard/quick-actions', { cache: 'no-store' });
      const json: QuickActionsResponse = await res.json();
      if (!json.success) {
        setQaError(json.error || '加载失败');
        return;
      }
      setQaCandidates(json.data?.candidates || []);
      setQaSelected(json.data?.selected || []);
    } catch (e: any) {
      setQaError(e?.message || '网络错误');
    } finally {
      setQaLoading(false);
    }
  }, []);

  // 首次加载（同时加载用户已保存的快捷入口）
  useEffect(() => {
    const last = getLastRefresh();
    setLastRefreshState(last);
    loadAll();
    loadQuickActions();
  }, [loadAll, loadQuickActions]);

  // ============= 批量审核 audit =============
  const doBatchAudit = useCallback(async (action: 'approve' | 'reject') => {
    if (selectedAuditIds.size === 0) return;
    setBatchRunning('audit');
    try {
      // 当 API 返回成功后全局刷新；通过并行请求提升体验
      const ids = Array.from(selectedAuditIds);
      // 关键：批量用现有 /api/admin/knowledge/batch（已有）
      const res = await fetch('/api/admin/knowledge/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids,
          action: action === 'approve' ? 'approve' : 'reject',
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '批量操作失败');
      const okCount = json.data?.updated ?? json.data?.success_count ?? ids.length;
      const failCount = (Array.isArray(json.data?.failed) ? json.data.failed.length : json.data?.fail_count) ?? 0;
      toast({
        title: action === 'approve' ? '批量通过成功' : '批量拒绝成功',
        description: failCount > 0 ? `成功 ${okCount} 项，失败 ${failCount} 项` : `已处理 ${okCount} 项`,
      });
      await loadAll(true);
    } catch (e: any) {
      toast({ variant: 'destructive', title: '批量操作失败', description: e?.message });
    } finally {
      setBatchRunning(null);
    }
  }, [selectedAuditIds, loadAll, toast]);

  // ============= 上传批量操作 =============
  const doBatchUploadsAction = useCallback(async (op: 'preview_all' | 'delete') => {
    if (selectedUploadIds.size === 0) return;
    const ids = Array.from(selectedUploadIds);
    if (op === 'preview_all') {
      // 选择当前选中所有可预览的 URL 复制
      const links: string[] = [];
      for (const u of uploads) {
        if (selectedUploadIds.has(u.id)) {
          const url = getUploadFileUrl(u);
          if (url) links.push(url);
        }
      }
      if (links.length === 0) {
        toast({ title: '没有可预览的链接', description: '所选项不含文件链接' });
        return;
      }
      try {
        const text = links.join('\n');
        if (navigator.clipboard && window.isSecureContext) {
          await navigator.clipboard.writeText(text);
          toast({ title: '已复制预览链接', description: `共 ${links.length} 条` });
        } else {
          const ta = document.createElement('textarea');
          ta.value = text; ta.style.position = 'fixed'; ta.style.opacity = '0';
          document.body.appendChild(ta); ta.select();
          document.execCommand('copy');
          document.body.removeChild(ta);
          toast({ title: '已复制预览链接', description: `共 ${links.length} 条` });
        }
      } catch (e: any) {
        toast({ variant: 'destructive', title: '复制失败', description: e?.message });
      }
      return;
    }
    // delete（按条目逐个 POST，调用 audit type=user 通常用于删除？我们使用 existing POST /api/admin/audit
    //   删除知识条目复用 /api/admin/knowledge/batch delete）
    if (op === 'delete') {
      setBatchRunning('uploads');
      try {
        const res = await fetch('/api/admin/knowledge/batch', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ ids, action: 'delete' }),
        });
        const json = await res.json();
        if (!json.success) throw new Error(json.error || '批量删除失败');
        toast({
          title: '批量删除成功',
          description: `已处理 ${json.data?.updated ?? json.data?.success_count ?? ids.length} 项`,
        });
        await loadAll(true);
      } catch (e: any) {
        toast({ variant: 'destructive', title: '批量操作失败', description: e?.message });
      } finally {
        setBatchRunning(null);
      }
    }
  }, [selectedUploadIds, uploads, loadAll, toast]);

  // ============= 跳转 =============
  const navigate = useCallback((url: string) => {
    if (!url || url === '#') return;
    window.location.href = url;
  }, []);
  const openAuditDetail = useCallback((item: AuditItem) => {
    const url = getAuditFileUrl(item);
    if (url) {
      // 进入审核详情走 /admin/audit
      navigate('/admin/audit');
    }
  }, [navigate]);

  // ============= 快速操作 Dialog 保存 =============
  const openQaDialog = useCallback(async () => {
    setQaDialogOpen(true);
    setQaSearch('');
    if (qaCandidates.length === 0 && !qaError) {
      await loadQuickActions();
    }
    // 记录服务器已保存的勾选，供取消/关闭时回滚
    setQaOriginal(qaSelected);
  }, [qaCandidates.length, qaError, loadQuickActions, qaSelected]);

  // 取消/关闭对话框：丢弃未保存修改，恢复服务器已保存的勾选
  const closeQaDialog = useCallback(() => {
    setQaSelected(qaOriginal);
    setQaDialogOpen(false);
  }, [qaOriginal]);

  const toggleQaSelect = useCallback((c: QuickActionCandidate) => {
    setQaSelected((prev) => {
      const exist = prev.find((s) => s.action_type === c.action_type && s.action_key === c.action_key);
      if (exist) {
        return prev.filter((s) => !(s.action_type === c.action_type && s.action_key === c.action_key));
      }
      const next: QuickActionSelected = {
        action_type: c.action_type,
        action_key: c.action_key,
        label: c.label,
        route: c.route,
        icon: c.icon,
        sort_order: prev.length,
        enabled: true,
      };
      return [...prev, next];
    });
  }, []);

  const removeQaSelect = useCallback((idx: number) => {
    setQaSelected((prev) => prev.filter((_, i) => i !== idx).map((s, i) => ({ ...s, sort_order: i })));
  }, []);

  const moveQaSelect = useCallback((idx: number, dir: -1 | 1) => {
    setQaSelected((prev) => {
      const next = [...prev];
      const j = idx + dir;
      if (j < 0 || j >= next.length) return prev;
      [next[idx], next[j]] = [next[j], next[idx]];
      return next.map((s, i) => ({ ...s, sort_order: i }));
    });
  }, []);

  const saveQa = useCallback(async () => {
    setQaSaving(true);
    try {
      const items = qaSelected.map((s, i) => ({
        action_type: s.action_type,
        action_key: s.action_key,
        label: s.label,
        route: s.route,
        icon: s.icon,
        sort_order: i,
        enabled: s.enabled,
      }));
      const res = await fetch('/api/admin/dashboard/quick-actions', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ items }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '保存失败');
      toast({ title: '保存成功', description: `已设置 ${items.length} 个快捷入口` });
      setQaOriginal(qaSelected); // 保存成功：以当前勾选作为新的回滚点
      setQaDialogOpen(false);
    } catch (e: any) {
      toast({ variant: 'destructive', title: '保存失败', description: e?.message });
    } finally {
      setQaSaving(false);
    }
  }, [qaSelected, toast]);

  // ============= 派生：选中候选与已选 =============
  const filteredCandidates = useMemo(() => {
    const kw = qaSearch.trim().toLowerCase();
    const grouped = new Map<string, QuickActionCandidate[]>();
    for (const c of qaCandidates) {
      const label = (c.module_label || (c.action_type === 'module' ? '模块' : '子页面'));
      if (!grouped.has(label)) grouped.set(label, []);
      const pass = kw === '' ||
        c.label.toLowerCase().includes(kw) ||
        c.action_key.toLowerCase().includes(kw) ||
        (c.route || '').toLowerCase().includes(kw);
      if (pass) grouped.get(label)!.push(c);
    }
    return Array.from(grouped.entries()).map(([groupLabel, items]) => ({ groupLabel, items }));
  }, [qaCandidates, qaSearch]);

  const qaEnabledActions = useMemo(() => qaSelected.filter((s) => s.enabled), [qaSelected]);

  const trend = useMemo(() => (stats ? computeDayOnDayTrend(stats) : null), [stats]);

  // ============= 渲染 =============
  return (
    <div className="space-y-4 sm:space-y-5">
      {/* ====== Header ====== */}
      <header className="flex flex-wrap items-center justify-between gap-3 pb-2">
        <div>
          <h1 className="text-xl sm:text-2xl font-semibold tracking-tight text-slate-900">欢迎回来，管理员</h1>
          <p className="text-xs sm:text-sm text-slate-500 mt-1 flex items-center gap-1.5">
            <Sparkles className="w-3.5 h-3.5 text-amber-500" />这是您的管理后台仪表盘
          </p>
        </div>
        <Button
          variant="outline"
          size="sm"
          onClick={() => loadAll(true)}
          disabled={refreshing || loading}
          className="h-8"
        >
          <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${refreshing ? 'animate-spin' : ''}`} />
          刷新数据
        </Button>
      </header>

      {/* ====== Statistics Cards ====== */}
      <section className="grid grid-cols-2 lg:grid-cols-4 gap-3 sm:gap-4">
        {STAT_CARDS.map((cfg) => {
          const Icon = cfg.icon;
          const value = stats ? stats[cfg.key] : null;
          let trendBadge: { label: string; tone: 'up' | 'down' | 'neutral' } | null = null;
          if (cfg.key === 'activeUsersToday' && trend?.activeTrend !== null && trend?.activeTrend !== undefined) {
            trendBadge = {
              label: `${trend.activeTrend >= 0 ? '+' : ''}${trend.activeTrend}% 昨日`,
              tone: trend.activeTrend > 0 ? 'up' : trend.activeTrend < 0 ? 'down' : 'neutral',
            };
          } else if (cfg.key === 'totalQuotes' && trend?.newQuotesToday !== null && trend?.newQuotesToday !== undefined) {
            trendBadge = { label: `今日新增 ${trend.newQuotesToday}`, tone: trend.newQuotesToday > 0 ? 'up' : 'neutral' };
          } else if (cfg.key === 'totalUsers' && trend?.newUsersToday !== null && trend?.newUsersToday !== undefined) {
            trendBadge = { label: `今日新增 ${trend.newUsersToday}`, tone: trend.newUsersToday > 0 ? 'up' : 'neutral' };
          } else if (cfg.key === 'totalProducts' && stats?.todayProducts !== undefined) {
            trendBadge = { label: `今日新增 ${stats.todayProducts ?? 0}`, tone: (stats.todayProducts || 0) > 0 ? 'up' : 'neutral' };
          }
          return (
            <Card
              key={cfg.key}
              className={`relative overflow-hidden border-slate-200/70 bg-gradient-to-br ${cfg.gradient} ring-1 ${cfg.ringClass} transition hover:shadow-md hover:-translate-y-0.5`}
            >
              <CardContent className="p-3.5 sm:p-4">
                {loading ? (
                  <div className="space-y-3">
                    <Skeleton className="h-3 w-1/2" />
                    <Skeleton className="h-8 w-3/4" />
                  </div>
                ) : (
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0 flex-1">
                      <div className="text-[11px] sm:text-[13px] text-slate-500 truncate">{cfg.label}</div>
                      <div className="mt-1 text-xl sm:text-2xl font-semibold text-slate-900 tabular-nums tracking-tight">
                        {formatNumber(value)}
                      </div>
                      <div className="mt-0.5 text-[10px] sm:text-[11px] text-slate-400 truncate">{cfg.desc}</div>
                      {trendBadge && (
                        <Badge
                          variant="secondary"
                          className={`mt-1.5 px-1.5 py-0 text-[10px] font-normal ${
                            trendBadge.tone === 'up'
                              ? 'bg-emerald-100/70 text-emerald-700'
                              : trendBadge.tone === 'down'
                              ? 'bg-red-100/70 text-red-700'
                              : 'bg-slate-100 text-slate-600'
                          }`}
                        >
                          {trendBadge.label}
                        </Badge>
                      )}
                    </div>
                    <div className={`shrink-0 rounded-lg ${cfg.iconBg} ${cfg.iconColor} p-1.5 sm:p-2`}>
                      <Icon className="w-4 h-4 sm:w-[18px] sm:h-[18px]" />
                    </div>
                  </div>
                )}
              </CardContent>
            </Card>
          );
        })}
      </section>

      {/* ====== Contributor Overview ====== */}
      <Card className="border-slate-200/70 bg-gradient-to-r from-indigo-50/60 via-white to-violet-50/40">
        <CardContent className="p-3.5 sm:p-4 flex flex-wrap items-center gap-3">
          <div className="shrink-0 rounded-lg p-2 bg-indigo-100/80 text-indigo-600">
            <UploadCloud className="w-4 h-4 sm:w-5 sm:h-5" />
          </div>
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium text-slate-900">资料贡献管理</div>
            <div className="text-xs text-slate-500 mt-0.5 flex flex-wrap items-center gap-x-2.5 gap-y-1">
              <span>查看贡献者提交的产品资料与审核记录</span>
              {contributor && (
                <>
                  <span className="text-slate-300">·</span>
                  <span>贡献者 <span className="text-slate-700 font-medium">{formatNumber(contributor.total)}</span> 位</span>
                  <span className="text-slate-300">·</span>
                  <span>待审核 <span className="text-amber-600 font-medium">{formatNumber(contributor.pending)}</span> 项</span>
                </>
              )}
            </div>
          </div>
          <Button variant="default" size="sm" className="h-8" onClick={() => navigate('/admin/contributor')}>
            前往审核 <ArrowRight className="w-3.5 h-3.5 ml-1" />
          </Button>
        </CardContent>
      </Card>

      {/* ====== Two-Column Lists ====== */}
      <section className="grid grid-cols-1 xl:grid-cols-2 gap-4">
        {/* Pending Audit */}
        <Card className="border-slate-200/70 flex flex-col">
          <CardHeader className="p-3.5 pb-2 flex flex-row items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <AlertCircle className="w-4 h-4 text-amber-500" />
                知识库待审核
                {auditTotal > 0 && (
                  <Badge variant="secondary" className="bg-amber-100 text-amber-700">{auditTotal}</Badge>
                )}
              </CardTitle>
            </div>
            <div className="shrink-0 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={selectedAuditIds.size === 0 || batchRunning === 'audit'}
                onClick={() => doBatchAudit('approve')}
                className="h-7 text-xs"
              >
                <CheckCircle2 className="w-3.5 h-3.5 mr-1 text-emerald-600" />
                通过{selectedAuditIds.size > 0 ? `(${selectedAuditIds.size})` : ''}
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selectedAuditIds.size === 0 || batchRunning === 'audit'}
                onClick={() => doBatchAudit('reject')}
                className="h-7 text-xs"
              >
                <XCircle className="w-3.5 h-3.5 mr-1 text-red-600" />
                拒绝{selectedAuditIds.size > 0 ? `(${selectedAuditIds.size})` : ''}
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            {loading ? (
              <div className="space-y-2 px-2 py-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : auditItems.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <CheckCircle2 className="w-10 h-10 text-emerald-400/70 mb-2" />
                <div className="text-sm">暂无待审核内容</div>
                <div className="text-xs text-slate-400 mt-0.5">审核队列已清空，辛苦！</div>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                <li className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-500 sticky top-0 bg-white/80 backdrop-blur z-[1]">
                  <Checkbox
                    checked={auditItems.length > 0 && selectedAuditIds.size === auditItems.length}
                    onCheckedChange={(v) => {
                      if (v) setSelectedAuditIds(new Set(auditItems.map((a) => a.id)));
                      else setSelectedAuditIds(new Set());
                    }}
                    aria-label="全选"
                  />
                  <span>全选</span>
                  {batchRunning === 'audit' && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                </li>
                {auditItems.map((it) => (
                  <li key={it.id} className="group flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50/70 rounded-md transition">
                    <Checkbox
                      checked={selectedAuditIds.has(it.id)}
                      onCheckedChange={(v) => {
                        const ns = new Set(selectedAuditIds);
                        if (v) ns.add(it.id); else ns.delete(it.id);
                        setSelectedAuditIds(ns);
                      }}
                      aria-label={getAuditDisplayName(it)}
                    />
                    <div className="min-w-0 flex-1">
                      <div className="text-sm text-slate-800 truncate">{getAuditDisplayName(it)}</div>
                      <div className="text-[11px] text-slate-400 truncate">
                        {it.uploaderName || it.submitted_by || '匿名'} · {relativeTime(getAuditTimestamp(it))}
                      </div>
                    </div>
                    <Button
                      variant="ghost"
                      size="sm"
                      className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition h-auto min-h-[32px]! px-2 py-1 text-xs"
                      onClick={() => openAuditDetail(it)}
                    >
                      审核 <ChevronRight className="w-3 h-3 ml-0.5" />
                    </Button>
                  </li>
                ))}
              </ul>
            )}
            {auditTotal > auditItems.length && (
              <div className="text-center pt-2">
                <Button variant="ghost" size="sm" onClick={() => navigate('/admin/audit')}>
                  查看全部 {auditTotal} 项待审核 <ArrowRight className="w-4 h-4 ml-1" />
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* Recent Uploads */}
        <Card className="border-slate-200/70 flex flex-col">
          <CardHeader className="p-3.5 pb-2 flex flex-row items-center justify-between gap-3">
            <div className="min-w-0">
              <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
                <UploadCloud className="w-4 h-4 text-sky-500" />
                最近上传
                {uploads.length > 0 && (
                  <Badge variant="secondary" className="bg-sky-100 text-sky-700">{uploads.length}</Badge>
                )}
              </CardTitle>
            </div>
            <div className="shrink-0 flex flex-wrap gap-1.5">
              <Button
                size="sm"
                variant="outline"
                disabled={selectedUploadIds.size === 0}
                onClick={() => doBatchUploadsAction('preview_all')}
                className="h-7 text-xs"
              >
                <Eye className="w-3.5 h-3.5 mr-1 text-sky-600" />
                复制链接
              </Button>
              <Button
                size="sm"
                variant="outline"
                disabled={selectedUploadIds.size === 0 || batchRunning === 'uploads'}
                onClick={() => doBatchUploadsAction('delete')}
                className="h-7 text-xs"
              >
                <Trash2 className="w-3.5 h-3.5 mr-1 text-red-600" />
                删除
              </Button>
            </div>
          </CardHeader>
          <CardContent className="p-2 pt-0">
            {loading ? (
              <div className="space-y-2 px-2 py-1">
                {Array.from({ length: 3 }).map((_, i) => (
                  <Skeleton key={i} className="h-12 w-full rounded-md" />
                ))}
              </div>
            ) : uploads.length === 0 ? (
              <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                <UploadCloud className="w-10 h-10 text-sky-300/70 mb-2" />
                <div className="text-sm">暂无最近上传</div>
              </div>
            ) : (
              <ul className="divide-y divide-slate-100">
                <li className="flex items-center gap-2 px-2 py-1.5 text-xs text-slate-500 sticky top-0 bg-white/80 backdrop-blur z-[1]">
                  <Checkbox
                    checked={uploads.length > 0 && selectedUploadIds.size === uploads.length}
                    onCheckedChange={(v) => {
                      if (v) setSelectedUploadIds(new Set(uploads.map((u) => u.id)));
                      else setSelectedUploadIds(new Set());
                    }}
                    aria-label="全选"
                  />
                  <span>全选</span>
                  {batchRunning === 'uploads' && <Loader2 className="w-3 h-3 animate-spin ml-auto" />}
                </li>
                {uploads.map((u) => {
                  const url = getUploadFileUrl(u);
                  return (
                    <li key={u.id} className="group flex items-center gap-2 px-2 py-1.5 hover:bg-slate-50/70 rounded-md transition">
                      <Checkbox
                        checked={selectedUploadIds.has(u.id)}
                        onCheckedChange={(v) => {
                          const ns = new Set(selectedUploadIds);
                          if (v) ns.add(u.id); else ns.delete(u.id);
                          setSelectedUploadIds(ns);
                        }}
                        aria-label={getUploadDisplayName(u)}
                      />
                      <div className="min-w-0 flex-1">
                        <div className="text-sm text-slate-800 truncate">{getUploadDisplayName(u)}</div>
                        <div className="text-[11px] text-slate-400 truncate flex items-center gap-1.5">
                          <span className="inline-flex items-center px-1 rounded bg-slate-100/70 text-slate-500">
                            {getUploadStatusBadge(u)}
                          </span>
                          <span>{relativeTime(getUploadTimestamp(u))}</span>
                          {getUploadFileSize(u) ? <span>· {formatBytes(getUploadFileSize(u))}</span> : null}
                        </div>
                      </div>
                      <Button
                        variant="ghost"
                        size="sm"
                        className="opacity-100 lg:opacity-0 lg:group-hover:opacity-100 transition h-auto min-h-[32px]! px-2 py-1 text-xs"
                        disabled={!url}
                        onClick={() => url && window.open(url, '_blank', 'noopener')}
                      >
                        预览 <ChevronRight className="w-3 h-3 ml-0.5" />
                      </Button>
                    </li>
                  );
                })}
              </ul>
            )}
            <div className="text-center pt-2">
              <Button variant="ghost" size="sm" onClick={() => navigate('/admin/contributor')}>
                查看全部上传 <ArrowRight className="w-4 h-4 ml-1" />
              </Button>
            </div>
          </CardContent>
        </Card>
      </section>

      {/* ====== Quick Actions ====== */}
      <Card className="border-slate-200/70">
        <CardHeader className="p-3.5 pb-2 flex flex-row items-center justify-between gap-3">
          <div>
            <CardTitle className="text-[15px] font-semibold flex items-center gap-2">
              <Settings2 className="w-4 h-4 text-violet-500" />
              快速操作
              <Badge variant="secondary" className="bg-violet-100 text-violet-700">
                {qaEnabledActions.length}
              </Badge>
            </CardTitle>
          </div>
          <Dialog open={qaDialogOpen} onOpenChange={(v) => { if (!v) closeQaDialog(); else setQaDialogOpen(true); }}>
            <DialogTrigger asChild>
              <Button size="sm" variant="outline" className="h-8" onClick={openQaDialog}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                管理我的快捷入口
              </Button>
            </DialogTrigger>
            <DialogContent className="max-w-4xl h-[min(80vh,640px)] p-0 gap-0 flex flex-col overflow-hidden">
              <DialogHeader className="p-4 pb-3 border-b shrink-0">
                <DialogTitle>自定义快捷入口</DialogTitle>
                <DialogDescription>
                  从系统全部页面（来自 <span className="font-medium">system_pages</span> 和 <span className="font-medium">system_modules</span>）中勾选/取消，最大 24 项
                </DialogDescription>
              </DialogHeader>
              <div className="flex-1 grid grid-cols-1 md:grid-cols-[1.1fr_1fr] min-h-0 overflow-hidden">
                {/* 候选 */}
                <div className="flex flex-col min-h-0 border-r overflow-hidden">
                  <div className="p-3 border-b shrink-0">
                    <div className="relative">
                      <Search className="absolute left-2.5 top-1/2 -translate-y-1/2 w-4 h-4 text-slate-400" />
                      <Input
                        value={qaSearch}
                        onChange={(e) => setQaSearch(e.target.value)}
                        placeholder="搜索页面名称、key 或路径..."
                        className="pl-8 h-9"
                      />
                    </div>
                  </div>
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="p-3 space-y-4">
                      {qaLoading ? (
                        <div className="space-y-2">
                          {Array.from({ length: 6 }).map((_, i) => (
                            <Skeleton key={i} className="h-9 w-full rounded-md" />
                          ))}
                        </div>
                      ) : qaError ? (
                        <div className="text-sm text-red-500 py-6 text-center">{qaError}</div>
                      ) : filteredCandidates.length === 0 ? (
                        <div className="text-sm text-slate-400 py-6 text-center">无匹配项</div>
                      ) : (
                        filteredCandidates.map((g) => (
                          <div key={g.groupLabel}>
                            <div className="text-[11px] uppercase tracking-wider text-slate-400 px-1 mb-1.5">
                              {g.groupLabel}
                            </div>
                            <div className="space-y-1">
                              {g.items.map((c) => {
                                const picked = qaSelected.some((s) => s.action_type === c.action_type && s.action_key === c.action_key);
                                return (
                                  <button
                                    key={`${c.action_type}-${c.action_key}`}
                                    onClick={() => toggleQaSelect(c)}
                                    className={`w-full flex items-center gap-2 px-2.5 py-2 rounded-md text-left transition ${
                                      picked
                                        ? 'bg-violet-50 ring-1 ring-violet-200'
                                        : 'hover:bg-slate-50'
                                    }`}
                                  >
                                    {picked ? (
                                      <CheckSquare className="w-4 h-4 text-violet-600 shrink-0" />
                                    ) : (
                                      <Square className="w-4 h-4 text-slate-300 shrink-0" />
                                    )}
                                    <DynamicIcon name={c.icon} className="w-4 h-4 text-slate-500 shrink-0" />
                                    <div className="min-w-0 flex-1">
                                      <div className="text-sm text-slate-800 truncate">{c.label}</div>
                                      <div className="text-[11px] text-slate-400 truncate">{c.route}</div>
                                    </div>
                                    <Badge variant="secondary" className="bg-slate-100 text-slate-600 text-[10px] px-1">
                                      {c.action_type === 'module' ? '模块' : '子页面'}
                                    </Badge>
                                  </button>
                                );
                              })}
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
                {/* 已选 */}
                <div className="flex flex-col min-h-0 bg-slate-50/40 overflow-hidden">
                  <div className="p-3 border-b bg-white flex items-center justify-between shrink-0">
                    <div className="text-sm font-medium text-slate-800">
                      已选 <span className="text-violet-600">{qaSelected.length}</span> / 24
                    </div>
                    {qaSelected.length > 0 && (
                      <Button variant="ghost" size="sm" onClick={() => setQaSelected([])} className="h-7 text-xs">
                        清空
                      </Button>
                    )}
                  </div>
                  <ScrollArea className="flex-1 min-h-0">
                    <div className="p-3 space-y-1.5">
                      {qaSelected.length === 0 ? (
                        <div className="text-sm text-slate-400 py-8 text-center">
                          从左侧点击勾选条目
                        </div>
                      ) : (
                        qaSelected.map((s, idx) => (
                          <div
                            key={`${s.action_type}-${s.action_key}`}
                            className="flex items-center gap-2 px-2.5 py-2 rounded-md bg-white ring-1 ring-slate-200/80"
                          >
                            <GripVertical className="w-4 h-4 text-slate-300 shrink-0 cursor-grab" />
                            <DynamicIcon name={s.icon} className="w-4 h-4 text-slate-500 shrink-0" />
                            <div className="min-w-0 flex-1">
                              <div className="text-sm text-slate-800 truncate">{s.label}</div>
                              <div className="text-[11px] text-slate-400 truncate">{s.route}</div>
                            </div>
                            <div className="flex items-center gap-0.5">
                              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === 0} onClick={() => moveQaSelect(idx, -1)} aria-label="上移">
                                <span className="text-xs">↑</span>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7" disabled={idx === qaSelected.length - 1} onClick={() => moveQaSelect(idx, 1)} aria-label="下移">
                                <span className="text-xs">↓</span>
                              </Button>
                              <Button variant="ghost" size="icon" className="h-7 w-7 text-slate-400 hover:text-red-500" onClick={() => removeQaSelect(idx)} aria-label="移除">
                                <X className="w-3.5 h-3.5" />
                              </Button>
                            </div>
                          </div>
                        ))
                      )}
                    </div>
                  </ScrollArea>
                </div>
              </div>
              <DialogFooter className="p-3 border-t bg-white shrink-0">
                <Button variant="ghost" onClick={closeQaDialog}>取消</Button>
                <Button onClick={saveQa} disabled={qaSaving}>
                  {qaSaving && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                  保存设置
                </Button>
              </DialogFooter>
            </DialogContent>
          </Dialog>
        </CardHeader>
        <CardContent className="p-3.5 pt-2">
          {loading ? (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full rounded-lg" />
              ))}
            </div>
          ) : qaEnabledActions.length === 0 ? (
            <div className="flex flex-col items-center justify-center py-6 text-slate-400 gap-2">
              <Settings2 className="w-7 h-7 text-slate-300" />
              <div className="text-sm">还没有快捷入口</div>
              <Button size="sm" variant="outline" className="h-7 text-xs" onClick={openQaDialog}>
                <Plus className="w-3.5 h-3.5 mr-1" />
                去添加
              </Button>
            </div>
          ) : (
            <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-4 gap-2.5">
              {qaEnabledActions.map((s, idx) => (
                <button
                  key={`${s.action_type}-${s.action_key}`}
                  onClick={() => navigate(s.route)}
                  className="group flex items-center gap-3 rounded-lg border border-slate-200/80 bg-white hover:border-violet-300 hover:shadow-sm px-3 py-2.5 transition text-left"
                  style={{ animationDelay: `${idx * 30}ms` }}
                >
                  <div className="shrink-0 rounded-md bg-violet-100/80 text-violet-600 p-1.5 group-hover:bg-violet-600 group-hover:text-white transition">
                    <DynamicIcon name={s.icon} className="w-4 h-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="text-sm font-medium text-slate-800 truncate">{s.label}</div>
                    <div className="text-[10px] text-slate-400 truncate">{(s.route || '').replace(/^\//, '')}</div>
                  </div>
                </button>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* Hidden footer hint */}
      <p className="text-[11px] text-slate-400 text-center py-2">
        本次数据刷新于 {lastRefresh ? new Date(lastRefresh).toLocaleString('zh-CN', { hour12: false }) : '—'}
      </p>
    </div>
  );
}
