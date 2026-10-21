'use client';

import React, { useCallback, useEffect, useMemo, useState } from 'react';
import {
  Card,
  CardContent,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
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
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { toast } from 'sonner';
import {
  Search,
  Building2,
  Users,
  UserCheck,
  UserX,
  Eye,
  Shield,
  Loader2,
  Trash2,
  Download,
  RotateCcw,
  ChevronLeft,
  ChevronRight,
  CheckSquare,
} from 'lucide-react';
import { cn } from '@/lib/utils';
import { formatDateTime } from '@/lib/date-utils';

interface EnterpriseUser {
  id: string;
  email: string;
  username: string;
  name?: string;
  fullName?: string;
  role: string;
  status: string;
  points: number;
  phone?: string;
  createdAt: string;
  lastLogin?: string;
  level?: number;
  metadata?: Record<string, any>;
}

interface Stats {
  total: number;
  active: number;
  pending: number;
  enterprise: number;
  vip: number;
  totalPoints: number;
}

interface RoleOption {
  code: string;
  name: string;
  nameEn: string;
  isAdmin: boolean;
  isSuperAdmin: boolean;
  priority: number;
  description?: string;
}

const PAGE_SIZE = 20;

const STATUS_OPTIONS = [
  { value: 'all', label: '全部状态' },
  { value: 'active', label: '活跃' },
  { value: 'pending', label: '待激活' },
  { value: 'disabled', label: '已禁用' },
  { value: 'banned', label: '已封禁' },
];


function getStatusBadge(status: string) {
  switch (status) {
    case 'active':
      return { label: '活跃', variant: 'default' as const, className: 'bg-green-600 hover:bg-green-700' };
    case 'pending':
      return { label: '待激活', variant: 'secondary' as const, className: 'bg-amber-500 hover:bg-amber-600 text-white' };
    case 'disabled':
      return { label: '已禁用', variant: 'secondary' as const, className: 'bg-slate-500 hover:bg-slate-600 text-white' };
    case 'banned':
      return { label: '已封禁', variant: 'destructive' as const, className: '' };
    default:
      return { label: status || '未知', variant: 'outline' as const, className: '' };
  }
}

function getRoleBadgeClass(role?: string) {
  switch (role) {
    case 'super_admin':
      return 'bg-red-100 text-red-700 border-red-200 hover:bg-red-200';
    case 'admin':
      return 'bg-orange-100 text-orange-700 border-orange-200 hover:bg-orange-200';
    case 'enterprise_admin':
      return 'bg-blue-100 text-blue-700 border-blue-200 hover:bg-blue-200';
    case 'vip':
      return 'bg-purple-100 text-purple-700 border-purple-200 hover:bg-purple-200';
    case 'manufacturer':
      return 'bg-emerald-100 text-emerald-700 border-emerald-200 hover:bg-emerald-200';
    default:
      return 'bg-slate-100 text-slate-700 border-slate-200 hover:bg-slate-200';
  }
}

export default function EnterpriseUsersPage() {
  const [users, setUsers] = useState<EnterpriseUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [stats, setStats] = useState<Stats | null>(null);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [roles, setRoles] = useState<RoleOption[]>([]);
  const [rolesLoading, setRolesLoading] = useState(false);

  const [detailUser, setDetailUser] = useState<EnterpriseUser | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  const [roleUser, setRoleUser] = useState<EnterpriseUser | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const [confirmOpen, setConfirmOpen] = useState(false);
  const [pendingAction, setPendingAction] = useState<'enable' | 'disable' | 'delete' | null>(null);

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));
  const inactiveCount = useMemo(
    () => (stats ? Math.max(0, stats.total - stats.active - stats.pending) : 0),
    [stats],
  );

  const loadRoles = useCallback(async () => {
    setRolesLoading(true);
    try {
      const res = await fetch('/api/admin/roles');
      const data = await res.json();
      if (data.success && Array.isArray(data.data)) {
        setRoles(data.data);
      } else {
        toast.error(data.error || '加载角色选项失败');
      }
    } catch {
      toast.error('网络错误：无法加载角色选项');
    } finally {
      setRolesLoading(false);
    }
  }, []);

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(PAGE_SIZE),
        role: 'enterprise_admin',
      });
      if (keyword) params.set('keyword', keyword);
      if (statusFilter && statusFilter !== 'all') params.set('status', statusFilter);

      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (data.success) {
        setUsers((data.data || []).map((u: any) => ({
          ...u,
          fullName: u.name || u.fullName || u.username,
          phone: u.phone || u.metadata?.phone || '',
        })));
        setTotal(data.total || 0);
        setStats(data.stats || null);
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [keyword, page, statusFilter]);

  useEffect(() => {
    loadRoles();
  }, [loadRoles]);

  useEffect(() => {
    loadUsers();
  }, [loadUsers]);

  useEffect(() => {
    setSelectedIds(new Set());
  }, [keyword, statusFilter, page]);

  const handleSearch = () => {
    setKeyword(searchInput);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleReset = () => {
    setSearchInput('');
    setKeyword('');
    setStatusFilter('all');
    setPage(1);
  };

  const toggleAll = (checked: boolean) => {
    if (checked) {
      const all = new Set(users.map((u) => u.id));
      setSelectedIds(all);
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  const openRoleDialog = (user: EnterpriseUser) => {
    setRoleUser(user);
    setNewRole(user.role || '');
    setRoleOpen(true);
  };

  const handleRoleChange = async () => {
    if (!roleUser || !newRole) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/users/${roleUser.id}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`已将 ${roleUser.fullName || roleUser.username} 的角色更改为 ${getRoleName(newRole)}`);
        setRoleOpen(false);
        loadUsers();
      } else {
        toast.error(data.error || '修改失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const getRoleName = (code?: string) => {
    if (!code) return '-';
    return roles.find((r) => r.code === code)?.name || code;
  };

  const requestBatch = async (action: 'enable' | 'disable' | 'delete' | 'export') => {
    const ids = Array.from(selectedIds);
    if (ids.length === 0) {
      toast.error('请至少选择一个用户');
      return;
    }

    try {
      const res = await fetch('/api/admin/users/batch', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action, ids }),
      });
      const data = await res.json();
      if (data.success) {
        if (action === 'export') {
          exportToCsv(data.data || []);
          toast.success(`已导出 ${data.data?.length || 0} 位用户`);
        } else {
          toast.success(
            action === 'delete'
              ? `成功删除 ${data.data?.deleted || 0} 位用户`
              : `成功${action === 'enable' ? '启用' : '禁用'} ${data.data?.updated || 0} 位用户`,
          );
          setSelectedIds(new Set());
          loadUsers();
        }
      } else {
        toast.error(data.error || '批量操作失败');
      }
    } catch {
      toast.error('网络错误');
    }
  };

  const exportToCsv = (rows: any[]) => {
    if (!rows.length) return;
    const headers = ['ID', '用户名', '邮箱', '姓名', '角色', '状态', '积分', '手机号', '注册时间'];
    const csv = [
      headers.join(','),
      ...rows.map((u) =>
        [
          u.id,
          `"${(u.username || '').replace(/"/g, '""')}"`,
          `"${(u.email || '').replace(/"/g, '""')}"`,
          `"${(u.fullName || '').replace(/"/g, '""')}"`,
          `"${getRoleName(u.role)}"`,
          `"${getStatusBadge(u.status).label}"`,
          u.points || 0,
          `"${u.phone || ''}"`,
          `"${formatDateTime(u.createdAt)}"`,
        ].join(','),
      ),
    ].join('\n');

    const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `企业用户_${new Date().toISOString().slice(0, 10)}.csv`;
    document.body.appendChild(a);
    a.click();
    document.body.removeChild(a);
    URL.revokeObjectURL(url);
  };

  const triggerConfirm = (action: 'enable' | 'disable' | 'delete') => {
    setPendingAction(action);
    setConfirmOpen(true);
  };

  const handleConfirmAction = () => {
    if (!pendingAction) return;
    requestBatch(pendingAction);
    setConfirmOpen(false);
    setPendingAction(null);
  };

  const StatsCard = ({
    icon: Icon,
    label,
    value,
    color,
  }: {
    icon: React.ElementType;
    label: string;
    value: number | string;
    color: string;
  }) => (
    <Card>
      <CardContent className="flex items-center gap-4 p-5">
        <div
          className={cn(
            'flex h-12 w-12 shrink-0 items-center justify-center rounded-xl text-white shadow-sm',
            color,
          )}
        >
          <Icon className="h-6 w-6" />
        </div>
        <div>
          <p className="text-sm font-medium text-slate-500">{label}</p>
          <p className="text-2xl font-bold tracking-tight text-slate-900">{value}</p>
        </div>
      </CardContent>
    </Card>
  );

  const DetailItem = ({ label, value }: { label: string; value: string }) => (
    <div className="space-y-1">
      <p className="text-xs font-medium uppercase tracking-wider text-slate-500">{label}</p>
      <p className="text-sm font-medium text-slate-900 break-words">{value}</p>
    </div>
  );

  return (
    <div className="min-h-screen bg-slate-50 p-4 md:p-6 lg:p-8">
      <div className="mx-auto max-w-[1600px] space-y-6">
        <div className="flex flex-col gap-1 sm:flex-row sm:items-center sm:justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight text-slate-900">企业用户管理</h1>
            <p className="text-sm text-slate-500">管理企业用户及其权限配置</p>
          </div>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
          <StatsCard icon={Building2} label="企业用户总数" value={stats?.total ?? 0} color="bg-blue-500" />
          <StatsCard icon={UserCheck} label="活跃用户数" value={stats?.active ?? 0} color="bg-green-500" />
          <StatsCard icon={UserX} label="未启用/待激活" value={inactiveCount} color="bg-amber-500" />
          <StatsCard icon={Users} label="本页显示" value={users.length} color="bg-indigo-500" />
        </div>

        <Card>
          <CardContent className="flex flex-col gap-3 p-4 md:flex-row md:items-center md:justify-between">
            <div className="flex flex-1 flex-col gap-3 md:flex-row">
              <div className="relative flex-1">
                <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <Input
                  placeholder="搜索企业用户（邮箱/用户名/姓名）..."
                  value={searchInput}
                  onChange={(e) => setSearchInput(e.target.value)}
                  onKeyDown={handleKeyDown}
                  className="pl-9"
                />
              </div>
              <Select value={statusFilter} onValueChange={setStatusFilter}>
                <SelectTrigger className="w-full md:w-44">
                  <SelectValue placeholder="全部状态" />
                </SelectTrigger>
                <SelectContent>
                  {STATUS_OPTIONS.map((s) => (
                    <SelectItem key={s.value} value={s.value}>
                      {s.label}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="flex items-center gap-2">
              <Button variant="outline" onClick={handleReset} disabled={loading}>
                <RotateCcw className="mr-2 h-4 w-4" />
                重置
              </Button>
              <Button onClick={handleSearch} disabled={loading}>
                <Search className="mr-2 h-4 w-4" />
                搜索
              </Button>
            </div>
          </CardContent>
        </Card>

        {selectedIds.size > 0 && (
          <Card className="border-primary/20 bg-primary/5">
            <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
              <div className="flex items-center gap-2 text-sm font-medium text-slate-700">
                <CheckSquare className="h-4 w-4 text-primary" />
                已选择 {selectedIds.size} 位用户
                {selectedIds.size < users.length && (
                  <span className="text-slate-400">（本页共 {users.length} 位）</span>
                )}
              </div>
              <div className="flex flex-wrap items-center gap-2">
                <Button variant="outline" size="sm" onClick={() => requestBatch('export')}>
                  <Download className="mr-1.5 h-4 w-4" />
                  导出选中
                </Button>
                <Button variant="outline" size="sm" onClick={() => triggerConfirm('enable')}>
                  <UserCheck className="mr-1.5 h-4 w-4 text-green-600" />
                  启用
                </Button>
                <Button variant="outline" size="sm" onClick={() => triggerConfirm('disable')}>
                  <UserX className="mr-1.5 h-4 w-4 text-amber-600" />
                  禁用
                </Button>
                <Button variant="destructive" size="sm" onClick={() => triggerConfirm('delete')}>
                  <Trash2 className="mr-1.5 h-4 w-4" />
                  删除
                </Button>
                <Button variant="ghost" size="sm" onClick={() => setSelectedIds(new Set())}>
                  清空
                </Button>
              </div>
            </CardContent>
          </Card>
        )}

        <Card className="overflow-hidden">
          <CardHeader className="border-b bg-white px-6 py-4">
            <div className="flex items-center justify-between">
              <CardTitle className="text-lg font-semibold">企业用户列表</CardTitle>
              <span className="text-xs text-slate-400">
                第 {page} / {totalPages} 页 · 共 {total} 条
              </span>
            </div>
          </CardHeader>
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 28rem)' }}>
            <Table>
              <TableHeader className="bg-slate-50">
                <TableRow>
                  <TableHead className="w-12 text-center">
                    <Checkbox
                      checked={users.length > 0 && selectedIds.size === users.length}
                      onCheckedChange={(c) => toggleAll(Boolean(c))}
                      aria-label="全选"
                    />
                  </TableHead>
                  <TableHead className="min-w-[220px]">用户信息</TableHead>
                  <TableHead className="min-w-[120px]">角色</TableHead>
                  <TableHead className="min-w-[100px]">状态</TableHead>
                  <TableHead className="min-w-[80px]">积分</TableHead>
                  <TableHead className="min-w-[160px]">注册时间</TableHead>
                  <TableHead className="min-w-[140px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-12 text-center">
                      <Loader2 className="mx-auto h-8 w-8 animate-spin text-slate-400" />
                      <p className="mt-2 text-sm text-slate-500">加载中...</p>
                    </TableCell>
                  </TableRow>
                ) : users.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="py-16 text-center">
                      <Users className="mx-auto h-12 w-12 text-slate-200" />
                      <p className="mt-3 text-sm font-medium text-slate-600">暂无企业用户</p>
                      <p className="text-xs text-slate-400">可调整筛选条件后重试</p>
                    </TableCell>
                  </TableRow>
                ) : (
                  users.map((user) => {
                    const status = getStatusBadge(user.status);
                    return (
                      <TableRow key={user.id} className="hover:bg-slate-50/60">
                        <TableCell className="text-center">
                          <Checkbox
                            checked={selectedIds.has(user.id)}
                            onCheckedChange={(c) => toggleOne(user.id, Boolean(c))}
                            aria-label={`选择 ${user.fullName || user.username}`}
                          />
                        </TableCell>
                        <TableCell>
                          <div className="flex flex-col">
                            <span className="font-medium text-slate-900">
                              {user.fullName || user.username || '-'}
                            </span>
                            {user.email && <span className="text-xs text-slate-500">{user.email}</span>}
                            {user.phone && <span className="text-xs text-slate-400">{user.phone}</span>}
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className={cn('font-medium', getRoleBadgeClass(user.role))}>
                            {getRoleName(user.role)}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <Badge className={cn(status.className)}>{status.label}</Badge>
                        </TableCell>
                        <TableCell className="font-medium tabular-nums text-slate-700">
                          {user.points ?? 0}
                        </TableCell>
                        <TableCell className="text-sm text-slate-500">
                          {formatDateTime(user.createdAt)}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex items-center justify-end gap-2">
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => {
                                setDetailUser(user);
                                setDetailOpen(true);
                              }}
                            >
                              <Eye className="mr-1.5 h-4 w-4" />
                              详情
                            </Button>
                            <Button
                              variant="ghost"
                              size="sm"
                              onClick={() => openRoleDialog(user)}
                              disabled={rolesLoading}
                            >
                              <Shield className="mr-1.5 h-4 w-4" />
                              角色
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
          {!loading && users.length > 0 && (
            <div className="flex items-center justify-between border-t bg-white px-6 py-3">
              <span className="text-xs text-slate-500">
                显示 {users.length} 条，共 {total} 条
              </span>
              <div className="flex items-center gap-2">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.max(1, p - 1))}
                  disabled={page <= 1 || loading}
                >
                  <ChevronLeft className="mr-1 h-4 w-4" />
                  上一页
                </Button>
                <span className="text-sm text-slate-600">
                  {page} / {totalPages}
                </span>
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setPage((p) => Math.min(totalPages, p + 1))}
                  disabled={page >= totalPages || loading}
                >
                  下一页
                  <ChevronRight className="ml-1 h-4 w-4" />
                </Button>
              </div>
            </div>
          )}
        </Card>
      </div>

      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-lg">
          <DialogHeader>
            <DialogTitle>用户详情</DialogTitle>
            <DialogDescription>查看企业用户的完整信息</DialogDescription>
          </DialogHeader>
          {detailUser && (
            <div className="grid grid-cols-1 gap-4 py-2 sm:grid-cols-2">
              <DetailItem label="用户名" value={detailUser.username || '-'} />
              <DetailItem label="姓名" value={detailUser.fullName || '-'} />
              <DetailItem label="邮箱" value={detailUser.email || '-'} />
              <DetailItem label="手机号" value={detailUser.phone || '-'} />
              <DetailItem label="角色" value={getRoleName(detailUser.role)} />
              <DetailItem label="状态" value={getStatusBadge(detailUser.status).label} />
              <DetailItem label="积分" value={String(detailUser.points ?? 0)} />
              <DetailItem label="等级" value={detailUser.level != null ? `L${detailUser.level}` : '-'} />
              <DetailItem label="注册时间" value={formatDateTime(detailUser.createdAt)} />
              <DetailItem label="最近登录" value={formatDateTime(detailUser.lastLogin)} />
            </div>
          )}
          <DialogFooter>
            <Button onClick={() => setDetailOpen(false)}>关闭</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader>
            <DialogTitle>修改角色</DialogTitle>
            <DialogDescription>
              为 {roleUser?.fullName || roleUser?.username || ''} 分配新角色
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 py-2">
            {rolesLoading ? (
              <div className="flex items-center justify-center py-6">
                <Loader2 className="h-6 w-6 animate-spin text-slate-400" />
              </div>
            ) : roles.length === 0 ? (
              <p className="text-center text-sm text-slate-500">暂无可用角色</p>
            ) : (
              <div className="max-h-[320px] space-y-2 overflow-y-auto pr-1">
                {roles.map((role) => (
                  <div
                    key={role.code}
                    onClick={() => setNewRole(role.code)}
                    className={cn(
                      'cursor-pointer rounded-lg border p-3 transition-colors hover:bg-slate-50',
                      newRole === role.code
                        ? 'border-primary bg-primary/5'
                        : 'border-slate-200 bg-white',
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="text-sm font-medium text-slate-900">{role.name}</p>
                        {role.description && (
                          <p className="mt-0.5 text-xs text-slate-500">{role.description}</p>
                        )}
                      </div>
                      <div
                        className={cn(
                          'h-4 w-4 rounded-full border-2',
                          newRole === role.code
                            ? 'border-primary bg-primary'
                            : 'border-slate-300 bg-white',
                        )}
                      />
                    </div>
                  </div>
                ))}
              </div>
            )}
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleRoleChange} disabled={!newRole || submitting || rolesLoading}>
              {submitting ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : null}
              确认修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <AlertDialog open={confirmOpen} onOpenChange={setConfirmOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>
              {pendingAction === 'delete' ? '确认删除' : pendingAction === 'enable' ? '确认启用' : '确认禁用'}
            </AlertDialogTitle>
            <AlertDialogDescription>
              {pendingAction === 'delete'
                ? `确定要删除选中的 ${selectedIds.size} 位用户吗？此操作不可恢复。`
                : `确定要${pendingAction === 'enable' ? '启用' : '禁用'}选中的 ${selectedIds.size} 位用户吗？`}
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => setPendingAction(null)}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleConfirmAction}
              className={cn(pendingAction === 'delete' ? 'bg-red-600 hover:bg-red-700' : '')}
            >
              确认
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
