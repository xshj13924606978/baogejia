'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Eye, Loader2, GripVertical } from 'lucide-react';
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
import { Empty } from '@/components/ui/empty';
const API = '/api/admin/config/modules';

interface Module {
  id: string;
  module_key: string;
  name_zh: string;
  name_en: string | null;
  icon: string | null;
  path: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_visible_in_menu: boolean;
  parent_module_id: string | null;
  config: Record<string, unknown>;
  parent?: { id: string; module_key: string; name_zh: string } | null;
  enabled_page_count?: number;
}

const emptyForm = { module_key: '', name_zh: '', name_en: '', icon: '', path: '', sort_order: 0, is_enabled: true, is_visible_in_menu: true, parent_module_id: '' as string };

export default function ConfigModules() {
  const [items, setItems] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<Module | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<Module | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 模块列表（用于父级选择，排除递归）
  const [allModules, setAllModules] = useState<Module[]>([]);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (keyword) params.set('keyword', keyword);
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
  }, [page, pageSize, keyword]);

  const loadAllModules = useCallback(async () => {
    const res = await fetch(`${API}?all=true`);
    const data = await res.json();
    if (data.success) setAllModules(data.data || []);
  }, []);

  useEffect(() => { loadItems(); loadAllModules(); }, [loadItems, loadAllModules]);

  const handleSearch = () => { setPage(1); setKeyword(searchInput); };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (m: Module) => {
    setEditing(m);
    setForm({
      module_key: m.module_key,
      name_zh: m.name_zh,
      name_en: m.name_en || '',
      icon: m.icon || '',
      path: m.path || '',
      sort_order: m.sort_order,
      is_enabled: m.is_enabled,
      is_visible_in_menu: m.is_visible_in_menu,
      parent_module_id: m.parent_module_id || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.module_key || !form.name_zh) { toast.error('模块代码和名称不能为空'); return; }
    setSubmitting(true);
    try {
      const res = await fetch(API, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, module_key: form.module_key || undefined, parent_module_id: form.parent_module_id || null }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editing ? '更新成功' : '创建成功');
        setDialogOpen(false);
        loadItems();
        loadAllModules();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  const handleToggle = async (m: Module) => {
    try {
      const res = await fetch(`${API}/${m.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ is_enabled: !m.is_enabled }),
      });
      const data = await res.json();
      if (data.success) { toast.success(m.is_enabled ? '已禁用' : '已启用'); loadItems(); }
      else toast.error(data.error || '操作失败');
    } catch { toast.error('网络错误'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast.success('已删除'); loadItems(); loadAllModules(); }
      else toast.error(data.error || '删除失败');
    } catch { toast.error('网络错误'); }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {/* 顶部操作栏 */}
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <Input
            placeholder="搜索模块..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-[240px]"
          />
          <Button variant="outline" size="sm" onClick={handleSearch}>搜索</Button>
          {keyword && <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setSearchInput(''); setPage(1); }}>清除</Button>}
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> 新增模块</Button>
      </div>

      {/* 列表 */}
      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <GripVertical className="h-10 w-10 mb-2 opacity-30" />
          <p className="font-medium">暂无模块</p>
          <p className="text-sm">{'点击「新增模块」开始配置'}</p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">排序</TableHead>
                <TableHead>模块代码</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>图标</TableHead>
                <TableHead>路径</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>页面数</TableHead>
                <TableHead className="w-[180px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-muted-foreground text-sm">{m.sort_order}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{m.module_key}</code></TableCell>
                  <TableCell className="font-medium">{m.name_zh}</TableCell>
                  <TableCell>{m.icon ? <code className="text-xs text-muted-foreground">{m.icon}</code> : '-'}</TableCell>
                  <TableCell><code className="text-xs text-muted-foreground">{m.path || '-'}</code></TableCell>
                  <TableCell>
                    <Badge variant={m.is_enabled ? 'default' : 'secondary'} className={m.is_enabled ? 'bg-green-100 text-green-700 hover:bg-green-100' : ''}>
                      {m.is_enabled ? '启用' : '禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{(m as any).enabled_page_count ?? '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)} title="编辑"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => handleToggle(m)} title={m.is_enabled ? '禁用' : '启用'}>
                        <Eye className={`h-4 w-4 ${m.is_enabled ? 'text-green-600' : 'text-muted-foreground'}`} />
                      </Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(m)} title="删除"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {/* 分页 */}
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
          <DialogHeader>
            <DialogTitle>{editing ? '编辑模块' : '新增模块'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>模块代码 <span className="text-destructive">*</span></Label>
              <Input value={form.module_key} onChange={(e) => setForm({ ...form, module_key: e.target.value })} placeholder="如 user_management" disabled={!!editing} />
            </div>
            <div className="grid gap-2">
              <Label>中文名称 <span className="text-destructive">*</span></Label>
              <Input value={form.name_zh} onChange={(e) => setForm({ ...form, name_zh: e.target.value })} placeholder="如 用户管理" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>英文名称</Label>
                <Input value={form.name_en} onChange={(e) => setForm({ ...form, name_en: e.target.value })} placeholder="User Management" />
              </div>
              <div className="grid gap-2">
                <Label>图标</Label>
                <Input value={form.icon} onChange={(e) => setForm({ ...form, icon: e.target.value })} placeholder="lucide-react 图标名" />
              </div>
            </div>
            <div className="grid gap-2">
              <Label>路由路径</Label>
              <Input value={form.path} onChange={(e) => setForm({ ...form, path: e.target.value })} placeholder="/admin/users" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>排序</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>父模块</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                  value={form.parent_module_id || ''}
                  onChange={(e) => setForm({ ...form, parent_module_id: e.target.value || '' })}
                >
                  <option value="">无（顶级模块）</option>
                  {allModules.filter(m => m.id !== editing?.id).map(m => (
                    <option key={m.id} value={m.id}>{m.name_zh} ({m.module_key})</option>
                  ))}
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

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除模块「{deleteTarget?.name_zh}」吗？该模块下的所有页面、字段和按钮将被级联删除，此操作不可恢复。</AlertDialogDescription>
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
