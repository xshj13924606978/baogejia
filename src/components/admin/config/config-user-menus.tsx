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

const ICON_OPTIONS: { name: string; label: string }[] = [
  { name: 'User', label: '用户' },
  { name: 'Briefcase', label: '商务' },
  { name: 'BarChart3', label: '统计' },
  { name: 'Settings', label: '设置' },
  { name: 'Bell', label: '通知' },
  { name: 'Star', label: '收藏' },
  { name: 'Shield', label: '安全' },
  { name: 'Home', label: '首页' },
  { name: 'Building2', label: '企业' },
  { name: 'FileText', label: '文档' },
  { name: 'CreditCard', label: '支付' },
  { name: 'Gift', label: '礼物' },
  { name: 'Users', label: '用户组' },
  { name: 'History', label: '历史' },
  { name: 'TrendingUp', label: '趋势' },
  { name: 'HelpCircle', label: '帮助' },
  { name: 'LayoutDashboard', label: '仪表盘' },
  { name: 'Lock', label: '锁定' },
];

const API = '/api/admin/config/user-menus';

interface UserMenu {
  id: string;
  menu_key: string;
  name_zh: string;
  name_en: string | null;
  icon: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_visible: boolean;
  description: string | null;
  permission_code: string | null;
  page_count?: number;
}

const emptyForm = { menu_key: '', name_zh: '', icon: '', sort_order: 0, is_enabled: true, is_visible: true, description: '' };

export default function ConfigUserMenus() {
  const [items, setItems] = useState<UserMenu[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserMenu | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserMenu | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), with_page_count: 'true' });
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

  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSearch = () => { setPage(1); setKeyword(searchInput); };

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setDialogOpen(true);
  };

  const openEdit = (m: UserMenu) => {
    setEditing(m);
    setForm({
      menu_key: m.menu_key,
      name_zh: m.name_zh,
      icon: m.icon || '',
      sort_order: m.sort_order,
      is_enabled: m.is_enabled,
      is_visible: m.is_visible,
      description: m.description || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.menu_key || !form.name_zh) { toast.error('标识和名称不能为空'); return; }
    setSubmitting(true);
    try {
      const isEdit = !!editing;
      const url = isEdit ? `${API}/${editing.id}` : API;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
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

  const handleToggle = async (m: UserMenu, field: 'is_enabled' | 'is_visible') => {
    try {
      const res = await fetch(`${API}/${m.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ [field]: !m[field] }),
      });
      const data = await res.json();
      if (data.success) { toast.success(m[field] ? '已关闭' : '已开启'); loadItems(); }
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
          <Input
            placeholder="搜索菜单分组..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-[240px]"
          />
          <Button variant="outline" size="sm" onClick={handleSearch}>搜索</Button>
          {keyword && <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setSearchInput(''); setPage(1); }}>清除</Button>}
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> 新增分组</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <GripVertical className="h-10 w-10 mb-2 opacity-30" />
          <p className="font-medium">暂无菜单分组</p>
          <p className="text-sm">点击「新增分组」开始配置</p>
        </div>
      ) : (
        <div className="border rounded-md">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">排序</TableHead>
                <TableHead>标识</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>图标</TableHead>
                <TableHead>启用</TableHead>
                <TableHead>可见</TableHead>
                <TableHead>菜单项</TableHead>
                <TableHead className="w-[180px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-muted-foreground text-sm">{m.sort_order}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{m.menu_key}</code></TableCell>
                  <TableCell className="font-medium">{m.name_zh}</TableCell>
                  <TableCell>{m.icon ? <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{m.icon}</code> : <span className="text-muted-foreground text-xs">-</span>}</TableCell>
                  <TableCell>
                    <Badge variant={m.is_enabled ? 'default' : 'secondary'} className={m.is_enabled ? 'bg-green-100 text-green-700 hover:bg-green-100 cursor-pointer' : 'cursor-pointer'} onClick={() => handleToggle(m, 'is_enabled')}>
                      {m.is_enabled ? '已启用' : '已禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.is_visible ? 'default' : 'secondary'} className={m.is_visible ? 'bg-blue-100 text-blue-700 hover:bg-blue-100 cursor-pointer' : 'cursor-pointer'} onClick={() => handleToggle(m, 'is_visible')}>
                      {m.is_visible ? '可见' : '隐藏'}
                    </Badge>
                  </TableCell>
                  <TableCell className="text-center">{m.page_count ?? '-'}</TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => openEdit(m)}><Edit className="h-3.5 w-3.5" />编辑</Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(m)}><Trash2 className="h-3.5 w-3.5" />删除</Button>
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
            <DialogTitle>{editing ? '编辑菜单分组' : '新增菜单分组'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid gap-2">
              <Label>分组标识 <span className="text-destructive">*</span></Label>
              <Input value={form.menu_key} onChange={(e) => setForm({ ...form, menu_key: e.target.value })} placeholder="如 my_account, business_info" disabled={!!editing} />
            </div>
            <div className="grid gap-2">
              <Label>分组名称 <span className="text-destructive">*</span></Label>
              <Input value={form.name_zh} onChange={(e) => setForm({ ...form, name_zh: e.target.value })} placeholder="如 我的账户、商务信息" />
            </div>
            <div className="grid gap-2">
              <Label>图标</Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                value={form.icon}
                onChange={(e) => setForm({ ...form, icon: e.target.value })}
              >
                <option value="">请选择图标</option>
                {ICON_OPTIONS.map(({ name, label }) => (
                  <option key={name} value={name}>{label} ({name})</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>排序</Label>
              <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>启用状态</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                  value={form.is_enabled ? 'true' : 'false'}
                  onChange={(e) => setForm({ ...form, is_enabled: e.target.value === 'true' })}
                >
                  <option value="true">已启用</option>
                  <option value="false">已禁用</option>
                </select>
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
            <div className="grid gap-2">
              <Label>描述</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} placeholder="菜单分组描述" />
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
            <AlertDialogDescription>确定要删除菜单分组「{deleteTarget?.name_zh}」吗？该分组下的所有菜单项、字段和按钮将被级联删除，此操作不可恢复。</AlertDialogDescription>
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
