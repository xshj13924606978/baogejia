'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Eye, Loader2, MousePointerClick } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';

const API = '/api/admin/config/actions';
const MODULES_API = '/api/admin/config/modules';
const PAGES_API = '/api/admin/config/pages';

const HTTP_METHODS = [
  { value: 'GET', label: 'GET（查询）' },
  { value: 'POST', label: 'POST（创建）' },
  { value: 'PUT', label: 'PUT（更新）' },
  { value: 'DELETE', label: 'DELETE（删除）' },
  { value: 'PATCH', label: 'PATCH（部分更新）' },
];

const HTTP_METHOD_LABELS: Record<string, string> = Object.fromEntries(HTTP_METHODS.map(m => [m.value, m.label]));

interface ActionItem {
  id: string;
  page_id: string;
  action_key: string;
  name_zh: string;
  api_endpoint: string | null;
  http_method: string;
  is_visible: boolean;
  permission_required: string | null;
  sort_order: number;
  config: Record<string, unknown>;
  page?: { id: string; page_key: string; name_zh: string } | null;
}

const emptyForm = {
  page_id: '', action_key: '', name_zh: '', api_endpoint: '',
  http_method: 'POST', permission_required: '', sort_order: 0, is_visible: true,
};

export default function ConfigActions() {
  const [items, setItems] = useState<ActionItem[]>([]);
  const [modules, setModules] = useState<{ id: string; name_zh: string }[]>([]);
  const [pages, setPages] = useState<{ id: string; name_zh: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);
  const [filterModule, setFilterModule] = useState('');
  const [filterPage, setFilterPage] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<ActionItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<ActionItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadModules = useCallback(async () => {
    const res = await fetch(`${MODULES_API}?all=true`);
    const data = await res.json();
    if (data.success) setModules((data.data || []).map((m: any) => ({ id: m.id, module_name: m.module_name })));
  }, []);

  const loadPages = useCallback(async (moduleId: string) => {
    if (!moduleId) { setPages([]); return; }
    const res = await fetch(`${PAGES_API}?module_id=${moduleId}&limit=200`);
    const data = await res.json();
    if (data.success) setPages((data.data || []).map((p: any) => ({ id: p.id, name_zh: p.name_zh })));
  }, []);

  useEffect(() => { loadModules(); }, [loadModules]);
  useEffect(() => { loadPages(filterModule); }, [filterModule, loadPages]);

  const loadItems = useCallback(async () => {
    if (!filterPage) { setItems([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), page_id: filterPage });
      const res = await fetch(`${API}?${params}`);
      const data = await res.json();
      if (data.success) { setItems(data.data || []); setTotal(data.total || 0); }
      else toast.error(data.error || '加载失败');
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  }, [page, pageSize, filterPage]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, page_id: filterPage });
    setDialogOpen(true);
  };

  const openEdit = (a: ActionItem) => {
    setEditing(a);
    setForm({
      page_id: a.page_id,
      action_key: a.action_key,
      name_zh: a.name_zh,
      api_endpoint: a.api_endpoint || '',
      http_method: a.http_method,
      permission_required: a.permission_required || '',
      sort_order: a.sort_order,
      is_visible: a.is_visible,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.page_id || !form.action_key || !form.name_zh) { toast.error('页面、按钮代码和名称不能为空'); return; }
    setSubmitting(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `${API}/${editing.id}` : API;
      const body: Record<string, unknown> = { ...form, permission_required: form.permission_required || null };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) { toast.success(editing ? '更新成功' : '创建成功'); setDialogOpen(false); loadItems(); }
      else toast.error(data.error || '操作失败');
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  const handleToggle = async (a: ActionItem) => {
    try {
      const res = await fetch(`${API}/${a.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ is_visible: !a.is_visible }) });
      const data = await res.json();
      if (data.success) loadItems();
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

  const methodColor: Record<string, string> = {
    GET: 'bg-blue-100 text-blue-700',
    POST: 'bg-green-100 text-green-700',
    PUT: 'bg-yellow-100 text-yellow-700',
    DELETE: 'bg-red-100 text-red-700',
    PATCH: 'bg-purple-100 text-purple-700',
  };

  return (
    <div className="space-y-4">
      <div className="flex items-center gap-2 flex-1">
        <select className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={filterModule} onChange={(e) => { setFilterModule(e.target.value); setFilterPage(''); setPage(1); }}>
          <option value="">选择模块</option>
          {modules.map(m => <option key={m.id} value={m.id}>{m.module_name}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={filterPage} onChange={(e) => { setFilterPage(e.target.value); setPage(1); }} disabled={!filterModule}>
          <option value="">选择页面</option>
          {pages.map(p => <option key={p.id} value={p.id}>{p.name_zh}</option>)}
        </select>
        <div className="flex-1" />
        <Button size="sm" onClick={openCreate} disabled={!filterPage}><Plus className="h-4 w-4 mr-1" /> 新增按钮</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <MousePointerClick className="h-10 w-10 mb-2 opacity-30" />
          <p className="font-medium">暂无按钮</p>
          <p className="text-sm">{filterPage ? '该页面下还没有按钮配置' : '请先选择模块和页面'}</p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">排序</TableHead>
                <TableHead>按钮代码</TableHead>
                <TableHead>按钮名称</TableHead>
                <TableHead>API 端点</TableHead>
                <TableHead>方法</TableHead>
                <TableHead>权限</TableHead>
                <TableHead>可见</TableHead>
                <TableHead className="w-[120px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-muted-foreground text-sm">{a.sort_order}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{a.action_key}</code></TableCell>
                  <TableCell className="font-medium">{a.name_zh}</TableCell>
                  <TableCell><code className="text-xs text-muted-foreground">{a.api_endpoint || '-'}</code></TableCell>
                  <TableCell>
                    {a.http_method && <Badge className={`text-xs ${methodColor[a.http_method] || ''}`}>{HTTP_METHOD_LABELS[a.http_method] || a.http_method}</Badge>}
                  </TableCell>
                  <TableCell><code className="text-xs text-muted-foreground">{a.permission_required || '-'}</code></TableCell>
                  <TableCell>
                    <Badge variant={a.is_visible ? 'default' : 'secondary'} className={`text-xs cursor-pointer ${a.is_visible ? 'bg-green-100 text-green-700' : ''}`} onClick={() => handleToggle(a)}>{a.is_visible ? '是' : '否'}</Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(a)} title="编辑"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(a)} title="删除"><Trash2 className="h-4 w-4" /></Button>
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
        <DialogContent className="max-w-[500px]">
          <DialogHeader><DialogTitle>{editing ? '编辑按钮' : '新增按钮'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>按钮代码 <span className="text-destructive">*</span></Label>
                <Input value={form.action_key} onChange={(e) => setForm({ ...form, action_key: e.target.value })} placeholder="create" disabled={!!editing} />
              </div>
              <div className="grid gap-2">
                <Label>按钮名称 <span className="text-destructive">*</span></Label>
                <Input value={form.name_zh} onChange={(e) => setForm({ ...form, name_zh: e.target.value })} placeholder="新增" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>API 端点</Label>
              <Input value={form.api_endpoint} onChange={(e) => setForm({ ...form, api_endpoint: e.target.value })} placeholder="/api/admin/users" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>HTTP 方法</Label>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.http_method} onChange={(e) => setForm({ ...form, http_method: e.target.value })}>
                  {HTTP_METHODS.map(m => <option key={m.value} value={m.value}>{m.label}</option>)}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>排序</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>权限代码</Label>
              <Input value={form.permission_required} onChange={(e) => setForm({ ...form, permission_required: e.target.value })} placeholder="user.create" />
            </div>
            <label className="flex items-center gap-2 text-sm cursor-pointer">
              <input type="checkbox" checked={form.is_visible} onChange={(e) => setForm({ ...form, is_visible: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
              可见
            </label>
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
            <AlertDialogDescription>确定要删除按钮「{deleteTarget?.name_zh}」吗？</AlertDialogDescription>
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
