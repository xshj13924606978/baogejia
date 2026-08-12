'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Input } from '@/components/ui/input';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuLabel, DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  Search, Download, UserPlus, MoreHorizontal,
  Shield, Edit2, Trash2, Ban, CheckCircle, Gift,
  Users as UsersIcon, Building2, Star, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';
import { getRoleDisplayName, getUserStatusDisplayName, ROLE_OPTIONS, USER_STATUS_OPTIONS, UserStatus } from '@/lib/auth/roles';
import { usePageConfig } from '@/hooks/usePageConfig';
import { DynamicTable, DynamicPagination } from '@/components/admin/dynamic-table';

interface User {
  id: string;
  name: string;
  email: string;
  username?: string;
  role: string;
  status: string;
  phone?: string;
  avatar?: string;
  points: number;
  createdAt: string;
  lastLogin?: string;
  level?: number;
  metadata?: Record<string, any>;
}

export default function UsersPage() {
  const { fields, getField, actionsByPosition } = usePageConfig('user_list');
  const router = useRouter();

  // 从动态配置中提取 select 字段的选项列表，未配置时使用系统默认选项兜底
  const getSelectOptions = (fieldKey: string): { value: string; label: string; color?: string }[] => {
    const field = getField(fieldKey);
    if (!field?.options_config) {
      // 当后台未配置角色/状态选项时，使用系统默认选项兜底
      if (fieldKey === 'role') return ROLE_OPTIONS;
      if (fieldKey === 'status') return USER_STATUS_OPTIONS;
      return [];
    }
    const opts = (field.options_config as any).options || field.options_config;
    if (!Array.isArray(opts)) return [];
    return opts.map((o: any) => ({ value: o.value, label: o.label, color: o.color }));
  };

  const roleOptions = getSelectOptions('role');
  const statusOptions = getSelectOptions('status');

  const [users, setUsers] = useState<User[]>([]);
  const [loading, setLoading] = useState(true);
  const [totalCount, setTotalCount] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 搜索和筛选
  const [searchTerm, setSearchTerm] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [selectedRole, setSelectedRole] = useState<string>('all');
  const [selectedStatus, setSelectedStatus] = useState<string>('all');

  // 对话框
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editUser, setEditUser] = useState<User | null>(null);
  const [deleteUser, setDeleteUser] = useState<User | null>(null);
  const [submitting, setSubmitting] = useState(false);

  // 批量选择
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [showBatchDeleteDialog, setShowBatchDeleteDialog] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  // 添加用户表单
  const [addForm, setAddForm] = useState({ name: '', email: '', username: '', password: '', role: 'free', phone: '' });
  // 编辑用户表单
  const [editForm, setEditForm] = useState({ name: '', email: '', role: '', phone: '' });

  const loadUsers = useCallback(async () => {
    setLoading(true);
    setSelectedIds(new Set()); // 翻页/搜索/筛选时清除选择
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (searchTerm) params.set('keyword', searchTerm);
      if (selectedRole !== 'all') params.set('role', selectedRole);
      if (selectedStatus !== 'all') params.set('status', selectedStatus);

      const response = await fetch(`/api/admin/users?${params}`);
      const data = await response.json();

      if (data.success) {
        setUsers(data.data || []);
        setTotalCount(data.total || 0);
      } else {
        toast.error(data.error || '加载用户列表失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [searchTerm, selectedRole, selectedStatus, page]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  const handleSearch = () => {
    setSearchTerm(searchInput);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const getRoleColor = (role: string) => {
    return roleOptions.find((opt) => opt.value === role)?.color || 'bg-gray-500';
  };

  const getStatusStyle = (status: string) => {
    return statusOptions.find((opt) => opt.value === status)?.color || 'bg-gray-100 text-gray-800';
  };

  const getStatusLabel = (status: string) => {
    return getUserStatusDisplayName(status as UserStatus);
  };

  // 添加用户
  const handleAddUser = async () => {
    if (!addForm.email || !addForm.username || !addForm.password) {
      toast.error('邮箱、用户名和密码不能为空');
      return;
    }
    setSubmitting(true);
    try {
      const response = await fetch('/api/admin/users', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...addForm, fullName: addForm.name }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success('用户创建成功');
        setShowAddDialog(false);
        setAddForm({ name: '', email: '', username: '', password: '', role: 'free', phone: '' });
        loadUsers();
      } else {
        toast.error(data.error || '创建失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  // 编辑用户
  const openEditDialog = (user: User) => {
    setEditUser(user);
    setEditForm({
      name: user.name,
      email: user.email,
      role: user.role,
      phone: user.phone || '',
    });
    setShowEditDialog(true);
  };

  const handleEditUser = async () => {
    if (!editUser) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/users/${editUser.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          full_name: editForm.name,
          email: editForm.email,
          role: editForm.role,
          phone: editForm.phone,
        }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success('用户信息更新成功');
        setShowEditDialog(false);
        loadUsers();
      } else {
        toast.error(data.error || '更新失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  // 删除用户
  const openDeleteDialog = (user: User) => {
    setDeleteUser(user);
    setShowDeleteDialog(true);
  };

  const handleDeleteUser = async () => {
    if (!deleteUser) return;
    setSubmitting(true);
    try {
      const response = await fetch(`/api/admin/users/${deleteUser.id}`, { method: 'DELETE' });
      const data = await response.json();
      if (data.success) {
        toast.success('用户已删除');
        setShowDeleteDialog(false);
        loadUsers();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  // 批量选择
  const toggleSelect = (id: string) => {
    const next = new Set(selectedIds);
    if (next.has(id)) next.delete(id); else next.add(id);
    setSelectedIds(next);
  };

  const toggleSelectAll = () => {
    if (selectedIds.size === users.length) {
      setSelectedIds(new Set());
    } else {
      setSelectedIds(new Set(users.map(u => u.id)));
    }
  };

  const handleBatchDelete = async () => {
    setBatchDeleting(true);
    try {
      const response = await fetch('/api/admin/users/batch-delete', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ids: Array.from(selectedIds) }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(data.message || `成功删除 ${data.deletedCount} 个用户`);
        setShowBatchDeleteDialog(false);
        setSelectedIds(new Set());
        loadUsers();
      } else {
        toast.error(data.error || '批量删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setBatchDeleting(false);
    }
  };

  // 启用/禁用用户
  const handleToggleStatus = async (user: User) => {
    const action = user.status === 'disabled' ? 'enable' : 'disable';
    try {
      const response = await fetch(`/api/admin/users/${user.id}/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await response.json();
      if (data.success) {
        toast.success(data.message);
        loadUsers();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch {
      toast.error('网络错误');
    }
  };

  // 统计信息
  const stats = {
    total: totalCount,
    active: users.filter((u) => u.status === 'active').length,
    pending: users.filter((u) => u.status === 'pending').length,
    enterprise: users.filter((u) => u.role === 'enterprise_admin').length,
    vip: users.filter((u) => u.role === 'vip').length,
    totalPoints: users.reduce((sum, u) => sum + (u.points || 0), 0),
  };

  const totalPages = Math.ceil(totalCount / pageSize);

  // 导出用户数据为 CSV
  const handleExport = async () => {
    try {
      // 获取全量数据（不分页）
      const params = new URLSearchParams({ limit: '9999' });
      if (searchTerm) params.set('keyword', searchTerm);
      if (selectedRole !== 'all') params.set('role', selectedRole);
      if (selectedStatus !== 'all') params.set('status', selectedStatus);

      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (!data.success || !data.data?.length) {
        toast.error('没有可导出的数据');
        return;
      }

      const headers = ['ID', '姓名', '邮箱', '用户名', '角色', '状态', '手机', '积分', '注册时间', '最后登录'];
      const rows = (data.data as User[]).map((u) => [
        u.id,
        u.name || '',
        u.email || '',
        u.username || '',
        u.role || '',
        u.status || '',
        u.phone || '',
        String(u.points || 0),
        u.createdAt ? new Date(u.createdAt).toLocaleString('zh-CN') : '',
        u.lastLogin ? new Date(u.lastLogin).toLocaleString('zh-CN') : '',
      ]);

      // 生成 CSV（带 BOM 以支持 Excel 中文）
      const csvContent = '\uFEFF' + [headers, ...rows].map((r) => r.map((c) => `"${String(c).replace(/"/g, '""')}"`).join(',')).join('\n');
      const blob = new Blob([csvContent], { type: 'text/csv;charset=utf-8' });
      const url = URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `用户数据_${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
      URL.revokeObjectURL(url);
      toast.success(`已导出 ${data.data.length} 条用户数据`);
    } catch {
      toast.error('导出失败');
    }
  };

  return (
    <div className="space-y-6">
      {/* 页面标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">用户管理</h1>
          <p className="text-gray-500">管理系统用户、角色和权限</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleExport} disabled={users.length === 0}>
            <Download className="h-4 w-4 mr-2" />
            导出数据
          </Button>
          <Button onClick={() => setShowAddDialog(true)}>
            <UserPlus className="h-4 w-4 mr-2" />
            添加用户
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-6">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg">
                <UsersIcon className="h-5 w-5 text-blue-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">总用户</p>
                <p className="text-xl font-bold">{stats.total}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg">
                <CheckCircle className="h-5 w-5 text-green-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">活跃</p>
                <p className="text-xl font-bold">{stats.active}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-yellow-100 p-2 rounded-lg">
                <Shield className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">待审核</p>
                <p className="text-xl font-bold">{stats.pending}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-indigo-100 p-2 rounded-lg">
                <Building2 className="h-5 w-5 text-indigo-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">企业</p>
                <p className="text-xl font-bold">{stats.enterprise}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-yellow-100 p-2 rounded-lg">
                <Star className="h-5 w-5 text-yellow-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">VIP</p>
                <p className="text-xl font-bold">{stats.vip}</p>
              </div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-purple-100 p-2 rounded-lg">
                <Gift className="h-5 w-5 text-purple-600" />
              </div>
              <div>
                <p className="text-sm text-gray-500">总积分</p>
                <p className="text-xl font-bold">{stats.totalPoints.toLocaleString()}</p>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜索用户名、邮箱或姓名..."
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleSearch}>搜索</Button>
              {(searchTerm || selectedRole !== 'all' || selectedStatus !== 'all') && (
                <Button variant="ghost" size="sm" onClick={() => {
                  setSearchTerm(''); setSearchInput('');
                  setSelectedRole('all'); setSelectedStatus('all');
                  setPage(1);
                }}>
                  清除筛选
                </Button>
              )}
              <Select value={selectedRole} onValueChange={(v) => { setSelectedRole(v); setPage(1); }}>
                <SelectTrigger className="w-[140px]">
                  <SelectValue placeholder="角色" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部角色</SelectItem>
                  {roleOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <Select value={selectedStatus} onValueChange={(v) => { setSelectedStatus(v); setPage(1); }}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">全部状态</SelectItem>
                  {statusOptions.map((option) => (
                    <SelectItem key={option.value} value={option.value}>
                      {option.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 用户列表 */}
      <Card>
        <CardContent className="p-0">
          {selectedIds.size > 0 && (
            <div className="flex items-center gap-3 px-4 py-2.5 bg-muted/50 border-b">
              <Checkbox
                checked={users.length > 0 && selectedIds.size === users.length}
                onCheckedChange={toggleSelectAll}
              />
              <span className="text-sm font-medium">
                已选 <span className="text-primary">{selectedIds.size}</span> 项
              </span>
              <div className="flex-1" />
              <Button
                variant="destructive"
                size="sm"
                onClick={() => setShowBatchDeleteDialog(true)}
              >
                <Trash2 className="h-3.5 w-3.5 mr-1" />
                批量删除
              </Button>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => setSelectedIds(new Set())}
              >
                取消选择
              </Button>
            </div>
          )}
          <DynamicTable
            data={users}
            fields={fields}
            rowActions={actionsByPosition.row_action || []}
            onAction={(actionKey, row) => {
              switch (actionKey) {
                case 'edit': openEditDialog(row); break;
                case 'delete': openDeleteDialog(row); break;
                case 'toggle_status': handleToggleStatus(row); break;
                case 'grant_points': router.push(`/admin/users/${row.id}/grant`); break;
              }
            }}
            onRowClick={(row) => router.push(`/admin/users/${row.id}`)}
            renderCell={(row, field) => {
              // 邮箱列：选择框 + 邮箱
              if (field.field_key === 'email') {
                return (
                  <div className="flex items-center gap-3">
                    <Checkbox
                      checked={selectedIds.has(row.id)}
                      onCheckedChange={() => toggleSelect(row.id)}
                      onClick={(e) => e.stopPropagation()}
                    />
                    <span>{row.email}</span>
                  </div>
                );
              }
              // 姓名列：头像 + 姓名
              if (field.field_key === 'full_name') {
                return (
                  <div className="flex items-center gap-2">
                    <Avatar className="h-8 w-8">
                      {row.avatar ? <AvatarImage src={row.avatar} /> : null}
                      <AvatarFallback>{row.name?.[0] || '?'}</AvatarFallback>
                    </Avatar>
                    <span>{row.name}</span>
                  </div>
                );
              }
              // 用户名列
              if (field.field_key === 'username') {
                return <span>{row.username || '-'}</span>;
              }
              // 手机号列
              if (field.field_key === 'phone') {
                return <span>{row.phone || '-'}</span>;
              }
              // 等级列
              if (field.field_key === 'level') {
                return <span>{row.level ?? '-'}</span>;
              }
              // 注册时间列
              if (field.field_key === 'created_at') {
                return <span>{row.createdAt ? new Date(row.createdAt).toLocaleString('zh-CN') : '-'}</span>;
              }
              // 最后登录列
              if (field.field_key === 'last_login') {
                return <span>{row.lastLogin ? new Date(row.lastLogin).toLocaleString('zh-CN') : '-'}</span>;
              }
              // 角色列：彩色 Badge
              if (field.field_key === 'role') {
                return (
                  <Badge className={`${getRoleColor(row.role)} text-white`}>
                    {getRoleDisplayName(row.role as any)}
                  </Badge>
                );
              }
              // 积分列
              if (field.field_key === 'points') {
                return (
                  <div className="flex items-center gap-1">
                    <Gift className="h-3 w-3 text-purple-500" />
                    <span className="font-medium">{row.points || 0}</span>
                  </div>
                );
              }
              // 状态列：select 类型使用自定义渲染
              if (field.field_key === 'status') {
                return (
                  <Badge variant="outline" className={getStatusStyle(row.status)}>
                    {getStatusLabel(row.status)}
                  </Badge>
                );
              }
              return undefined; // fallback 到 defaultRender
            }}
            loading={loading}
            emptyText="暂无用户数据"
          />
          <DynamicPagination page={page} totalPages={totalPages} totalCount={totalCount} onPageChange={setPage} />
        </CardContent>
      </Card>

      {/* 添加用户对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>添加新用户</DialogTitle>
            <DialogDescription>填写用户信息创建新账号</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>用户名 <span className="text-destructive">*</span></Label>
                <Input
                  placeholder="输入用户名"
                  value={addForm.username}
                  onChange={(e) => setAddForm({ ...addForm, username: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>姓名</Label>
                <Input
                  placeholder="输入姓名"
                  value={addForm.name}
                  onChange={(e) => setAddForm({ ...addForm, name: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>邮箱 <span className="text-destructive">*</span></Label>
              <Input
                type="email"
                placeholder="user@example.com"
                value={addForm.email}
                onChange={(e) => setAddForm({ ...addForm, email: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>密码 <span className="text-destructive">*</span></Label>
                <Input
                  type="password"
                  placeholder="输入密码"
                  value={addForm.password}
                  onChange={(e) => setAddForm({ ...addForm, password: e.target.value })}
                />
              </div>
              <div className="space-y-2">
                <Label>手机号</Label>
                <Input
                  placeholder="13800138000"
                  value={addForm.phone}
                  onChange={(e) => setAddForm({ ...addForm, phone: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={addForm.role} onValueChange={(v) => setAddForm({ ...addForm, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>取消</Button>
            <Button onClick={handleAddUser} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              创建用户
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑用户对话框 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="sm:max-w-[500px]">
          <DialogHeader>
            <DialogTitle>编辑用户</DialogTitle>
            <DialogDescription>修改用户信息</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>姓名</Label>
              <Input
                value={editForm.name}
                onChange={(e) => setEditForm({ ...editForm, name: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>邮箱</Label>
              <Input
                type="email"
                value={editForm.email}
                onChange={(e) => setEditForm({ ...editForm, email: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>手机号</Label>
              <Input
                value={editForm.phone}
                onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>角色</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {roleOptions.map((opt) => (
                    <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>取消</Button>
            <Button onClick={handleEditUser} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              保存修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 批量删除确认对话框 */}
      <Dialog open={showBatchDeleteDialog} onOpenChange={setShowBatchDeleteDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认批量删除</DialogTitle>
            <DialogDescription>
              确定要删除选中的 {selectedIds.size} 个用户吗？此操作不可撤销，将同时清除这些用户的相关数据（积分、订单、使用记录等）。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowBatchDeleteDialog(false)}>取消</Button>
            <Button variant="destructive" onClick={handleBatchDelete} disabled={batchDeleting}>
              {batchDeleting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              删除 {selectedIds.size} 个用户
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除用户「{deleteUser?.name}」（{deleteUser?.email}）吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDeleteUser} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
