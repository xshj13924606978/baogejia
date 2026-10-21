'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Eye, Loader2, FileCode } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';

const API = '/api/admin/config/pages';
const MODULES_API = '/api/admin/config/modules';

interface Page {
  id: string;
  module_id: string;
  page_key: string;
  name_zh: string;
  route_path: string | null;
  layout_template: string;
  is_enabled: boolean;
  config: Record<string, unknown>;
  module?: { id: string; module_key: string; name_zh: string } | null;
}

const LAYOUT_TEMPLATES = [
  { value: 'default', label: '默认' },
  { value: 'list', label: '列表' },
  { value: 'form', label: '表单' },
  { value: 'detail', label: '详情' },
  { value: 'dashboard', label: '仪表盘' },
  { value: 'statistics', label: '统计' },
];

const emptyForm = { module_id: '', page_key: '', name_zh: '', route_path: '', layout_template: 'list', is_enabled: true };

export default function ConfigPages() {
  const [items, setItems] = useState<Page[]>([]);
  const [modules, setModules] = useState<{ id: string; module_key: string; name_zh: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [filterModule, setFilterModule] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Page | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Page | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadModules = useCallback(async () => {
    const res = await fetch(`${MODULES_API}?all=true`);
    const data = await res.json();
    if (data.success) setModules((data.data || []).map((m: any) => ({ id: m.id, module_key: m.module_key, name_zh: m.name_zh })));
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (filterModule) params.set('module_id', filterModule);
      const res = await fetch(`${API}?${params}`);
      const data = await res.json();
      if (data.success) { setItems(data.data || []); setTotal(data.total || 0); }
      else toast.error(data.error || '加载失败');
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  }, [page, pageSize, filterModule]);

  useEffect(() => { loadModules(); loadItems(); }, [loadModules, loadItems]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, module_id: filterModule });
    setDialogOpen(true);
  };

  const openEdit = (p: Page) => {
    setEditing(p);
    setForm({
      module_id: p.module_id,
      page_key: p.page_key,
      name_zh: p.name_zh,
      route_path: p.route_path || '',
      layout_template: p.layout_template,
      is_enabled: p.is_enabled,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.module_id || !form.page_key || !form.name_zh) { toast.error('模块、页面代码和名称不能为空'); return; }
    setSubmitting(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `${API}/${editing.id}` : API;
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (data.success) { toast.success(editing ? '更新成功' : '创建成功'); setDialogOpen(false); loadItems(); }
      else toast.error(data.error || '操作失败');
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  const handleToggle = async (p: Page) => {
    try {
      const res = await fetch(`${API}/${p.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_enabled: !p.is_enabled }) });
      const data = await res.json();
      if (data.success) { toast.success(p.is_enabled ? '已禁用' : '已启用'); loadItems(); }
      else toast.error(data.error || '操作失败');
    } catch { toast.error('网络错误'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast.success('已删除'); loadItems(); }
      else toast.error(data.error || '删除失败');
    } catch { toast.error('网络错误'); }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  const totalPages = Math.ceil(total / pageSize);

  const getModuleName = (moduleId: string) => {
    const m = modules.find(m => m.id === moduleId);
    return m ? m.name_zh : moduleId.slice(0, 8);
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <select
            className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm"
            value={filterModule}
            onChange={(e) => { setFilterModule(e.target.value); setPage(1); }}
          >
            <option value="">全部模块</option>
            {modules.map(m => <option key={m.id} value={m.id}>{m.name_zh}</option>)}
          </select>
        </div>
        <Button size="sm" onClick={openCreate} disabled={!filterModule}><Plus className="h-4 w-4 mr-1" /> 新增页面</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <FileCode className="h-10 w-10 mb-2 opacity-30" />
          <p className="font-medium">暂无页面</p>
          <p className="text-sm">{filterModule ? '该模块下还没有页面配置' : '请先选择一个模块'}</p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>页面代码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>所属模块</TableHead>
                <TableHead>布局</TableHead>
                <TableHead>路径</TableHead>
                <TableHead>状态</TableHead>
                <TableHead className="w-[150px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((p) => (
                <TableRow key={p.id}>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{p.page_key}</code></TableCell>
                  <TableCell className="font-medium">{p.name_zh}</TableCell>
                  <TableCell><Badge variant="outline">{getModuleName(p.module_id)}</Badge></TableCell>
                  <TableCell><Badge variant="secondary">{LAYOUT_TEMPLATES.find(t => t.value === p.layout_template)?.label || p.layout_template}</Badge></TableCell>
                  <TableCell><code className="text-xs text-muted-foreground">{p.route_path || '-'}</code></TableCell>
                  <TableCell>
                    <Badge variant={p.is_enabled ? 'default' : 'secondary'} className={p.is_enabled ? 'bg-green-100 text-green-700' : ''}>
                      {p.is_enabled ? '启用' : '禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(p)} title="编辑"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggle(p)} title={p.is_enabled ? '禁用' : '启用'}>
                        <Eye className={`h-4 w-4 ${p.is_enabled ? 'text-green-600' : 'text-muted-foreground'}`} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(p)} title="删除"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">共 {total} 条</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
            <span className="px-3">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[480px]">
          <DialogHeader><DialogTitle>{editing ? '编辑页面' : '新增页面'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>所属模块</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.module_id} onChange={(e) => setForm({ ...form, module_id: e.target.value })} disabled={!!editing}>
                <option value="">请选择模块</option>
                {modules.map(m => <option key={m.id} value={m.id}>{m.name_zh}</option>)}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>页面代码 <span className="text-destructive">*</span></Label>
              <Input value={form.page_key} onChange={(e) => setForm({ ...form, page_key: e.target.value })} placeholder="如 user-list" disabled={!!editing} />
            </div>
            <div className="grid gap-2">
              <Label>页面名称 <span className="text-destructive">*</span></Label>
              <Input value={form.name_zh} onChange={(e) => setForm({ ...form, name_zh: e.target.value })} placeholder="如 用户列表" />
            </div>
            <div className="grid gap-2">
              <Label>路由路径</Label>
              <Input value={form.route_path} onChange={(e) => setForm({ ...form, route_path: e.target.value })} placeholder="/admin/users" />
            </div>
            <div className="grid gap-2">
              <Label>布局模板</Label>
              <select className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.layout_template} onChange={(e) => setForm({ ...form, layout_template: e.target.value })}>
                {LAYOUT_TEMPLATES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
              </select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{editing ? '保存' : '创建'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除页面「{deleteTarget?.name_zh}」吗？该页面下的所有字段和按钮将被级联删除。</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
