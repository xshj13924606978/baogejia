'use client';

import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useCallback, useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import {
  ArrowLeft,
  Save,
  RotateCcw,
  Plus,
  Trash2,
  Power,
  PowerOff,
  Search,
  Shield,
  Info,
  Mail,
  MessageCircle,
  FileText,
  Briefcase,
  Scale,
  Image as ImageIcon,
  Calculator,
  Loader2,
  CheckCircle2,
  AlertCircle,
  LayoutList,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardHeader,
  CardTitle,
  CardDescription,
  CardContent,
} from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Separator } from '@/components/ui/separator';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from '@/components/ui/dialog';
import { Textarea } from '@/components/ui/textarea';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Skeleton } from '@/components/ui/skeleton';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { toast } from 'sonner';
import { cn } from '@/lib/utils';

interface ImportType {
  type: string;
  label: string;
  description?: string;
  icon?: string;
}

interface ImportConfig {
  wechat_enabled: boolean;
  wechat_secret: string;
  wechat_auto_approve: boolean;
  wechat_default_type: string;
  wechat_whitelist_enabled: boolean;
  email_enabled: boolean;
  email_secret: string;
  email_auto_approve: boolean;
  email_default_type: string;
  email_whitelist_enabled: boolean;
}

interface WhitelistItem {
  id: string;
  source_type: 'wechat' | 'email';
  source_value: string;
  remark: string | null;
  is_active: boolean;
  created_at: string;
}

const DEFAULT_CONFIG: ImportConfig = {
  wechat_enabled: false,
  wechat_secret: '',
  wechat_auto_approve: false,
  wechat_default_type: 'document',
  wechat_whitelist_enabled: false,
  email_enabled: false,
  email_secret: '',
  email_auto_approve: false,
  email_default_type: 'document',
  email_whitelist_enabled: false,
};

const ICON_MAP: Record<string, React.ComponentType<{ className?: string }>> = {
  FileText,
  Briefcase,
  Scale,
  Image: ImageIcon,
  Calculator,
};

function TypeIcon({ icon, className }: { icon?: string; className?: string }) {
  const Icon = (icon && ICON_MAP[icon]) || FileText;
  return <Icon className={className} />;
}

export default function ImportConfigPage() {
  const [config, setConfig] = useState<ImportConfig>(DEFAULT_CONFIG);
  const [initialConfig, setInitialConfig] = useState<ImportConfig>(DEFAULT_CONFIG);
  const [types, setTypes] = useState<ImportType[]>([]);

  const [pageLoading, setPageLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [activeTab, setActiveTab] = useState<'wechat' | 'email'>('wechat');
  const [whitelist, setWhitelist] = useState<WhitelistItem[]>([]);
  const [whitelistLoading, setWhitelistLoading] = useState(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [keyword, setKeyword] = useState('');
  const [addDialogOpen, setAddDialogOpen] = useState(false);
  const [bulkInput, setBulkInput] = useState('');
  const [bulkProcessing, setBulkProcessing] = useState(false);

  const isDirty = useMemo(() => {
    return JSON.stringify(config) !== JSON.stringify(initialConfig);
  }, [config, initialConfig]);

  const fetchConfig = async () => {
    try {
      const res = await fetch('/api/admin/knowledge/import-config');
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '加载失败');
      const data = { ...DEFAULT_CONFIG, ...(json.data || {}) };
      setConfig(data);
      setInitialConfig(data);
      setTypes(Array.isArray(json.types) ? json.types : []);
    } catch (err: any) {
      toast.error(err.message || '加载配置失败');
    } finally {
      setPageLoading(false);
    }
  };

  const fetchWhitelist = useCallback(async (sourceType: 'wechat' | 'email') => {
    setWhitelistLoading(true);
    try {
      const res = await fetch(
        `/api/admin/knowledge/import-config/whitelist?source_type=${sourceType}&page_size=200`
      );
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '加载失败');
      setWhitelist(json.data || []);
      setSelectedIds(new Set());
    } catch (err: any) {
      toast.error(err.message || '加载白名单失败');
    } finally {
      setWhitelistLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchConfig();
  }, []);

  useEffect(() => {
    if (!pageLoading) {
      fetchWhitelist(activeTab);
    }
  }, [activeTab, pageLoading, fetchWhitelist]);

  const updateField = <K extends keyof ImportConfig>(key: K, value: ImportConfig[K]) => {
    setConfig((prev) => ({ ...prev, [key]: value }));
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const res = await fetch('/api/admin/knowledge/import-config', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(config),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '保存失败');
      const data = { ...DEFAULT_CONFIG, ...(json.data || {}) };
      setConfig(data);
      setInitialConfig(data);
      setTypes(Array.isArray(json.types) ? json.types : []);
      toast.success('配置已保存');
    } catch (err: any) {
      toast.error(err.message || '保存失败');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    setConfig(initialConfig);
    toast.info('已恢复上次保存的配置');
  };

  const toggleSelection = (id: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const toggleAll = () => {
    if (selectedIds.size === filteredWhitelist.length && filteredWhitelist.length > 0) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(filteredWhitelist.map((item) => item.id)));
    }
  };

  const filteredWhitelist = useMemo(() => {
    const k = keyword.trim().toLowerCase();
    if (!k) return whitelist;
    return whitelist.filter(
      (item) =>
        item.source_value.toLowerCase().includes(k) ||
        (item.remark && item.remark.toLowerCase().includes(k))
    );
  }, [whitelist, keyword]);

  const handleBulkAdd = async () => {
    const values = bulkInput
      .split(/\r?\n/)
      .map((v) => v.trim())
      .filter(Boolean);
    if (values.length === 0) {
      toast.error('请至少输入一个来源值');
      return;
    }
    setBulkProcessing(true);
    try {
      const res = await fetch('/api/admin/knowledge/import-config/whitelist', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          items: values.map((value) => ({ source_type: activeTab, source_value: value })),
        }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '添加失败');
      toast.success(json.message || `成功添加 ${(json.data || []).length} 条白名单`);
      setBulkInput('');
      setAddDialogOpen(false);
      fetchWhitelist(activeTab);
    } catch (err: any) {
      toast.error(err.message || '添加失败');
    } finally {
      setBulkProcessing(false);
    }
  };

  const handleBulkStatus = async (isActive: boolean) => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    try {
      const res = await fetch('/api/admin/knowledge/import-config/whitelist', {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids, is_active: isActive }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '更新失败');
      toast.success(json.message || '更新成功');
      setSelectedIds(new Set());
      fetchWhitelist(activeTab);
    } catch (err: any) {
      toast.error(err.message || '更新失败');
    }
  };

  const handleBulkDelete = async () => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) return;
    if (!await confirmDialog({ title: `确定删除选中的 ${ids.length} 条白名单吗？`, destructive: true })) return;
    try {
      const res = await fetch('/api/admin/knowledge/import-config/whitelist', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids }),
      });
      const json = await res.json();
      if (!json.success) throw new Error(json.error || '删除失败');
      toast.success(json.message || '删除成功');
      setSelectedIds(new Set());
      fetchWhitelist(activeTab);
    } catch (err: any) {
      toast.error(err.message || '删除失败');
    }
  };

  if (pageLoading) {
    return (
      <div className="min-h-[60vh] p-6 lg:p-8">
        <Skeleton className="h-10 w-1/3 mb-6" />
        <div className="grid gap-6 lg:grid-cols-2">
          <Skeleton className="h-96 rounded-2xl" />
          <Skeleton className="h-96 rounded-2xl" />
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-full bg-slate-50/50 dark:bg-slate-950/30">
      <div className="mx-auto max-w-7xl p-4 sm:p-6 lg:p-8">
        {/* Header */}
        <div className="mb-8 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-4">
            <Button variant="outline" size="icon" asChild className="shrink-0 rounded-xl">
              <Link href="/admin/knowledge">
                <ArrowLeft className="h-5 w-5" />
              </Link>
            </Button>
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100 sm:text-3xl">
                资料中心导入配置
              </h1>
              <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
                配置微信 / 邮件 webhook 导入开关、Secret、默认参数与来源白名单
              </p>
            </div>
          </div>
          <div className="flex items-center gap-3">
            <Button
              variant="outline"
              onClick={handleReset}
              disabled={!isDirty || saving}
              className="rounded-xl"
            >
              <RotateCcw className="mr-2 h-4 w-4" />
              取消
            </Button>
            <Button
              onClick={handleSave}
              disabled={!isDirty || saving}
              className="rounded-xl bg-slate-900 hover:bg-slate-800 dark:bg-slate-100 dark:text-slate-900 dark:hover:bg-slate-200"
            >
              {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <Save className="mr-2 h-4 w-4" />}
              保存配置
            </Button>
          </div>
        </div>

        {isDirty && (
          <Alert className="mb-6 rounded-xl border-amber-200 bg-amber-50 text-amber-900 dark:border-amber-900 dark:bg-amber-950/30 dark:text-amber-100">
            <AlertCircle className="h-4 w-4" />
            <AlertTitle>配置未保存</AlertTitle>
            <AlertDescription>当前有未保存的改动，请及时保存。</AlertDescription>
          </Alert>
        )}

        {/* Config cards */}
        <div className="grid gap-6 lg:grid-cols-2 mb-6">
          <ConfigChannelCard
            icon={<MessageCircle className="h-5 w-5 text-emerald-600" />}
            title="微信导入"
            description="开启后可通过微信机器人/webhook 将消息导入资料中心"
            enabled={config.wechat_enabled}
            onEnabledChange={(v) => updateField('wechat_enabled', v)}
          >
            <ConfigFields
              config={config}
              prefix="wechat"
              types={types}
              onChange={updateField}
            />
          </ConfigChannelCard>

          <ConfigChannelCard
            icon={<Mail className="h-5 w-5 text-blue-600" />}
            title="邮件导入"
            description="开启后可通过邮件 webhook 将附件导入资料中心"
            enabled={config.email_enabled}
            onEnabledChange={(v) => updateField('email_enabled', v)}
          >
            <ConfigFields
              config={config}
              prefix="email"
              types={types}
              onChange={updateField}
            />
          </ConfigChannelCard>
        </div>

        {/* Whitelist manager */}
        <Card className="rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur dark:border-slate-800 dark:bg-slate-900/60">
          <CardHeader className="pb-4">
            <div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-violet-100 text-violet-600 dark:bg-violet-950 dark:text-violet-300">
                  <Shield className="h-5 w-5" />
                </div>
                <div>
                  <CardTitle className="text-lg">导入来源白名单</CardTitle>
                  <CardDescription>
                    仅允许白名单内的来源触发导入，支持批量增删与启停
                  </CardDescription>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <Button
                  variant={activeTab === 'wechat' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab('wechat')}
                  className="rounded-lg"
                >
                  <MessageCircle className="mr-1.5 h-4 w-4" />
                  微信
                </Button>
                <Button
                  variant={activeTab === 'email' ? 'default' : 'outline'}
                  size="sm"
                  onClick={() => setActiveTab('email')}
                  className="rounded-lg"
                >
                  <Mail className="mr-1.5 h-4 w-4" />
                  邮件
                </Button>
              </div>
            </div>
          </CardHeader>
          <CardContent className="pt-0">
            <div className="mb-4 flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-3">
                <Switch
                  id={`${activeTab}_whitelist_enabled`}
                  checked={
                    activeTab === 'wechat'
                      ? config.wechat_whitelist_enabled
                      : config.email_whitelist_enabled
                  }
                  onCheckedChange={(v) =>
                    updateField(
                      activeTab === 'wechat' ? 'wechat_whitelist_enabled' : 'email_whitelist_enabled',
                      v
                    )
                  }
                />
                <Label
                  htmlFor={`${activeTab}_whitelist_enabled`}
                  className="cursor-pointer font-medium"
                >
                  启用{activeTab === 'wechat' ? '微信' : '邮件'}白名单校验
                </Label>
                <Badge variant="secondary" className="rounded-md">
                  {(activeTab === 'wechat' ? config.wechat_whitelist_enabled : config.email_whitelist_enabled)
                    ? '已启用'
                    : '未启用'}
                </Badge>
              </div>
              <div className="flex items-center gap-2">
                <div className="relative">
                  <Search className="absolute left-2.5 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                  <Input
                    placeholder="搜索来源 / 备注"
                    value={keyword}
                    onChange={(e) => setKeyword(e.target.value)}
                    className="h-9 w-full rounded-lg pl-9 sm:w-64"
                  />
                </div>
                <Dialog
                  open={addDialogOpen}
                  onOpenChange={(open) => {
                    setAddDialogOpen(open);
                    if (!open) setBulkInput('');
                  }}
                >
                  <DialogTrigger asChild>
                    <Button size="sm" className="rounded-lg">
                      <Plus className="mr-1.5 h-4 w-4" />
                      批量添加
                    </Button>
                  </DialogTrigger>
                  <DialogContent className="rounded-2xl sm:max-w-lg">
                    <DialogHeader>
                      <DialogTitle>批量添加{activeTab === 'wechat' ? '微信' : '邮件'}来源</DialogTitle>
                      <DialogDescription>
                        每行一个来源值，支持一次性粘贴多个。重复值会自动去重。
                      </DialogDescription>
                    </DialogHeader>
                    <Textarea
                      placeholder={
                        activeTab === 'wechat'
                          ? '例如：\n微信群ID_1\n机器人来源标识_2'
                          : '例如：\nimport@example.com\nsender@company.com'
                      }
                      value={bulkInput}
                      onChange={(e) => setBulkInput(e.target.value)}
                      className="min-h-[180px] rounded-xl"
                    />
                    <DialogFooter>
                      <Button variant="outline" onClick={() => setAddDialogOpen(false)} className="rounded-lg">
                        取消
                      </Button>
                      <Button
                        onClick={handleBulkAdd}
                        disabled={bulkProcessing || !bulkInput.trim()}
                        className="rounded-lg"
                      >
                        {bulkProcessing && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                        确认添加
                      </Button>
                    </DialogFooter>
                  </DialogContent>
                </Dialog>
              </div>
            </div>

            {selectedIds.size > 0 && (
              <div className="mb-3 flex items-center gap-2 rounded-xl border border-slate-200 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-900">
                <CheckCircle2 className="h-4 w-4 text-slate-500" />
                <span className="text-sm text-slate-600 dark:text-slate-300">
                  已选择 {selectedIds.size} 条
                </span>
                <Separator orientation="vertical" className="mx-1 h-4" />
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleBulkStatus(true)}
                  className="h-7 rounded-md text-emerald-600 hover:text-emerald-700"
                >
                  <Power className="mr-1 h-3.5 w-3.5" />
                  启用
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={() => handleBulkStatus(false)}
                  className="h-7 rounded-md text-amber-600 hover:text-amber-700"
                >
                  <PowerOff className="mr-1 h-3.5 w-3.5" />
                  禁用
                </Button>
                <Button
                  variant="ghost"
                  size="sm"
                  onClick={handleBulkDelete}
                  className="h-7 rounded-md text-red-600 hover:text-red-700"
                >
                  <Trash2 className="mr-1 h-3.5 w-3.5" />
                  删除
                </Button>
              </div>
            )}

            <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-800">
              <ScrollArea className="h-[420px]">
                <Table>
                  <TableHeader className="sticky top-0 z-10 bg-slate-50 dark:bg-slate-900">
                    <TableRow>
                      <TableHead className="w-12">
                        <Checkbox
                          checked={
                            filteredWhitelist.length > 0 && selectedIds.size === filteredWhitelist.length
                          }
                          onCheckedChange={() => toggleAll()}
                          aria-label="全选"
                        />
                      </TableHead>
                      <TableHead>来源值</TableHead>
                      <TableHead>备注</TableHead>
                      <TableHead className="w-24">状态</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {whitelistLoading ? (
                      Array.from({ length: 5 }).map((_, i) => (
                        <TableRow key={i}>
                          <TableCell colSpan={4}>
                            <Skeleton className="h-8 w-full" />
                          </TableCell>
                        </TableRow>
                      ))
                    ) : filteredWhitelist.length === 0 ? (
                      <TableRow>
                        <TableCell colSpan={4}>
                          <div className="flex flex-col items-center justify-center py-10 text-slate-400">
                            <LayoutList className="mb-2 h-10 w-10 opacity-50" />
                            <p className="text-sm">
                              {keyword ? '没有匹配的白名单记录' : '暂无白名单，点击“批量添加”新增'}
                            </p>
                          </div>
                        </TableCell>
                      </TableRow>
                    ) : (
                      filteredWhitelist.map((item) => (
                        <TableRow
                          key={item.id}
                          className={cn(
                            'transition-colors',
                            selectedIds.has(item.id) && 'bg-slate-50 dark:bg-slate-900'
                          )}
                        >
                          <TableCell>
                            <Checkbox
                              checked={selectedIds.has(item.id)}
                              onCheckedChange={() => toggleSelection(item.id)}
                              aria-label={`选择 ${item.source_value}`}
                            />
                          </TableCell>
                          <TableCell className="font-medium">{item.source_value}</TableCell>
                          <TableCell className="text-slate-500">
                            {item.remark || '-'}
                          </TableCell>
                          <TableCell>
                            {item.is_active ? (
                              <Badge variant="default" className="rounded-md bg-emerald-100 text-emerald-700 hover:bg-emerald-100 dark:bg-emerald-950 dark:text-emerald-300">
                                启用
                              </Badge>
                            ) : (
                              <Badge variant="secondary" className="rounded-md">
                                禁用
                              </Badge>
                            )}
                          </TableCell>
                        </TableRow>
                      ))
                    )}
                  </TableBody>
                </Table>
              </ScrollArea>
            </div>

            <div className="mt-3 flex items-start gap-2 text-xs text-slate-500 dark:text-slate-400">
              <Info className="mt-0.5 h-3.5 w-3.5 shrink-0" />
              <p>
                白名单关闭时不影响现有导入行为；开启后，只有来源标识匹配白名单且状态为“启用”的请求才会被处理。
              </p>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

/* ----------------------------- Sub components ----------------------------- */

interface ConfigChannelCardProps {
  icon: React.ReactNode;
  title: string;
  description: string;
  enabled: boolean;
  onEnabledChange: (value: boolean) => void;
  children: React.ReactNode;
}

function ConfigChannelCard({ icon, title, description, enabled, onEnabledChange, children }: ConfigChannelCardProps) {
  return (
    <Card className="rounded-2xl border border-slate-200/70 bg-white/80 shadow-sm backdrop-blur transition-shadow hover:shadow-md dark:border-slate-800 dark:bg-slate-900/60">
      <CardHeader className="pb-4">
        <div className="flex items-start justify-between gap-4">
          <div className="flex items-center gap-3">
            <div className="flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 dark:bg-slate-800">
              {icon}
            </div>
            <div>
              <CardTitle className="text-lg">{title}</CardTitle>
              <CardDescription className="mt-1 max-w-md">{description}</CardDescription>
            </div>
          </div>
          <div className="flex items-center gap-2">
            <Switch id={`${title}_enabled`} checked={enabled} onCheckedChange={onEnabledChange} />
            <Label htmlFor={`${title}_enabled`} className="cursor-pointer whitespace-nowrap text-sm font-medium">
              {enabled ? '已启用' : '已禁用'}
            </Label>
          </div>
        </div>
      </CardHeader>
      <CardContent className="space-y-5 pt-0">{children}</CardContent>
    </Card>
  );
}

interface ConfigFieldsProps {
  config: ImportConfig;
  prefix: 'wechat' | 'email';
  types: ImportType[];
  onChange: <K extends keyof ImportConfig>(key: K, value: ImportConfig[K]) => void;
}

function ConfigFields({ config, prefix, types, onChange }: ConfigFieldsProps) {
  const secretKey = `${prefix}_secret` as keyof ImportConfig;
  const autoApproveKey = `${prefix}_auto_approve` as keyof ImportConfig;
  const defaultTypeKey = `${prefix}_default_type` as keyof ImportConfig;

  return (
    <>
      <div className="space-y-2">
        <Label htmlFor={secretKey} className="text-sm font-medium">
          Webhook Secret
        </Label>
        <Input
          id={secretKey}
          type="text"
          placeholder={prefix === 'wechat' ? '用于校验微信 webhook 请求' : '用于校验邮件 webhook 请求'}
          value={config[secretKey] as string}
          onChange={(e) => onChange(secretKey, e.target.value)}
          className="rounded-xl"
        />
      </div>

      <div className="flex items-center gap-3">
        <Switch
          id={autoApproveKey}
          checked={config[autoApproveKey] as boolean}
          onCheckedChange={(v) => onChange(autoApproveKey, v)}
        />
        <Label htmlFor={autoApproveKey} className="cursor-pointer font-medium">
          自动审核通过
        </Label>
      </div>

      <div className="space-y-2">
        <Label htmlFor={defaultTypeKey} className="text-sm font-medium">
          默认入库类型
        </Label>
        <Select
          value={config[defaultTypeKey] as string}
          onValueChange={(v) => onChange(defaultTypeKey, v)}
        >
          <SelectTrigger id={defaultTypeKey} className="rounded-xl">
            <SelectValue placeholder="选择默认类型" />
          </SelectTrigger>
          <SelectContent className="rounded-xl">
            {types.length === 0 && (
              <SelectItem value="document" disabled>
                加载中…
              </SelectItem>
            )}
            {types.map((type) => (
              <SelectItem key={type.type} value={type.type}>
                <span className="inline-flex items-center gap-2">
                  <TypeIcon icon={type.icon} className="h-4 w-4 text-slate-500" />
                  <span>{type.label}</span>
                </span>
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        {types.find((t) => t.type === (config[defaultTypeKey] as string))?.description && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {types.find((t) => t.type === (config[defaultTypeKey] as string))?.description}
          </p>
        )}
      </div>
    </>
  );
}
