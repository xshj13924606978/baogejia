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
  { name: 'Lock', label: '锁定' },
  { name: 'CreditCard', label: '积分' },
  { name: 'Gift', label: '邀请' },
  { name: 'Bell', label: '通知' },
  { name: 'Building2', label: '供应方' },
  { name: 'Users', label: '客户' },
  { name: 'FileText', label: '条款' },
  { name: 'TrendingUp', label: '排行' },
  { name: 'BarChart3', label: '统计' },
  { name: 'History', label: '记录' },
  { name: 'LayoutDashboard', label: '管理' },
  { name: 'Settings', label: '设置' },
  { name: 'HelpCircle', label: '帮助' },
];

const API = '/api/admin/config/user-pages';
const MENUS_API = '/api/admin/config/user-menus';

interface UserMenuPage {
  id: string;
  page_key: string;
  name_zh: string;
  icon: string | null;
  route_path: string | null;
  action_type: string;
  is_enabled: boolean;
  is_visible: boolean;
  sort_order: number;
  badge_text: string | null;
  badge_type: string | null;
  config: Record<string, any>;
  menu_id: string;
  menu?: { id: string; menu_key: string; name_zh: string };
}

interface MenuOption {
  id: string;
  menu_key: string;
  name_zh: string;
}

const ACTION_TYPES = [
  { value: 'navigate', label: '路由跳转' },
  { value: 'dialog', label: '弹窗' },
  { value: 'external', label: '外部链接' },
];

const BADGE_TYPES = [
  { value: '', label: '无' },
  { value: 'info', label: '信息 (蓝色)' },
  { value: 'success', label: '成功 (绿色)' },
  { value: 'warning', label: '警告 (橙色)' },
  { value: 'danger', label: '危险 (红色)' },
];

const emptyForm = {
  menu_id: '',
  page_key: '',
  name_zh: '',
  icon: '',
  route_path: '',
  action_type: 'navigate',
  is_enabled: true,
  is_visible: true,
  sort_order: 0,
  badge_text: '',
  badge_type: '',
};

export default function ConfigUserPages() {
  const [items, setItems] = useState<UserMenuPage[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(50);
  const [total, setTotal] = useState(0);
  const [searchInput, setSearchInput] = useState('');
  const [keyword, setKeyword] = useState('');
  const [filterMenuId, setFilterMenuId] = useState('');

  const [menuOptions, setMenuOptions] = useState<MenuOption[]>([]);

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<UserMenuPage | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<UserMenuPage | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 加载菜单分组选项
  const loadMenuOptions = useCallback(async () => {
    try {
      const res = await fetch(`${MENUS_API}?all=true`);
      const data = await res.json();
      if (data.success) setMenuOptions(data.data || []);
    } catch { /* ignore */ }
  }, []);

  const loadItems = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize) });
      if (keyword) params.set('keyword', keyword);
      if (filterMenuId) params.set('menu_id', filterMenuId);
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
  }, [page, pageSize, keyword, filterMenuId]);

  useEffect(() => { loadMenuOptions(); }, [loadMenuOptions]);
  useEffect(() => { loadItems(); }, [loadItems]);

  const handleSearch = () => { setPage(1); setKeyword(searchInput); };

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, menu_id: filterMenuId || (menuOptions[0]?.id || '') });
    setDialogOpen(true);
  };

  const openEdit = (m: UserMenuPage) => {
    setEditing(m);
    setForm({
      menu_id: m.menu_id,
      page_key: m.page_key,
      name_zh: m.name_zh,
      icon: m.icon || '',
      route_path: m.route_path || '',
      action_type: m.action_type,
      is_enabled: m.is_enabled,
      is_visible: m.is_visible,
      sort_order: m.sort_order,
      badge_text: m.badge_text || '',
      badge_type: m.badge_type || '',
    });
    setDialogOpen(true);
  };

  const handleSubmit = async () => {
    if (!form.menu_id || !form.page_key || !form.name_zh) { toast.error('分组、标识和名称不能为空'); return; }
    setSubmitting(true);
    try {
      const isEdit = !!editing;
      const url = isEdit ? `${API}/${editing.id}` : API;
      const res = await fetch(url, {
        method: isEdit ? 'PUT' : 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...form,
          badge_text: form.badge_text || null,
          badge_type: form.badge_type || null,
        }),
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

  const handleToggle = async (m: UserMenuPage, field: 'is_enabled' | 'is_visible') => {
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

  const getActionTypeLabel = (type: string) => ACTION_TYPES.find(t => t.value === type)?.label || type;
  const getBadgeTypeLabel = (type: string | null) => BADGE_TYPES.find(t => t.value === type)?.label || '-';

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between gap-4">
        <div className="flex items-center gap-2 flex-1">
          <select
            className="flex h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
            value={filterMenuId}
            onChange={(e) => { setFilterMenuId(e.target.value); setPage(1); }}
          >
            <option value="">全部分组</option>
            {menuOptions.map(m => (
              <option key={m.id} value={m.id}>{m.name_zh}</option>
            ))}
          </select>
          <Input
            placeholder="搜索菜单项..."
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleSearch()}
            className="max-w-[200px]"
          />
          <Button variant="outline" size="sm" onClick={handleSearch}>搜索</Button>
          {(keyword || filterMenuId) && <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setSearchInput(''); setFilterMenuId(''); setPage(1); }}>清除</Button>}
        </div>
        <Button size="sm" onClick={openCreate}><Plus className="h-4 w-4 mr-1" /> 新增菜单项</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <GripVertical className="h-10 w-10 mb-2 opacity-30" />
          <p className="font-medium">暂无菜单项</p>
          <p className="text-sm">点击「新增菜单项」开始配置</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">排序</TableHead>
                <TableHead>标识</TableHead>
                <TableHead>名称</TableHead>
                <TableHead>图标</TableHead>
                <TableHead>所属分组</TableHead>
                <TableHead>动作类型</TableHead>
                <TableHead>路径</TableHead>
                <TableHead>徽标</TableHead>
                <TableHead>启用</TableHead>
                <TableHead className="w-[140px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((m) => (
                <TableRow key={m.id}>
                  <TableCell className="text-muted-foreground text-sm">{m.sort_order}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{m.page_key}</code></TableCell>
                  <TableCell className="font-medium">{m.name_zh}</TableCell>
                  <TableCell>{m.icon ? <code className="text-xs text-muted-foreground bg-muted px-1.5 py-0.5 rounded">{m.icon}</code> : '-'}</TableCell>
                  <TableCell><Badge variant="outline">{m.menu?.name_zh || '-'}</Badge></TableCell>
                  <TableCell><Badge variant="secondary">{getActionTypeLabel(m.action_type)}</Badge></TableCell>
                  <TableCell><code className="text-xs text-muted-foreground">{m.route_path || '-'}</code></TableCell>
                  <TableCell>
                    {m.badge_type ? (
                      <Badge variant={m.badge_type === 'danger' ? 'destructive' : 'secondary'}>
                        {m.badge_text || getBadgeTypeLabel(m.badge_type)}
                      </Badge>
                    ) : '-'}
                  </TableCell>
                  <TableCell>
                    <Badge variant={m.is_enabled ? 'default' : 'secondary'} className={m.is_enabled ? 'bg-green-100 text-green-700 hover:bg-green-100 cursor-pointer' : 'cursor-pointer'} onClick={() => handleToggle(m, 'is_enabled')}>
                      {m.is_enabled ? '启用' : '禁用'}
                    </Badge>
                  </TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="sm" className="h-8 gap-1" onClick={() => openEdit(m)}><Edit className="h-3.5 w-3.5" />编辑</Button>
                      <Button variant="ghost" size="sm" className="h-8 gap-1 text-destructive hover:text-destructive" onClick={() => setDeleteTarget(m)}><Trash2 className="h-3.5 w-3.5" /></Button>
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
        <DialogContent className="max-w-[550px]">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑菜单项' : '新增菜单项'}</DialogTitle>
          </DialogHeader>
          <div className="grid gap-4 py-4 max-h-[60vh] overflow-y-auto">
            <div className="grid gap-2">
              <Label>所属分组 <span className="text-destructive">*</span></Label>
              <select
                className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                value={form.menu_id}
                onChange={(e) => setForm({ ...form, menu_id: e.target.value })}
              >
                <option value="">请选择分组</option>
                {menuOptions.map(m => (
                  <option key={m.id} value={m.id}>{m.name_zh}</option>
                ))}
              </select>
            </div>
            <div className="grid gap-2">
              <Label>页面标识 <span className="text-destructive">*</span></Label>
              <Input value={form.page_key} onChange={(e) => setForm({ ...form, page_key: e.target.value })} placeholder="如 profile, change_password" disabled={!!editing} />
            </div>
            <div className="grid gap-2">
              <Label>菜单项名称 <span className="text-destructive">*</span></Label>
              <Input value={form.name_zh} onChange={(e) => setForm({ ...form, name_zh: e.target.value })} placeholder="如 个人资料、修改密码" />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>图标</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                  value={form.icon}
                  onChange={(e) => setForm({ ...form, icon: e.target.value })}
                >
                  <option value="">继承分组图标</option>
                  {ICON_OPTIONS.map(({ name, label }) => (
                    <option key={name} value={name}>{label} ({name})</option>
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
                <Label>动作类型</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                  value={form.action_type}
                  onChange={(e) => setForm({ ...form, action_type: e.target.value })}
                >
                  {ACTION_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
              <div className="grid gap-2">
                <Label>徽标类型</Label>
                <select
                  className="flex h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm shadow-sm transition-colors"
                  value={form.badge_type}
                  onChange={(e) => setForm({ ...form, badge_type: e.target.value })}
                >
                  {BADGE_TYPES.map(t => (
                    <option key={t.value} value={t.value}>{t.label}</option>
                  ))}
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>路由路径</Label>
              <Input value={form.route_path} onChange={(e) => setForm({ ...form, route_path: e.target.value })} placeholder="/profile, /settings" />
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
            <AlertDialogDescription>确定要删除菜单项「{deleteTarget?.name_zh}」吗？该菜单项下的字段和按钮将被级联删除。</AlertDialogDescription>
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
