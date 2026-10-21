'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
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
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Mail,
  Plus,
  Save,
  Trash2,
  Pencil,
  Loader2,
  Info,
  MailOpen,
  Server,
} from 'lucide-react';
import { toast } from 'sonner';

type ChannelRow = {
  id: number;
  provider: 'smtp' | 'supabase';
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_user: string | null;
  has_password: boolean;
  priority: number;
  from_email: string | null;
  from_name: string | null;
  enabled: boolean;
  updated_at: string;
};

type FormState = {
  priority: string;
  smtp_host: string;
  smtp_port: string;
  smtp_secure: 'ssl' | 'tls';
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string;
  enabled: boolean;
};

const EMPTY_FORM: FormState = {
  priority: '999',
  smtp_host: '',
  smtp_port: '465',
  smtp_secure: 'ssl',
  smtp_user: '',
  smtp_password: '',
  from_email: '',
  from_name: '报价查询系统',
  enabled: true,
};

const PROVIDER_PRESETS = [
  { name: 'QQ 邮箱', host: 'smtp.qq.com', port: '465', secure: 'ssl' as const },
  { name: '163 邮箱', host: 'smtp.163.com', port: '465', secure: 'ssl' as const },
  { name: '126 邮箱', host: 'smtp.126.com', port: '465', secure: 'ssl' as const },
  { name: '腾讯企业邮', host: 'smtp.exmail.qq.com', port: '465', secure: 'ssl' as const },
  { name: '阿里云企业邮', host: 'smtp.qiye.aliyun.com', port: '465', secure: 'ssl' as const },
];

export default function EmailSettingsPage() {
  const [rows, setRows] = useState<ChannelRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [dialogOpen, setDialogOpen] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [form, setForm] = useState<FormState>(EMPTY_FORM);
  const [deleteId, setDeleteId] = useState<number | null>(null);
  const [deleting, setDeleting] = useState(false);

  const load = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/email-settings');
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '加载失败');
      setRows(data.rows || []);
    } catch (err) {
      toast.error('加载邮件通道失败', { description: (err as Error).message });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openCreate = () => {
    setEditingId(null);
    setForm(EMPTY_FORM);
    setDialogOpen(true);
  };

  const openEdit = (row: ChannelRow) => {
    setEditingId(row.id);
    setForm({
      priority: String(row.priority ?? 999),
      smtp_host: row.smtp_host || '',
      smtp_port: String(row.smtp_port || 465),
      smtp_secure: row.smtp_secure ? 'ssl' : 'tls',
      smtp_user: row.smtp_user || '',
      smtp_password: '',
      from_email: row.from_email || '',
      from_name: row.from_name || '报价查询系统',
      enabled: row.enabled,
    });
    setDialogOpen(true);
  };

  const applyPreset = (host: string) => {
    const preset = PROVIDER_PRESETS.find((p) => p.host === host);
    if (preset) {
      setForm((f) => ({
        ...f,
        smtp_host: preset.host,
        smtp_port: preset.port,
        smtp_secure: preset.secure,
      }));
    }
  };

  const toggleEnabled = async (row: ChannelRow) => {
    try {
      const res = await fetch(`/api/admin/email-settings/${row.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ enabled: !row.enabled }),
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '操作失败');
      toast.success(row.enabled ? '已停用该通道' : '已启用该通道');
      load();
    } catch (err) {
      toast.error('操作失败', { description: (err as Error).message });
    }
  };

  const handleSubmit = async () => {
    if (!form.smtp_host.trim() || !form.smtp_user.trim() || !form.from_email.trim()) {
      toast.error('请填写 SMTP 服务器、账号与发件邮箱');
      return;
    }
    if (editingId === null && !form.smtp_password.trim()) {
      toast.error('请填写 SMTP 密码/授权码');
      return;
    }
    if (!form.from_email.includes('@')) {
      toast.error('发件邮箱格式不正确');
      return;
    }

    setSaving(true);
    try {
      const payload = {
        priority: Number(form.priority) || 999,
        smtp_host: form.smtp_host.trim(),
        smtp_port: Number(form.smtp_port) || 465,
        smtp_secure: form.smtp_secure === 'ssl',
        smtp_user: form.smtp_user.trim(),
        smtp_password: form.smtp_password.trim(),
        from_email: form.from_email.trim(),
        from_name: form.from_name.trim() || '报价查询系统',
        enabled: form.enabled,
      };

      const res = await fetch(
        editingId === null
          ? '/api/admin/email-settings'
          : `/api/admin/email-settings/${editingId}`,
        {
          method: editingId === null ? 'POST' : 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify(payload),
        }
      );
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '保存失败');

      toast.success(editingId === null ? '邮件通道已添加' : '邮件通道已更新');
      setDialogOpen(false);
      load();
    } catch (err) {
      toast.error('保存失败', { description: (err as Error).message });
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (deleteId === null) return;
    setDeleting(true);
    try {
      const res = await fetch(`/api/admin/email-settings/${deleteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || '删除失败');
      toast.success('通道已删除');
      setDeleteId(null);
      load();
    } catch (err) {
      toast.error('删除失败', { description: (err as Error).message });
    } finally {
      setDeleting(false);
    }
  };

  const smtpChannels = rows.filter((r) => r.provider === 'smtp');
  const fallbackRows = rows.filter((r) => r.provider !== 'smtp');
  const activeChannel = smtpChannels.find((r) => r.enabled);

  return (
    <div className="p-6 space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold flex items-center gap-2">
            <Mail className="h-6 w-6 text-blue-600" /> 邮件通道配置
          </h1>
          <p className="text-sm text-muted-foreground mt-1">
            邮箱验证码发送通道，支持任意 SMTP 服务商（QQ / 163 / 126 / 腾讯企业邮 / 阿里云企业邮 / Gmail 等）
          </p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-1" /> 新增 SMTP 通道
        </Button>
      </div>

      <Card className="border-blue-200 bg-blue-50/50">
        <CardContent className="p-4 text-sm text-blue-800 flex items-start gap-2">
          <Info className="h-4 w-4 mt-0.5 shrink-0" />
          <div>
            <p className="font-medium">当前生效通道</p>
            <p className="mt-1 text-blue-700">
              {activeChannel ? (
                <>
                  使用自定义 SMTP：{activeChannel.smtp_host}（{activeChannel.from_email}）。
                  若此通道发送失败，会自动回退到 Supabase 内置邮件通道。
                </>
              ) : (
                <>
                  未配置可用 SMTP 通道，当前使用 <strong>Supabase 内置邮件通道</strong>
                  （每小时每邮箱限 2 封，且可能进入垃圾箱）。建议配置自定义 SMTP 以获得稳定投递。
                </>
              )}
            </p>
          </div>
        </CardContent>
      </Card>

      {loading ? (
        <div className="flex justify-center py-16">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        </div>
      ) : smtpChannels.length === 0 ? (
        <Card>
          <CardContent className="p-12 text-center text-muted-foreground flex flex-col items-center gap-3">
            <MailOpen className="h-12 w-12 opacity-40" />
            <p>暂无自定义 SMTP 通道</p>
            <p className="text-sm">点击右上角「新增 SMTP 通道」添加第一个邮件通道</p>
          </CardContent>
        </Card>
      ) : (
        <div className="space-y-3">
          {smtpChannels.map((row) => (
            <Card key={row.id} className={row.enabled ? '' : 'opacity-60'}>
              <CardContent className="p-4 flex items-center justify-between gap-4">
                <div className="flex items-center gap-3 min-w-0">
                  <div className="h-10 w-10 rounded-lg bg-blue-100 flex items-center justify-center shrink-0">
                    <Server className="h-5 w-5 text-blue-600" />
                  </div>
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <span className="font-semibold truncate">{row.smtp_host}</span>
                      <Badge variant="outline" className="shrink-0 text-blue-700 border-blue-300 bg-blue-50">
                        P{row.priority ?? '-'}
                      </Badge>
                      <Badge variant="secondary" className="shrink-0">{row.smtp_port}</Badge>
                      <Badge variant={row.smtp_secure ? 'default' : 'outline'} className="shrink-0">
                        {row.smtp_secure ? 'SSL' : 'STARTTLS'}
                      </Badge>
                      {row.enabled && <Badge className="bg-green-600 shrink-0">使用中</Badge>}
                    </div>
                    <p className="text-sm text-muted-foreground truncate">
                      {row.from_name} &lt;{row.from_email}&gt; · 账号 {row.smtp_user}
                      {row.has_password ? ' · 密码已配置' : ' · 密码未配置'}
                    </p>
                  </div>
                </div>
                <div className="flex items-center gap-2 shrink-0">
                  <div className="flex items-center gap-1.5 mr-1">
                    <Label htmlFor={`enabled-${row.id}`} className="text-xs text-muted-foreground">
                      {row.enabled ? '启用' : '停用'}
                    </Label>
                    <Switch
                      id={`enabled-${row.id}`}
                      checked={row.enabled}
                      onCheckedChange={() => toggleEnabled(row)}
                    />
                  </div>
                  <Button variant="outline" size="icon" onClick={() => openEdit(row)}>
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button variant="destructive" size="icon" onClick={() => setDeleteId(row.id)}>
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      )}

      {fallbackRows.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-sm">备用通道</CardTitle>
            <CardDescription>当所有 SMTP 通道不可用时自动使用 Supabase 内置邮件通道</CardDescription>
          </CardHeader>
          <CardContent>
            {fallbackRows.map((row) => (
              <div key={row.id} className="text-sm text-muted-foreground">
                #{row.id} · Supabase 内置邮件通道（noreply@supabase.co）
              </div>
            ))}
          </CardContent>
        </Card>
      )}

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>{editingId === null ? '新增 SMTP 通道' : '编辑 SMTP 通道'}</DialogTitle>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>常用服务商（点击自动填充）</Label>
              <div className="flex flex-wrap gap-2 mt-2">
                {PROVIDER_PRESETS.map((p) => (
                  <Button
                    key={p.host}
                    type="button"
                    variant="outline"
                    size="sm"
                    onClick={() => applyPreset(p.host)}
                  >
                    {p.name}
                  </Button>
                ))}
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="col-span-2">
                <Label>SMTP 服务器地址 *</Label>
                <Input
                  value={form.smtp_host}
                  onChange={(e) => setForm({ ...form, smtp_host: e.target.value })}
                  placeholder="smtp.qq.com"
                />
              </div>
              <div>
                <Label>端口 *</Label>
                <Input
                  value={form.smtp_port}
                  onChange={(e) => setForm({ ...form, smtp_port: e.target.value })}
                  placeholder="465"
                />
              </div>
              <div>
                <Label>加密方式</Label>
                <Select
                  value={form.smtp_secure}
                  onValueChange={(v) => setForm({ ...form, smtp_secure: v as 'ssl' | 'tls' })}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择加密方式" />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="ssl">SSL（推荐，465 端口）</SelectItem>
                    <SelectItem value="tls">STARTTLS（587 端口）</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="col-span-2">
                <Label>SMTP 账号 *</Label>
                <Input
                  value={form.smtp_user}
                  onChange={(e) => setForm({ ...form, smtp_user: e.target.value })}
                  placeholder="发件邮箱或专用账号"
                />
              </div>
              <div className="col-span-2">
                <Label>SMTP 密码 / 授权码 *</Label>
                <Input
                  type="password"
                  value={form.smtp_password}
                  onChange={(e) => setForm({ ...form, smtp_password: e.target.value })}
                  placeholder={editingId === null ? '邮箱授权码或密码' : '留空表示不修改'}
                />
                {editingId === null && (
                  <p className="text-xs text-muted-foreground mt-1">
                    QQ / 163 等邮箱请在邮箱设置中开启 SMTP 服务并获取授权码
                  </p>
                )}
              </div>
              <div>
                <Label>发件邮箱 *</Label>
                <Input
                  value={form.from_email}
                  onChange={(e) => setForm({ ...form, from_email: e.target.value })}
                  placeholder="noreply@example.com"
                />
              </div>
              <div>
                <Label>发件人名称</Label>
                <Input
                  value={form.from_name}
                  onChange={(e) => setForm({ ...form, from_name: e.target.value })}
                  placeholder="报价查询系统"
                />
              </div>
              <div>
                <Label>优先级</Label>
                <Input
                  type="number"
                  value={form.priority}
                  onChange={(e) => setForm({ ...form, priority: e.target.value })}
                  placeholder="1"
                />
                <p className="text-xs text-muted-foreground mt-1">数值越小越优先，发送失败自动降级到下一通道</p>
              </div>
              <div className="col-span-2 flex items-center gap-2">
                <Switch
                  checked={form.enabled}
                  onCheckedChange={(v) => setForm({ ...form, enabled: v })}
                />
                <Label>启用该通道（停用后将不会被选为发送通道）</Label>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={saving}>
              {saving ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Save className="h-4 w-4 mr-1" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={deleteId !== null} onOpenChange={(v) => !v && setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除该邮件通道？</AlertDialogTitle>
            <AlertDialogDescription>
              删除后该通道将不再用于发送验证邮件。删除操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
