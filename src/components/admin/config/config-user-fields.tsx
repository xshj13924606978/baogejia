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

const FIELD_TYPES = [
  'text', 'number', 'select', 'date', 'datetime', 'textarea', 'json',
  'file', 'image', 'switch', 'email', 'phone', 'url', 'tag',
];

const API = '/api/admin/config/user-fields';
const PAGES_API = '/api/admin/config/user-pages';

interface UserField {
  id: string;
  field_key: string;
  field_type: string;
  label_zh: string;
  is_visible: boolean;
  is_editable: boolean;
  is_required: boolean;
  sort_order: number;
  group_name: string | null;
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
  field_key: '',
  field_type: 'text',
  label_zh: '',
  is_visible: true,
  is_editable: true,
  is_required: false,
  sort_order: 0,
  group_name: '',
};

export default function ConfigUserFields() {
  const [items, setItems] = useState<UserField[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [filterPageId, setFilterPageId] = useState('');

  const [pageOptions, setPageOptions] = useState<PageOption[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserField | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserField | null>(null);
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

  const openEdit = (f: UserField) => {
    setEditing(f);
    setForm({
      page_id: f.page_id,
      field_key: f.field_key,
      field_type: f.field_type,
      label_zh: f.label_zh,
      is_visible: f.is_visible,
      is_editable: f.is_editable,
      is_required: f.is_required,
      sort_order: f.sort_order,
      group_name: f.group_name || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.page_id || !form.field_key || !form.label_zh) { toast.error('页面、标识和标签不能为空'); return; }
    setSubmitting(true);
    try {
      const isEdit = !!editing;
      const url = isEdit ? `${API}/${editing.id}` : API;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, group_name: form.group_name || null }),
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

  const handleToggle = async (f: UserField, field: 'is_visible' | 'is_editable' | 'is_required') => {
    try {
      const res = await fetch(`${API}/${f.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: !f[field] }),
      });
      const data = await res.json();
      if (data.success) { loadItems(); }
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
            placeholder="搜索字段..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-[200px]"
          />
          <Button variant="outline" size="sm" onClick={handleSearch}>搜索</Button>
          {(keyword || filterPageId) && <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setSearchInput(''); setFilterPageId(''); setPage(1); }}>清除</Button>}
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> 新增字段</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <GripVertical className="h-10 w-10 mb-2 opacity-30" />
          <p className="font-medium">暂无字段</p>
          <p className="text-sm">点击「新增字段」开始配置</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">排序</TableHead>
                <TableHead>标识</TableHead>
                <TableHead>标签</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>所属页面</TableHead>
                <TableHead>分组</TableHead>
                <TableHead>可见</TableHead>
                <TableHead>可编辑</TableHead>
                <TableHead>必填</TableHead>
                <TableHead className="w-[140px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="text-muted-foreground text-sm">{f.sort_order}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{f.field_key}</code></TableCell>
                  <TableCell className="font-medium">{f.label_zh}</TableCell>
                  <TableCell><Badge variant="outline">{f.field_type}</Badge></TableCell>
                  <TableCell><Badge variant="secondary">{f.page?.name_zh || '-'}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm">{f.group_name || '-'}</TableCell>
                  <TableCell>
                    <Badge variant={f.is_visible ? 'default' : 'secondary'} className={f.is_visible ? 'bg-green-100 text-green-700 hover:bg-green-100 cursor-pointer' : 'cursor-pointer'} onClick={() => handleToggle(f, 'is_visible')}>
                      {f.is_visible ? '是' : '否'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.is_editable ? 'default' : 'secondary'} className={f.is_editable ? 'bg-blue-100 text-blue-700 hover:bg-blue-100 cursor-pointer' : 'cursor-pointer'} onClick={() => handleToggle(f, 'is_editable')}>
                      {f.is_editable ? '是' : '否'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={f.is_required ? 'default' : 'secondary'} className={f.is_required ? 'bg-amber-100 text-amber-700 hover:bg-amber-100 cursor-pointer' : 'cursor-pointer'} onClick={() => handleToggle(f, 'is_required')}>
                      {f.is_required ? '是' : '否'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => openEdit(f)}><Edit className="h-3.5 w-3.5" />编辑</Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(f)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
            <DialogTitle>{editing ? '编辑字段' : '新增字段'}</DialogTitle>
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
                <Label>字段标识 <span className="text-destructive">*</span></Label>
                <Input value={form.field_key} onChange={(e) => setForm({ ...form, field_key: e.target.value })} placeholder="如 username" disabled={!!editing} />
              </div>
              <div className="grid gap-2">
                <Label>字段标签 <span className="text-destructive">*</span></Label>
                <Input value={form.label_zh} onChange={(e) => setForm({ ...form, label_zh: e.target.value })} placeholder="如 用户名" />
              </div>
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>字段类型</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                  value={form.field_type}
                  onChange={(e) => setForm({ ...form, field_type: e.target.value })}
                >
                  {FIELD_TYPES.map(t => (
                    <option key={t} value={t}>{t}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>排序</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>分组名</Label>
              <Input value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} placeholder="如 基本信息、联系方式" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_visible" checked={form.is_visible} onChange={(e) => setForm({ ...form, is_visible: e.target.checked })} className="rounded" />
                <Label htmlFor="is_visible" className="cursor-pointer">可见</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_editable" checked={form.is_editable} onChange={(e) => setForm({ ...form, is_editable: e.target.checked })} className="rounded" />
                <Label htmlFor="is_editable" className="cursor-pointer">可编辑</Label>
              </div>
              <div className="flex items-center gap-2">
                <input type="checkbox" id="is_required" checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} className="rounded" />
                <Label htmlFor="is_required" className="cursor-pointer">必填</Label>
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
            <AlertDialogDescription>确定要删除字段「{deleteTarget?.label_zh}」吗？</AlertDialogDescription>
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
