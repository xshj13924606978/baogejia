'use client';

import { useEffect, useState } from 'react';
import { useSearchParams } from 'next/navigation';
import { QRCodeCanvas } from 'qrcode.react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, RefreshCw, QrCode, CheckCircle2, XCircle, Users, FileText, Gift, Eye, PencilLine, Paperclip, Download, Trash2 } from 'lucide-react';
import {
  CONTRIBUTOR_TYPE_LABELS,
  CONTRIBUTOR_FORM_DEFS,
  UPLOAD_STATUS_LABELS,
  ContributorType,
  UploadStatus,
} from '@/lib/contributor/types';

// 字段 key → 中文 label（合并所有资料类型字段，管理端展示用）
const FIELD_LABEL_MAP: Record<string, string> = Object.values(CONTRIBUTOR_FORM_DEFS).reduce(
  (acc, def) => {
    for (const field of def.fields) {
      if (!acc[field.name]) acc[field.name] = field.label;
    }
    return acc;
  },
  {} as Record<string, string>
);

// 产品表字段中文映射（产品修改请求弹窗展示用）
const PRODUCT_FIELD_LABEL_MAP: Record<string, string> = {
  name: '产品名称',
  model: '规格型号',
  brand: '品牌',
  category: '分类',
  parameter_description: '参数描述',
  description: '详细描述',
  price: '价格',
  cost_price: '成本价',
  min_price: '最低价',
  supplier: '供应商',
  contact_person: '联系人',
  contact_phone: '联系电话',
  stock: '库存',
  image_url: '图片',
  unit: '单位',
};

const FIELD_LABEL = (key: string): string => FIELD_LABEL_MAP[key] || PRODUCT_FIELD_LABEL_MAP[key] || key;

// 资料类型 → 概要字段（表格列表展示核心内容）
const TYPE_SUMMARY_FIELD: Record<string, string> = {
  product: 'name',
  document: 'doc_title',
  case: 'case_name',
  standard: 'standard_name',
  drawing: 'drawing_name',
  quota: 'quota_name',
};

interface Contributor {
  id: string;
  user_id: string | null;
  phone: string | null;
  email: string | null;
  name: string | null;
  created_at: string;
  last_active_at: string | null;
}

interface Upload {
  id: string;
  contributor_id: string;
  type: string;
  data: Record<string, unknown>;
  files: string[];
  status: string;
  reviewer_id: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  points_awarded: number;
  created_at: string;
  contributors?: { name: string | null; email: string | null; phone: string | null } | null;
}

// 产品修改审批请求（#20260820-1130-2）
interface ProductUpdateRequestItem {
  id: string;
  source_id: string | null;
  product_id?: string;
  original_data?: Record<string, unknown> | null;
  new_data?: Record<string, unknown>;
  reason: string;
  request_type: 'edit' | 'import';
  status: 'pending' | 'approved' | 'rejected';
  requester_id: string | null;
  requester_name: string | null;
  reviewer_id: string | null;
  review_comment: string | null;
  reviewed_at: string | null;
  created_at: string;
  // 聚合字段（同一 source_id 下多条合并为一批次）
  product_count?: number;
  product?: {
    id: string;
    name: string | null;
    model: string | null;
    image_url?: string | null;
    category?: string | null;
    price?: number | null;
  } | null;
  products?: {
    id: string;
    name: string | null;
    model: string | null;
    image_url: string | null;
    category: string | null;
    price: number | null;
  }[];
  items?: ProductUpdateRequestItem[];
}

export default function AdminContributorPage() {
  const { toast } = useToast();
  const searchParams = useSearchParams();
  const initialTab = searchParams.get('tab') || 'pending';
  const [activeTab, setActiveTab] = useState<string>(initialTab);
  const [contributors, setContributors] = useState<Contributor[]>([]);
  const [uploads, setUploads] = useState<Upload[]>([]);
  const [loadingContributors, setLoadingContributors] = useState(false);
  const [loadingUploads, setLoadingUploads] = useState(false);
  const [reviewTarget, setReviewTarget] = useState<Upload | null>(null);
  const [viewTarget, setViewTarget] = useState<Upload | null>(null);
  const [reviewComment, setReviewComment] = useState('');
  const [reviewing, setReviewing] = useState(false);
  const [qrUrl, setQrUrl] = useState('');
  const [qrLoading, setQrLoading] = useState(false);
  // 产品修改审批请求（#20260820-1130-2）
  const [productRequests, setProductRequests] = useState<ProductUpdateRequestItem[]>([]);
  const [loadingRequests, setLoadingRequests] = useState(false);
  const [requestViewTarget, setRequestViewTarget] = useState<ProductUpdateRequestItem | null>(null);
  const [requestReviewTarget, setRequestReviewTarget] = useState<ProductUpdateRequestItem | null>(null);
  const [requestComment, setRequestComment] = useState('');
  const [requestReviewing, setRequestReviewing] = useState(false);
  // 待审核数量角标（#20260821-1837）
  const [pendingCounts, setPendingCounts] = useState({ uploadPending: 0, requestPending: 0 });
  // 附件在线预览（#20260820-1130-3）
  const [previewFile, setPreviewFile] = useState<{ url: string; name: string; fileKey: string; isObjectUrl?: boolean } | null>(null);
  // 批量选择（#[20260822-1000]-2）
  const [selectedUploads, setSelectedUploads] = useState<Set<string>>(new Set());
  const [selectedRequests, setSelectedRequests] = useState<Set<string>>(new Set());
  const [batchProcessing, setBatchProcessing] = useState(false);
  const [batchComment, setBatchComment] = useState('');
  const [batchDialog, setBatchDialog] = useState<{
    type: 'upload' | 'request';
    action: 'approve' | 'reject' | 'delete';
  } | null>(null);

  const loadContributors = async () => {
    setLoadingContributors(true);
    try {
      const res = await fetch('/api/admin/contributor/list');
      const data = await res.json();
      if (data.success) setContributors(data.contributors || []);
      else toast({ title: '加载失败', description: data.error || '获取贡献者列表失败', variant: 'destructive' });
    } catch {
      toast({ title: '加载失败', description: '网络错误', variant: 'destructive' });
    } finally {
      setLoadingContributors(false);
    }
  };

  const loadUploads = async (status = activeTab) => {
    setLoadingUploads(true);
    try {
      const res = await fetch(`/api/admin/uploads/pending?status=${status}`);
      const data = await res.json();
      if (data.success) {
        setUploads(data.uploads || []);
        setSelectedUploads(new Set());
        loadPendingCounts();
      } else toast({ title: '加载失败', description: data.error || '获取资料列表失败', variant: 'destructive' });
    } catch {
      toast({ title: '加载失败', description: '网络错误', variant: 'destructive' });
    } finally {
      setLoadingUploads(false);
    }
  };

  useEffect(() => {
    loadUploads();
    loadPendingCounts();
    // 从顶部横幅跳转 ?tab=requests 时直接加载产品修改请求（#20260821-1837-1）
    if (initialTab === 'requests') {
      loadProductRequests('pending');
    }
  }, []);

  const handleTabChange = (value: string) => {
    setActiveTab(value);
    // 切换 Tab 时清空批量选择，避免跨状态误操作（#[20260822-1000]-3）
    setSelectedUploads(new Set());
    setSelectedRequests(new Set());
    if (value === 'contributors') loadContributors();
    else if (value === 'qrcode') generateQr();
    else if (value === 'requests') loadProductRequests();
    else loadUploads(value);
  };

  // 加载产品修改审批请求（#20260820-1130-2）
  const loadProductRequests = async (status = 'pending') => {
    setLoadingRequests(true);
    try {
      const res = await fetch(`/api/admin/contributor/requests?status=${status}`);
      const data = await res.json();
      if (data.success) {
        setProductRequests(data.requests || []);
        loadPendingCounts();
      } else toast({ title: '加载失败', description: data.error || '获取产品修改请求失败', variant: 'destructive' });
    } catch {
      toast({ title: '加载失败', description: '网络错误', variant: 'destructive' });
    } finally {
      setLoadingRequests(false);
    }
  };

  // 加载待审核数量角标（#20260821-1837）
  const loadPendingCounts = async () => {
    try {
      const res = await fetch('/api/admin/contributor/pending-count');
      const data = await res.json();
      if (data.success) {
        setPendingCounts({
          uploadPending: data.uploadPending || 0,
          requestPending: data.requestPending || 0,
        });
      }
    } catch {
      // 静默失败，不影响主流程
    }
  };

  // 审批产品修改请求（通过/拒绝）
  const submitRequestReview = async (decision: 'approved' | 'rejected') => {
    if (!requestReviewTarget) return;
    if (decision === 'rejected' && !requestComment.trim()) {
      toast({ title: '请填写拒绝原因', description: '拒绝请求时必须填写原因', variant: 'destructive' });
      return;
    }
    setRequestReviewing(true);
    try {
      const res = await fetch(`/api/admin/contributor/requests/${requestReviewTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ decision, comment: requestComment }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: decision === 'approved' ? '已通过' : '已拒绝',
          description: data.message || '操作成功',
        });
        setRequestReviewTarget(null);
        setRequestComment('');
        loadProductRequests('pending');
        loadPendingCounts();
      } else {
        toast({ title: '操作失败', description: data.error || '审批失败', variant: 'destructive' });
      }
    } catch {
      toast({ title: '操作失败', description: '网络错误', variant: 'destructive' });
    } finally {
      setRequestReviewing(false);
    }
  };

  const getAttachmentName = (fileKey: string, originalName?: string): string => {
    if (originalName) return originalName;
    const raw = fileKey.split('/').pop() || fileKey;
    try {
      return decodeURIComponent(raw);
    } catch {
      return raw;
    }
  };

  const getOriginalFileName = (upload: Upload | undefined): string => {
    const names = upload?.data?.__originalFileNames as Record<string, string> | undefined;
    if (!names) return '';
    return Object.values(names).find((n) => n && n.trim()) || '';
  };

  // 下载资料附件（knowledge-base bucket，经服务端流式返回，绕开公开 URL 策略）
  const handleDownloadAttachment = async (fileKey: string, fileName?: string) => {
    try {
      const res = await fetch(
        `/api/contributor/attachment-download?fileKey=${encodeURIComponent(fileKey)}${
          fileName ? `&fileName=${encodeURIComponent(fileName)}` : ''
        }`
      );
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: '下载失败', description: data.error || '获取文件失败', variant: 'destructive' });
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = fileName || getAttachmentName(fileKey);
      a.click();
      setTimeout(() => window.URL.revokeObjectURL(url), 60_000);
    } catch {
      toast({ title: '下载失败', description: '网络错误', variant: 'destructive' });
    }
  };

  // 打开资料附件（直接下载，避免公开 URL 在浏览器中无法打开）
  const handleOpenAttachment = async (fileKey: string, fileName?: string) => {
    await handleDownloadAttachment(fileKey, fileName);
  };

  // 附件是否支持在线预览（图片 / PDF，浏览器可内嵌展示）
  const isPreviewable = (fileName: string): boolean => {
    const ext = (fileName.split('.').pop() || '').toLowerCase();
    return ['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp', 'pdf'].includes(ext);
  };

  // 在线预览附件（通过服务端流式下载后生成 objectURL，绕开公开 URL 策略）
  const handlePreviewAttachment = async (fileKey: string, fileName?: string) => {
    try {
      const res = await fetch(`/api/contributor/attachment-download?fileKey=${encodeURIComponent(fileKey)}`);
      if (!res.ok) {
        const data = await res.json().catch(() => ({}));
        toast({ title: '预览失败', description: data.error || '获取文件失败', variant: 'destructive' });
        return;
      }
      const blob = await res.blob();
      const url = window.URL.createObjectURL(blob);
      setPreviewFile({ url, name: fileName || getAttachmentName(fileKey), fileKey, isObjectUrl: true });
    } catch {
      toast({ title: '预览失败', description: '网络错误', variant: 'destructive' });
    }
  };

  const generateQr = async () => {
    setQrLoading(true);
    try {
      const res = await fetch('/api/admin/qrcode/generate');
      const data = await res.json();
      if (data.success) setQrUrl(data.url);
      else toast({ title: '生成失败', description: data.error || '生成二维码失败', variant: 'destructive' });
    } catch {
      toast({ title: '生成失败', description: '网络错误', variant: 'destructive' });
    } finally {
      setQrLoading(false);
    }
  };

  const submitReview = async (status: UploadStatus) => {
    if (!reviewTarget) return;
    setReviewing(true);
    try {
      const res = await fetch(`/api/admin/uploads/${reviewTarget.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status, comment: reviewComment }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: status === 'approved' ? '已通过' : '已拒绝',
          description:
            status === 'approved'
              ? `审核通过，已发放 ${reviewTarget.points_awarded || getPoints(reviewTarget.type)} 积分奖励`
              : '资料已拒绝',
        });
        setReviewTarget(null);
        setReviewComment('');
        loadUploads(activeTab);
      } else {
        toast({ title: '操作失败', description: data.error || '审核失败', variant: 'destructive' });
      }
    } catch {
      toast({ title: '操作失败', description: '网络错误', variant: 'destructive' });
    } finally {
      setReviewing(false);
    }
  };

  // 批量选择（#[20260822-1000]-2）
  const toggleUploadSelection = (id: string) => {
    setSelectedUploads((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllUploads = () => {
    if (uploads.length > 0 && selectedUploads.size === uploads.length) {
      setSelectedUploads(new Set());
    } else {
      setSelectedUploads(new Set(uploads.map((u) => u.id)));
    }
  };
  const toggleRequestSelection = (id: string) => {
    setSelectedRequests((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };
  const toggleAllRequests = () => {
    if (productRequests.length > 0 && selectedRequests.size === productRequests.length) {
      setSelectedRequests(new Set());
    } else {
      setSelectedRequests(new Set(productRequests.map((r) => r.id)));
    }
  };

  const submitBatchUploads = async (action: 'approve' | 'reject' | 'delete') => {
    const ids = Array.from(selectedUploads);
    if (ids.length === 0) return;
    setBatchProcessing(true);
    try {
      const res = await fetch('/api/admin/uploads/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, comment: batchComment }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: '批量操作成功',
          description: `成功处理 ${data.successCount} 条资料`,
        });
        setSelectedUploads(new Set());
        setBatchDialog(null);
        setBatchComment('');
        loadUploads(activeTab);
      } else {
        toast({
          title: data.failedCount ? `完成 ${data.successCount} 条，失败 ${data.failedCount} 条` : '批量操作失败',
          description: data.errors?.[0] || data.error || '请重试',
          variant: 'destructive',
        });
        if (data.successCount > 0) {
          setSelectedUploads(new Set());
          setBatchDialog(null);
          setBatchComment('');
          loadUploads(activeTab);
        }
      }
    } catch {
      toast({ title: '操作失败', description: '网络错误', variant: 'destructive' });
    } finally {
      setBatchProcessing(false);
    }
  };

  const submitBatchRequests = async (action: 'approve' | 'reject' | 'delete') => {
    const ids = Array.from(selectedRequests);
    if (ids.length === 0) return;
    setBatchProcessing(true);
    try {
      const res = await fetch('/api/admin/contributor/requests/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, action, comment: batchComment }),
      });
      const data = await res.json();
      if (data.success) {
        toast({
          title: '批量操作成功',
          description: `成功处理 ${data.successCount} 条请求`,
        });
        setSelectedRequests(new Set());
        setBatchDialog(null);
        setBatchComment('');
        loadProductRequests('pending');
      } else {
        toast({
          title: data.failedCount ? `完成 ${data.successCount} 条，失败 ${data.failedCount} 条` : '批量操作失败',
          description: data.errors?.[0] || data.error || '请重试',
          variant: 'destructive',
        });
        if (data.successCount > 0) {
          setSelectedRequests(new Set());
          setBatchDialog(null);
          setBatchComment('');
          loadProductRequests('pending');
        }
      }
    } catch {
      toast({ title: '操作失败', description: '网络错误', variant: 'destructive' });
    } finally {
      setBatchProcessing(false);
    }
  };

  // 积分规则：动态从 /api/contributor/points-rules 读取（#[20260827-1030]-8）
  //   默认值与迁移 085 种子一致；DB 不可达或接口失败时保留 fallback。
  //   管理员在后台调整 points_rules 后刷新即生效（30s 内）。
  const DEFAULT_UPLOAD_POINTS_RULES: Record<string, number> = {
    product: 50,
    document: 80,
    case: 60,
    standard: 80,
    drawing: 40,
    quota: 50,
  };
  const [uploadPointsRules, setUploadPointsRules] = useState<Record<string, number>>(
    DEFAULT_UPLOAD_POINTS_RULES
  );

  useEffect(() => {
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/contributor/points-rules', { cache: 'no-store' });
        if (!res.ok) return;
        const json = await res.json();
        if (cancelled || !json?.data?.upload) return;
        setUploadPointsRules({ ...DEFAULT_UPLOAD_POINTS_RULES, ...json.data.upload });
      } catch (err) {
        console.warn('[Admin Contributor] 获取积分规则失败:', err);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  const getPoints = (type: string): number => {
    return uploadPointsRules[type] ?? 0;
  };

  const getSummary = (upload: Upload): string => {
    const data = upload.data || {};
    const key = TYPE_SUMMARY_FIELD[upload.type];
    if (key && data[key]) return String(data[key]);
    const first = Object.entries(data).find(([, v]) => v !== null && v !== undefined && v !== '');
    return first ? String(first[1]) : '（无摘要）';
  };

  const renderUploadData = (upload: Upload) => {
    const data = upload.data || {};
    const entries = Object.entries(data).filter(([key, value]) => {
      if (value === null || value === undefined || value === '') return false;
      // 隐藏纯辅助字段
      if (key === 'products') return false;
      // 判重处理辅助字段（#20260821-1545-1）：以顶部提示形式单独展示
      if (key === 'duplicateAction' || key === 'duplicateReason') return false;
      // 原始文件名映射为内部结构，不直接展示（#[20260822-2242]-6）
      if (key === '__originalFileNames') return false;
      return true;
    });
    const duplicateAction = data.duplicateAction as string | undefined;
    const duplicateReason = (data.duplicateReason as string) || '';
    return (
      <div className="space-y-1 text-sm">
        {duplicateAction === 'overwrite' && (
          <div className="rounded border border-amber-200 bg-amber-50 p-2 text-xs text-amber-800">
            <p className="font-medium">该上传包含「覆盖更新」请求</p>
            {duplicateReason && <p className="mt-0.5">理由：{duplicateReason}</p>}
            {upload.type === 'product' ? (
              <p className="mt-0.5 text-amber-700/70">
                审核通过后，重复产品将创建产品修改请求，需在「产品修改请求」中另行审批。
              </p>
            ) : (
              <p className="mt-0.5 text-amber-700/70">
                审核通过后，重复资料将被本次数据覆盖更新。
              </p>
            )}
          </div>
        )}
        {duplicateAction === 'skip' && (
          <div className="rounded border border-sky-200 bg-sky-50 p-2 text-xs text-sky-800">
            {upload.type === 'product'
              ? '该上传已选择「跳过重复」：重复产品不会入库，仅导入不重复产品。'
              : '该上传已选择「跳过重复」：重复资料不会采纳，仅导入不重复资料。'}
          </div>
        )}
        {entries.map(([key, value]) => {
          // 数组数据（如价格表导入的 products）以表格形式展示
          if (Array.isArray(value)) {
            return (
              <div key={key} className="space-y-1">
                <span className="text-gray-500">{FIELD_LABEL(key)}：共 {value.length} 条</span>
                <div className="max-h-48 overflow-y-auto rounded border bg-gray-50 p-2">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        {Object.keys((value[0] as Record<string, unknown>) || {}).map((k) => (
                          <TableHead key={k} className="text-xs whitespace-nowrap">{FIELD_LABEL(k)}</TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {value.map((item, idx) => (
                        <TableRow key={idx}>
                          {Object.values((item as Record<string, unknown>) || {}).map((v, vi) => (
                            <TableCell key={vi} className="text-xs whitespace-nowrap">
                              {v === null || v === undefined || v === '' ? '-' : String(v)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              </div>
            );
          }
          return (
            <div key={key} className="flex gap-2">
              <span className="text-gray-500 min-w-24 shrink-0">{FIELD_LABEL(key)}：</span>
              <span className="text-gray-700 break-all">{String(value)}</span>
            </div>
          );
        })}
        {upload.files && upload.files.length > 0 && (
          <div className="flex gap-2">
            <span className="text-gray-500 min-w-24 shrink-0">附件：</span>
            <div className="flex flex-wrap gap-2">
              {upload.files.map((fileKey, i) => {
                const fileName = getAttachmentName(fileKey, getOriginalFileName(upload));
                return (
                  <div key={i} className="flex items-center gap-1">
                    <button
                      onClick={() => handleOpenAttachment(fileKey, fileName)}
                      className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-sky-50 text-sky-700 hover:bg-sky-100 text-xs border border-sky-200 transition-colors"
                      title="下载"
                    >
                      <Paperclip className="w-3 h-3" />
                      {fileName}
                    </button>
                    {isPreviewable(fileName) && (
                      <button
                        onClick={() => handlePreviewAttachment(fileKey, fileName)}
                        className="inline-flex items-center gap-1 px-2 py-0.5 rounded bg-emerald-50 text-emerald-700 hover:bg-emerald-100 text-xs border border-emerald-200 transition-colors"
                        title="在线预览"
                      >
                        <Eye className="w-3 h-3" />预览
                      </button>
                    )}
                    {i < (upload.files?.length || 0) - 1 && <span className="text-gray-300">|</span>}
                  </div>
                );
              })}
            </div>
          </div>
        )}
      </div>
    );
  };

  // 渲染产品修改请求的字段变更（original → new 对比）
  const renderRequestChanges = (req: ProductUpdateRequestItem) => {
    const original = (req.original_data || {}) as Record<string, unknown>;
    const incoming = (req.new_data || {}) as Record<string, unknown>;
    const ignore = new Set([
      'id', 'created_at', 'updated_at', 'creator_id', 'product_id',
      'reviewer_id', 'reviewed_at', 'status', 'request_type', 'reason',
      'search_vector', // 数据库生成列，不展示
    ]);
    // 导入/编辑请求只应展示「新数据中明确包含的字段」的变更；
    // 新数据未提供的字段不视为删除，避免导入表格缺少库存等字段时被误判为变更（#20260821-1837-2）。
    const changes = Object.keys(incoming).filter((key) => {
      if (ignore.has(key)) return false;
      const oldVal = original[key];
      const newVal = incoming[key];
      if (oldVal === undefined || oldVal === null || oldVal === '') {
        return newVal !== undefined && newVal !== null && newVal !== '';
      }
      return String(oldVal) !== String(newVal ?? '');
    });
    if (changes.length === 0) {
      return <p className="text-gray-400">未检测到可展示的字段变更</p>;
    }
    return (
      <div className="space-y-2">
        {changes.map((key) => {
          const oldVal = original[key];
          const newVal = incoming[key];
          return (
            <div key={key} className="rounded border border-slate-200 dark:border-slate-700 p-2">
              <p className="font-medium text-gray-600 dark:text-gray-300 mb-1">{FIELD_LABEL(key)}</p>
              <div className="flex gap-3 text-xs">
                <div className="flex-1">
                  <p className="text-gray-400 mb-0.5">当前值</p>
                  <p className="text-gray-600 dark:text-gray-300 break-all">
                    {oldVal === undefined || oldVal === null || oldVal === '' ? '—' : String(oldVal)}
                  </p>
                </div>
                <div className="flex-1">
                  <p className="text-sky-500 mb-0.5">新值</p>
                  <p className="text-sky-700 dark:text-sky-400 break-all">
                    {newVal === undefined || newVal === null || newVal === '' ? '—' : String(newVal)}
                  </p>
                </div>
              </div>
            </div>
          );
        })}
      </div>
    );
  };

  // 按批次展示多个产品的修改详情（#20260821-1837）
  const renderBatchRequestChanges = (group: ProductUpdateRequestItem | null) => {
    if (!group) return null;
    const items = (group.items || [group]) as ProductUpdateRequestItem[];
    if (items.length === 0) return <p className="text-gray-400">未找到变更内容</p>;
    return (
      <div className="space-y-4 max-h-[55vh] overflow-y-auto pr-1">
        {items.map((item, idx) => {
          // 单条 item 优先使用关联的 product；聚合场景回退到 products 数组（#20260821-1837-1）
          const product = item.product || item.products?.[0];
          return (
            <div key={item.id || idx} className="rounded border border-slate-200 dark:border-slate-700 p-3">
              <p className="font-medium text-gray-800 dark:text-gray-200 mb-2">
                {product?.name || '产品不存在'}
                {product?.model ? ` · 型号：${product.model}` : ''}
              </p>
              {renderRequestChanges(item)}
            </div>
          );
        })}
      </div>
    );
  };

  const downloadQr = () => {
    const canvas = document.querySelector('#contributor-qr canvas') as HTMLCanvasElement | null;
    if (!canvas) return;
    const link = document.createElement('a');
    link.download = 'contributor-upload-qr.png';
    link.href = canvas.toDataURL('image/png');
    link.click();
  };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-gray-800">资料贡献管理</h1>
          <p className="text-sm text-gray-500 mt-1">管理资料贡献者、审核上传资料、生成上传入口二维码</p>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={handleTabChange}>
        <TabsList>
          <TabsTrigger value="pending" className="relative">
            <FileText className="w-4 h-4 mr-1" />待审核
            {pendingCounts.uploadPending > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                {pendingCounts.uploadPending}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="approved">
            <CheckCircle2 className="w-4 h-4 mr-1" />已通过
          </TabsTrigger>
          <TabsTrigger value="rejected">
            <XCircle className="w-4 h-4 mr-1" />已拒绝
          </TabsTrigger>
          <TabsTrigger value="requests" className="relative">
            <PencilLine className="w-4 h-4 mr-1" />产品修改
            {pendingCounts.requestPending > 0 && (
              <Badge variant="destructive" className="ml-1 h-4 min-w-4 px-1 text-[10px]">
                {pendingCounts.requestPending}
              </Badge>
            )}
          </TabsTrigger>
          <TabsTrigger value="contributors">
            <Users className="w-4 h-4 mr-1" />贡献者
          </TabsTrigger>
          <TabsTrigger value="qrcode">
            <QrCode className="w-4 h-4 mr-1" />二维码
          </TabsTrigger>
        </TabsList>

        {/* 待审核/已通过/已拒绝 */}
        {['pending', 'approved', 'rejected'].includes(activeTab) && (
          <TabsContent value={activeTab} className="space-y-4">
            <div className="flex items-center justify-between">
              <div className="flex items-center gap-2 flex-wrap">
                {uploads.length > 0 && (
                  <>
                    <span className="text-sm text-gray-500">已选 {selectedUploads.size} 项</span>
                    {activeTab === 'pending' && (
                      <>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => submitBatchUploads('approve')}
                          disabled={selectedUploads.size === 0 || batchProcessing}
                        >
                          <CheckCircle2 className="w-4 h-4 mr-1" />
                          批量通过
                        </Button>
                        <Button
                          size="sm"
                          variant="outline"
                          onClick={() => { setBatchComment(''); setBatchDialog({ type: 'upload', action: 'reject' }); }}
                          disabled={selectedUploads.size === 0 || batchProcessing}
                        >
                          <XCircle className="w-4 h-4 mr-1" />
                          批量拒绝
                        </Button>
                      </>
                    )}
                    <Button
                      size="sm"
                      variant="outline"
                      className="text-destructive"
                      onClick={() => { setBatchComment(''); setBatchDialog({ type: 'upload', action: 'delete' }); }}
                      disabled={selectedUploads.size === 0 || batchProcessing}
                    >
                      <Trash2 className="w-4 h-4 mr-1" />
                      批量删除
                    </Button>
                  </>
                )}
                {uploads.length === 0 && (
                  <p className="text-sm text-gray-500">{UPLOAD_STATUS_LABELS[activeTab as UploadStatus]}资料</p>
                )}
              </div>
              <Button variant="outline" size="sm" onClick={() => loadUploads(activeTab)}>
                <RefreshCw className="w-4 h-4 mr-1" />刷新
              </Button>
            </div>
            {loadingUploads ? (
              <div className="flex justify-center py-12">
                <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
              </div>
            ) : uploads.length === 0 ? (
              <Card>
                <CardContent className="py-12 text-center text-gray-400">暂无资料</CardContent>
              </Card>
            ) : (
              <Card>
                <CardContent className="pt-6">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={uploads.length > 0 && selectedUploads.size === uploads.length}
                            onCheckedChange={toggleAllUploads}
                            aria-label="全选"
                          />
                        </TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>内容摘要</TableHead>
                        <TableHead>贡献者</TableHead>
                        <TableHead>提交时间</TableHead>
                        <TableHead>状态</TableHead>
                        <TableHead className="text-right">操作</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {uploads.map((upload) => (
                        <TableRow key={upload.id} className="cursor-pointer" onClick={() => setViewTarget(upload)}>
                          <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedUploads.has(upload.id)}
                              onCheckedChange={() => toggleUploadSelection(upload.id)}
                              aria-label="选择该资料"
                            />
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">
                              {CONTRIBUTOR_TYPE_LABELS[upload.type as ContributorType] || upload.type}
                            </Badge>
                          </TableCell>
                          <TableCell className="max-w-64">
                            <span className="block truncate font-medium text-gray-700">
                              {getSummary(upload)}
                            </span>
                            {upload.points_awarded > 0 && (
                              <span className="flex items-center gap-1 text-xs text-green-600">
                                <Gift className="w-3 h-3" />已发放 {upload.points_awarded} 积分
                              </span>
                            )}
                          </TableCell>
                          <TableCell className="text-gray-600">
                            {upload.contributors?.name || upload.contributors?.email || upload.contributors?.phone || '未知'}
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-gray-500">
                            {new Date(upload.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell>
                            <Badge variant={upload.status === 'approved' ? 'default' : upload.status === 'rejected' ? 'destructive' : 'outline'}>
                              {UPLOAD_STATUS_LABELS[upload.status as UploadStatus]}
                            </Badge>
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="outline" onClick={() => setViewTarget(upload)}>
                                <Eye className="w-3.5 h-3.5 mr-1" />详情
                              </Button>
                              {upload.status === 'pending' && (
                                <Button size="sm" onClick={() => setReviewTarget(upload)}>
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />审核
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </CardContent>
              </Card>
            )}
          </TabsContent>
        )}

        {/* 产品修改审批（#20260820-1130-2） */}
        <TabsContent value="requests" className="space-y-4">
          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2 flex-wrap">
              {productRequests.length > 0 && (
                <>
                  <span className="text-sm text-gray-500">已选 {selectedRequests.size} 项</span>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => submitBatchRequests('approve')}
                    disabled={selectedRequests.size === 0 || batchProcessing}
                  >
                    <CheckCircle2 className="w-4 h-4 mr-1" />
                    批量通过
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    onClick={() => { setBatchComment(''); setBatchDialog({ type: 'request', action: 'reject' }); }}
                    disabled={selectedRequests.size === 0 || batchProcessing}
                  >
                    <XCircle className="w-4 h-4 mr-1" />
                    批量拒绝
                  </Button>
                  <Button
                    size="sm"
                    variant="outline"
                    className="text-destructive"
                    onClick={() => { setBatchComment(''); setBatchDialog({ type: 'request', action: 'delete' }); }}
                    disabled={selectedRequests.size === 0 || batchProcessing}
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    批量删除
                  </Button>
                </>
              )}
              {productRequests.length === 0 && (
                <p className="text-sm text-gray-500">
                  待审批的产品编辑/导入覆盖请求（审核通过后才会更新产品数据）
                </p>
              )}
            </div>
            <Button variant="outline" size="sm" onClick={() => loadProductRequests('pending')}>
              <RefreshCw className="w-4 h-4 mr-1" />刷新
            </Button>
          </div>
          {loadingRequests ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : productRequests.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-400">暂无待审批的产品修改请求</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead className="w-10">
                        <Checkbox
                          checked={productRequests.length > 0 && selectedRequests.size === productRequests.length}
                          onCheckedChange={toggleAllRequests}
                          aria-label="全选"
                        />
                      </TableHead>
                      <TableHead>产品</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>请求人</TableHead>
                      <TableHead>原因</TableHead>
                      <TableHead>提交时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {productRequests.map((req) => {
                      const firstProduct = req.products?.[0];
                      const productLabel =
                        (req.product_count || 1) > 1
                          ? `${firstProduct?.name || '（产品不存在）'} 等 ${req.product_count} 个产品`
                          : firstProduct?.name || '（产品不存在）';
                      return (
                        <TableRow key={req.id} className="cursor-pointer" onClick={() => setRequestViewTarget(req)}>
                          <TableCell className="w-10" onClick={(e) => e.stopPropagation()}>
                            <Checkbox
                              checked={selectedRequests.has(req.id)}
                              onCheckedChange={() => toggleRequestSelection(req.id)}
                              aria-label="选择该请求"
                            />
                          </TableCell>
                          <TableCell className="max-w-64">
                            <span className="block truncate font-medium text-gray-700" title={productLabel}>
                              {productLabel}
                            </span>
                            {firstProduct?.model && (
                              <span className="text-xs text-gray-400">型号：{firstProduct.model}</span>
                            )}
                          </TableCell>
                          <TableCell>
                            <Badge variant="outline">{req.request_type === 'edit' ? '编辑' : '导入覆盖'}</Badge>
                          </TableCell>
                          <TableCell className="text-gray-600">{req.requester_name || '未知'}</TableCell>
                          <TableCell className="max-w-48">
                            <span className="block truncate text-gray-500" title={req.reason || ''}>
                              {req.reason || '—'}
                            </span>
                          </TableCell>
                          <TableCell className="whitespace-nowrap text-gray-500">
                            {new Date(req.created_at).toLocaleString()}
                          </TableCell>
                          <TableCell className="text-right">
                            <div className="flex justify-end gap-1" onClick={(e) => e.stopPropagation()}>
                              <Button size="sm" variant="outline" onClick={() => setRequestViewTarget(req)}>
                                <Eye className="w-3.5 h-3.5 mr-1" />详情
                              </Button>
                              {req.status === 'pending' && (
                                <Button size="sm" onClick={() => setRequestReviewTarget(req)}>
                                  <CheckCircle2 className="w-3.5 h-3.5 mr-1" />审批
                                </Button>
                              )}
                            </div>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* 贡献者列表 */}
        <TabsContent value="contributors" className="space-y-4">
          <div className="flex items-center justify-between">
            <p className="text-sm text-gray-500">全部贡献者</p>
            <Button variant="outline" size="sm" onClick={loadContributors}>
              <RefreshCw className="w-4 h-4 mr-1" />刷新
            </Button>
          </div>
          {loadingContributors ? (
            <div className="flex justify-center py-12">
              <Loader2 className="w-6 h-6 animate-spin text-gray-400" />
            </div>
          ) : contributors.length === 0 ? (
            <Card>
              <CardContent className="py-12 text-center text-gray-400">暂无贡献者</CardContent>
            </Card>
          ) : (
            <Card>
              <CardContent className="pt-6">
                <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
                  {contributors.map((c) => (
                    <div key={c.id} className="border rounded-lg p-4 space-y-2">
                      <div className="flex items-center justify-between">
                        <span className="font-medium">{c.name || '匿名贡献者'}</span>
                        <Badge variant="outline">贡献者</Badge>
                      </div>
                      <p className="text-sm text-gray-500">{c.email || c.phone || '-'}</p>
                      <p className="text-xs text-gray-400">
                        注册时间：{new Date(c.created_at).toLocaleString()}
                      </p>
                      {c.last_active_at && (
                        <p className="text-xs text-gray-400">
                          最近活跃：{new Date(c.last_active_at).toLocaleString()}
                        </p>
                      )}
                    </div>
                  ))}
                </div>
              </CardContent>
            </Card>
          )}
        </TabsContent>

        {/* 二维码 */}
        <TabsContent value="qrcode">
          <Card className="max-w-md mx-auto">
            <CardHeader>
              <CardTitle className="flex items-center gap-2">
                <QrCode className="w-5 h-5 text-sky-600" />
                上传入口二维码
              </CardTitle>
              <CardDescription>扫描二维码即可打开公开上传页面</CardDescription>
            </CardHeader>
            <CardContent className="flex flex-col items-center gap-4">
              {qrLoading ? (
                <div className="flex justify-center py-12">
                  <Loader2 className="w-8 h-8 animate-spin text-gray-400" />
                </div>
              ) : qrUrl ? (
                <>
                  <div id="contributor-qr" className="bg-white p-4 rounded-lg border">
                    <QRCodeCanvas value={qrUrl} size={200} includeMargin />
                  </div>
                  <p className="text-sm text-gray-500 break-all text-center">{qrUrl}</p>
                </>
              ) : (
                <p className="text-gray-400 text-sm py-8">点击下方按钮生成二维码</p>
              )}
            </CardContent>
            <CardContent className="pb-6 flex flex-col gap-2">
              <Button onClick={generateQr} disabled={qrLoading}>
                <QrCode className="w-4 h-4 mr-2" />
                生成二维码
              </Button>
              {qrUrl && (
                <Button variant="outline" onClick={downloadQr}>
                  下载二维码图片
                </Button>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>

      {/* 资料详情对话框 */}
      <Dialog open={!!viewTarget} onOpenChange={(open) => !open && setViewTarget(null)}>
        <DialogContent className="max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              资料详情
              {viewTarget && (
                <Badge variant={viewTarget.status === 'approved' ? 'default' : viewTarget.status === 'rejected' ? 'destructive' : 'outline'}>
                  {UPLOAD_STATUS_LABELS[viewTarget.status as UploadStatus]}
                </Badge>
              )}
            </DialogTitle>
            <DialogDescription>
              {viewTarget
                ? `${CONTRIBUTOR_TYPE_LABELS[viewTarget.type as ContributorType] || '资料'} · 贡献者：${viewTarget.contributors?.name || viewTarget.contributors?.email || viewTarget.contributors?.phone || '未知'} · ${new Date(viewTarget.created_at).toLocaleString()}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {viewTarget && renderUploadData(viewTarget)}
            {viewTarget?.review_comment && (
              <p className="text-sm text-gray-500">
                <span className="font-medium">审核意见：</span>
                {viewTarget.review_comment}
              </p>
            )}
            {(viewTarget?.points_awarded ?? 0) > 0 && (
              <p className="flex items-center gap-1 text-sm text-green-600">
                <Gift className="w-3.5 h-3.5" />已发放 {viewTarget?.points_awarded ?? 0} 积分奖励
              </p>
            )}
          </div>
          <DialogFooter>
            {viewTarget?.status === 'pending' && (
              <Button onClick={() => { setReviewTarget(viewTarget); setViewTarget(null); }}>
                <CheckCircle2 className="w-4 h-4 mr-1" />去审核
              </Button>
            )}
            <Button variant="outline" onClick={() => setViewTarget(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 附件在线预览（图片 / PDF 内嵌展示，不强制下载；#20260820-1130-3） */}
      <Dialog
        open={!!previewFile}
        onOpenChange={(open) => {
          if (!open && previewFile?.isObjectUrl) {
            window.URL.revokeObjectURL(previewFile.url);
          }
          if (!open) setPreviewFile(null);
        }}
      >
        <DialogContent className="max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <Eye className="w-4 h-4 text-emerald-600" />
              附件预览
            </DialogTitle>
            <DialogDescription>{previewFile ? `${previewFile.name} · 在线预览` : ''}</DialogDescription>
          </DialogHeader>
          <div className="max-h-[70vh] overflow-auto">
            {previewFile &&
              (() => {
                const ext = (previewFile.name.split('.').pop() || '').toLowerCase();
                if (ext === 'pdf') {
                  return (
                    <iframe src={previewFile.url} title={previewFile.name} className="w-full h-[65vh] rounded border" />
                  );
                }
                if (['jpg', 'jpeg', 'png', 'gif', 'webp', 'svg', 'bmp'].includes(ext)) {
                  return <img src={previewFile.url} alt={previewFile.name} className="mx-auto max-w-full rounded object-contain" />;
                }
                return <p className="text-sm text-gray-500 text-center py-8">该格式暂不支持在线预览，请下载后查看。</p>;
              })()}
          </div>
          <DialogFooter>
            {previewFile && (
              <Button variant="outline" onClick={() => previewFile && handleDownloadAttachment(previewFile.fileKey, previewFile.name)}>
                <Download className="w-4 h-4 mr-1" />下载
              </Button>
            )}
            <Button onClick={() => setPreviewFile(null)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 审核对话框 */}
      <Dialog open={!!reviewTarget} onOpenChange={(open) => !open && setReviewTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>审核资料</DialogTitle>
            <DialogDescription>
              {reviewTarget
                ? `${CONTRIBUTOR_TYPE_LABELS[reviewTarget.type as ContributorType] || '资料'} · 审核通过将发放 ${getPoints(reviewTarget.type)} 积分`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {reviewTarget && renderUploadData(reviewTarget)}
            <div className="space-y-2">
              <Label>审核意见</Label>
              <Textarea
                value={reviewComment}
                placeholder="请输入审核意见（拒绝时必填）"
                onChange={(e) => setReviewComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="destructive"
              disabled={reviewing}
              onClick={() => submitReview('rejected')}
            >
              <XCircle className="w-4 h-4 mr-1" />
              拒绝
            </Button>
            <Button
              disabled={reviewing}
              onClick={() => submitReview('approved')}
            >
              {reviewing ? <Loader2 className="w-4 h-4 mr-1 animate-spin" /> : <CheckCircle2 className="w-4 h-4 mr-1" />}
              通过并发放积分
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 产品修改请求详情（#20260821-1837：按批次汇总展示） */}
      <Dialog open={!!requestViewTarget} onOpenChange={(open) => !open && setRequestViewTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              <PencilLine className="w-4 h-4 text-sky-600" />
              产品修改请求详情
              {requestViewTarget && (
                <Badge
                  variant={
                    requestViewTarget.status === 'approved'
                      ? 'default'
                      : requestViewTarget.status === 'rejected'
                        ? 'destructive'
                        : 'outline'
                  }
                >
                  {requestViewTarget.status === 'approved' ? '已通过' : requestViewTarget.status === 'rejected' ? '已拒绝' : '待审批'}
                </Badge>
              )}
              {requestViewTarget && (
                <span className="text-sm font-normal text-gray-500">
                  共 {requestViewTarget.product_count || 1} 个产品
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {requestViewTarget
                ? `${requestViewTarget.request_type === 'edit' ? '编辑' : '导入覆盖'} · 提交人：${requestViewTarget.requester_name || '未知'} · ${new Date(requestViewTarget.created_at).toLocaleString()}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {requestViewTarget?.reason && (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium text-gray-500">修改原因：</span>
                {requestViewTarget.reason}
              </p>
            )}
            {requestViewTarget && (
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">变更内容</p>
                {renderBatchRequestChanges(requestViewTarget)}
              </div>
            )}
            {requestViewTarget?.review_comment && (
              <p className="text-sm text-gray-500">
                <span className="font-medium">审核意见：</span>
                {requestViewTarget.review_comment}
              </p>
            )}
          </div>
          <DialogFooter>
            {requestViewTarget?.status === 'pending' && (
              <Button
                onClick={() => {
                  setRequestReviewTarget(requestViewTarget);
                  setRequestViewTarget(null);
                }}
              >
                <CheckCircle2 className="w-4 h-4 mr-1" />去审批
              </Button>
            )}
            <Button variant="outline" onClick={() => setRequestViewTarget(null)}>
              关闭
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 产品修改请求审批（#20260821-1837：按批次汇总审批） */}
      <Dialog open={!!requestReviewTarget} onOpenChange={(open) => !open && setRequestReviewTarget(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-3xl">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 flex-wrap">
              审批产品修改请求
              {requestReviewTarget && (
                <span className="text-sm font-normal text-gray-500">
                  共 {requestReviewTarget.product_count || 1} 个产品
                </span>
              )}
            </DialogTitle>
            <DialogDescription>
              {requestReviewTarget
                ? `${requestReviewTarget.request_type === 'edit' ? '编辑' : '导入覆盖'} · 提交人：${requestReviewTarget.requester_name || '未知'} · ${new Date(requestReviewTarget.created_at).toLocaleString()}`
                : ''}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-4">
            {requestReviewTarget?.reason && (
              <p className="text-sm text-gray-700 dark:text-gray-300">
                <span className="font-medium text-gray-500">修改原因：</span>
                {requestReviewTarget.reason}
              </p>
            )}
            {requestReviewTarget && (
              <div>
                <p className="font-medium text-gray-700 dark:text-gray-300 mb-2">变更内容</p>
                {renderBatchRequestChanges(requestReviewTarget)}
              </div>
            )}
            <div className="space-y-2">
              <Label>审批意见</Label>
              <Textarea
                value={requestComment}
                placeholder="请输入审批意见（拒绝时必填）"
                onChange={(e) => setRequestComment(e.target.value)}
              />
            </div>
          </div>
          <DialogFooter className="flex gap-2">
            <Button
              variant="destructive"
              disabled={requestReviewing}
              onClick={() => submitRequestReview('rejected')}
            >
              <XCircle className="w-4 h-4 mr-1" />拒绝
            </Button>
            <Button disabled={requestReviewing} onClick={() => submitRequestReview('approved')}>
              {requestReviewing ? (
                <Loader2 className="w-4 h-4 mr-1 animate-spin" />
              ) : (
                <CheckCircle2 className="w-4 h-4 mr-1" />
              )}
              通过并更新产品
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量操作确认（#[20260822-1000]-2） */}
      <Dialog open={!!batchDialog} onOpenChange={(open) => !open && setBatchDialog(null)}>
        <DialogContent className="max-h-[85vh] overflow-y-auto max-w-md">
          <DialogHeader>
            <DialogTitle>
              {batchDialog?.action === 'approve'
                ? '批量通过'
                : batchDialog?.action === 'reject'
                  ? '批量拒绝'
                  : '批量删除'}
              {batchDialog?.type === 'upload' ? '资料' : '产品修改请求'}
            </DialogTitle>
            <DialogDescription>
              {batchDialog?.action === 'delete'
                ? `确认删除选中的 ${batchDialog.type === 'upload' ? selectedUploads.size : selectedRequests.size} 条记录？删除后不可恢复。`
                : `即将对选中的 ${batchDialog?.type === 'upload' ? selectedUploads.size : selectedRequests.size} 条记录执行「${batchDialog?.action === 'approve' ? '通过' : '拒绝'}」操作。`}
            </DialogDescription>
          </DialogHeader>
          {batchDialog?.action === 'reject' && (
            <div className="space-y-2">
              <Label>审批意见</Label>
              <Textarea
                value={batchComment}
                placeholder="请输入拒绝原因（必填）"
                onChange={(e) => setBatchComment(e.target.value)}
              />
            </div>
          )}
          <DialogFooter className="flex gap-2">
            <Button variant="outline" onClick={() => setBatchDialog(null)} disabled={batchProcessing}>
              取消
            </Button>
            {batchDialog?.action === 'delete' ? (
              <Button
                variant="destructive"
                disabled={batchProcessing}
                onClick={() =>
                  batchDialog.type === 'upload'
                    ? submitBatchUploads('delete')
                    : submitBatchRequests('delete')
                }
              >
                {batchProcessing && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                确认删除
              </Button>
            ) : (
              <Button
                variant={batchDialog?.action === 'reject' ? 'destructive' : 'default'}
                disabled={batchProcessing || (batchDialog?.action === 'reject' && !batchComment.trim())}
                onClick={() =>
                  batchDialog!.type === 'upload'
                    ? submitBatchUploads(batchDialog!.action)
                    : submitBatchRequests(batchDialog!.action)
                }
              >
                {batchProcessing && <Loader2 className="w-4 h-4 mr-1 animate-spin" />}
                确认{batchDialog?.action === 'approve' ? '通过' : '拒绝'}
              </Button>
            )}
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
