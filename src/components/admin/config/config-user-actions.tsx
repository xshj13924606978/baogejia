'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Loader2, GripVertical } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter,
} from '@/components/ui/dialog';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Label } from '@/components/ui/label';

const HTTP_METHODS = ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'];

const API = '/api/admin/config/user-actions';
const PAGES_API = '/api/admin/config/user-pages';

interface UserAction {
  id: string;
  action_key: string;
  name_zh: string;
  api_endpoint: string | null;
  http_method: string;
  is_visible: boolean;
  permission_required: string | null;
  sort_order: number;
  page_id: string;
  page?: { id: string; page_key: string; name_zh: string };
}

interface PageOption {
  id: string;
  page_key: string;
  name_zh: string;
}

const emptyForm = {
  page_id: '',
  action_key: '',
  name_zh: '',
  api_endpoint: '',
  http_method: 'POST',
  is_visible: true,
  permission_required: '',
  sort_order: 0,
};

export default function ConfigUserActions() {
  const [items, setItems] = useState<UserAction[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [filterPageId, setFilterPageId] = useState('');

  const [pageOptions, setPageOptions] = useState<PageOption[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserAction | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserAction | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadPageOptions = useCallback(async () => {
    try {
      const res = await fetch(`${PAGES_API}?all=true&limit=200`);
      const data = await res.json();
      if (data.success) setPageOptions(data.data || []);
    } catch { /* ignore */ }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (keyword) params.set('keyword', keyword);
      if (filterPageId) params.set('page_id', filterPageId);
      const res = await fetch(`${API}?${params}`);
      const data = await res.json();
      if (data.success) {
        setItems(data.data || []);
        setTotal(data.total || 0);
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [page, pageSize, keyword, filterPageId]);

  useEffect(() => { loadPageOptions(); }, [loadPageOptions]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSearch = () => { setPage(1); setKeyword(searchInput); };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, page_id: filterPageId || (pageOptions[0]?.id || '') });
    setDialogOpen(true);
  };

  const openEdit = (a: UserAction) => {
    setEditing(a);
    setForm({
      page_id: a.page_id,
      action_key: a.action_key,
      name_zh: a.name_zh,
      api_endpoint: a.api_endpoint || '',
      http_method: a.http_method,
      is_visible: a.is_visible,
      permission_required: a.permission_required || '',
      sort_order: a.sort_order,
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.page_id || !form.action_key || !form.name_zh) { toast.error('页面、标识和名称不能为空'); return; }
    setSubmitting(true);
    try {
      const isEdit = !!editing;
      const url = isEdit ? `${API}/${editing.id}` : API;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, permission_required: form.permission_required || null }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(isEdit ? '更新成功' : '创建成功');
        setDialogOpen(false);
        loadItems();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
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

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <select
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
            value={filterPageId}
            onChange={(e) => { setFilterPageId(e.target.value); setPage(1); }}
          >
            <option value="">全部页面</option>
            {pageOptions.map(p => (
              <option key={p.id} value={p.id}>{p.name_zh}</option>
            ))}
          </select>
          <Input
            placeholder="搜索按钮..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-[200px]"
          />
          <Button variant="outline" size="sm" onClick={handleSearch}>搜索</Button>
          {(keyword || filterPageId) && <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setSearchInput(''); setFilterPageId(''); setPage(1); }}>清除</Button>}
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> 新增按钮</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <GripVertical className="h-10 w-10 mb-2 opacity-30" />
          <p className="font-medium">暂无按钮</p>
          <p className="text-sm">点击「新增按钮」开始配置</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">排序</TableHead>
                <TableHead>标识</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>所属页面</TableHead>
                <TableHead>API 端点</TableHead>
                <TableHead>方法</TableHead>
                <TableHead>权限</TableHead>
                <TableHead>可见</TableHead>
                <TableHead className="w-[140px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((a) => (
                <TableRow key={a.id}>
                  <TableCell className="text-muted-foreground text-sm">{a.sort_order}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{a.action_key}</code></TableCell>
                  <TableCell className="font-medium">{a.name_zh}</TableCell>
                  <TableCell><Badge variant="secondary">{a.page?.name_zh || '-'}</Badge></TableCell>
                  <TableCell><code className="text-xs text-muted-foreground">{a.api_endpoint || '-'}</code></TableCell>
                  <TableCell><Badge variant="outline">{a.http_method}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm">{a.permission_required || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={a.is_visible ? 'default' : 'secondary'} className={a.is_visible ? 'bg-green-100 text-green-700' : ''}>
                      {a.is_visible ? '可见' : '隐藏'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => openEdit(a)}><Edit className="h-3.5 w-3.5" />编辑</Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(a)}><Trash2 className="h-3.5 w-3.5" /></Button>
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

      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[500px]">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑按钮' : '新增按钮'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>所属页面 <span className="text-destructive">*</span></Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                value={form.page_id}
                onChange={(e) => setForm({ ...form, page_id: e.target.value })}
              >
                <option value="">请选择页面</option>
                {pageOptions.map(p => (
                  <option key={p.id} value={p.id}>{p.name_zh}</option>
                ))}
              </select>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>按钮标识 <span className="text-destructive">*</span></Label>
                <Input value={form.action_key} onChange={(e) => setForm({ ...form, action_key: e.target.value })} placeholder="如 save, cancel" disabled={!!editing} />
              </div>
              <div className="grid gap-2">
                <Label>按钮名称 <span className="text-destructive">*</span></Label>
                <Input value={form.name_zh} onChange={(e) => setForm({ ...form, name_zh: e.target.value })} placeholder="如 保存、取消" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>API 端点</Label>
              <Input value={form.api_endpoint} onChange={(e) => setForm({ ...form, api_endpoint: e.target.value })} placeholder="/api/user/profile" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>HTTP 方法</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                  value={form.http_method}
                  onChange={(e) => setForm({ ...form, http_method: e.target.value })}
                >
                  {HTTP_METHODS.map(m => (
                    <option key={m} value={m}>{m}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>排序</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>权限代码</Label>
                <Input value={form.permission_required} onChange={(e) => setForm({ ...form, permission_required: e.target.value })} placeholder="如 user:profile:edit" />
              </div>
              <div className="grid gap-2">
                <Label>可见性</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                  value={form.is_visible ? 'true' : 'false'}
                  onChange={(e) => setForm({ ...form, is_visible: e.target.value === 'true' })}
                >
                  <option value="true">可见</option>
                  <option value="false">隐藏</option>
                </select>
              </div>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{editing ? '保存' : '创建'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

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
