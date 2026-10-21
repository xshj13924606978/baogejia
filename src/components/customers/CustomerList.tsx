'use client';

import { useCallback, useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
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
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { DynamicPagination } from '@/components/admin/dynamic-table';
import { toast } from 'sonner';
import { Search, UserPlus, Eye, Pencil, Trash2, Loader2, Building2, X } from 'lucide-react';
import { CUSTOMER_LEVELS, CUSTOMER_STATUSES, type Customer, type UserOption } from './types';
import { CustomerListSkeleton } from './CustomerListSkeleton';

interface CustomerListProps {
  /** 数据源端点，如 /api/admin/customers 或 /api/customers */
  apiEndpoint: string;
  /** admin：管理后台（全量+关联用户）；user：用户端（个人数据） */
  mode?: 'admin' | 'user';
  /** 是否显示"所属用户"筛选（管理后台可用） */
  showUserFilter?: boolean;
  /** 所属用户下拉（不传则自动加载 /api/admin/users） */
  users?: UserOption[];
  onView?: (customer: Customer) => void;
  onEdit?: (customer: Customer) => void;
  onCreate?: () => void;
}

const levelColors: Record<string, string> = {
  A: 'bg-red-100 text-red-700',
  B: 'bg-orange-100 text-orange-700',
  C: 'bg-blue-100 text-blue-700',
  D: 'bg-gray-100 text-gray-700',
};

function getOwnerName(c: Customer) {
  if (!c.owner) return '未分配';
  return c.owner.full_name || c.owner.username || c.owner.email || '未命名用户';
}

function getLevelBadge(level: string | undefined) {
  if (!level) return <span className="text-muted-foreground">—</span>;
  return (
    <Badge variant="outline" className={levelColors[level] || 'bg-gray-100 text-gray-700'}>
      {level} 级
    </Badge>
  );
}

function getStatusBadge(status: string | undefined) {
  const s = status || 'active';
  if (s === 'disabled') {
    return <Badge variant="secondary">停用</Badge>;
  }
  return <Badge className="bg-green-100 text-green-700 hover:bg-green-100">启用</Badge>;
}

export function CustomerList({
  apiEndpoint,
  mode = 'admin',
  showUserFilter,
  users: propUsers,
  onView,
  onEdit,
  onCreate,
}: CustomerListProps) {
  const router = useRouter();
  const isAdmin = mode === 'admin';

  const [data, setData] = useState<Customer[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [searchInput, setSearchInput] = useState('');
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedUser, setSelectedUser] = useState('all');
  const [selectedLevel, setSelectedLevel] = useState('all');
  const [selectedStatus, setSelectedStatus] = useState('all');

  const [users, setUsers] = useState<UserOption[]>(propUsers || []);
  const [deleteTarget, setDeleteTarget] = useState<Customer | null>(null);
  const [deleting, setDeleting] = useState(false);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));

  // 加载所属用户下拉（admin + showUserFilter，外部未提供时自动加载）
  useEffect(() => {
    if (propUsers) {
      setUsers(propUsers);
      return;
    }
    if (!isAdmin || !showUserFilter) return;
    fetch('/api/admin/users?page=1&limit=200')
      .then((res) => res.json())
      .then((json) => {
        if (json.success) {
          setUsers(
            (json.data || []).map((u: any) => ({
              id: u.id,
              name: u.full_name || u.username || u.name || u.email || u.id,
            }))
          );
        }
      })
      .catch(() => {});
  }, [isAdmin, showUserFilter, propUsers]);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), pageSize: String(pageSize) });
      if (searchTerm) params.set('search', searchTerm);
      if (isAdmin) {
        if (selectedUser !== 'all') params.set('userId', selectedUser);
        if (selectedLevel !== 'all') params.set('level', selectedLevel);
        if (selectedStatus !== 'all') params.set('status', selectedStatus);
      }
      const res = await fetch(`${apiEndpoint}?${params}`);
      const json = await res.json();
      // 兼容 admin（{success,data,total}）与 user（{customers}）响应格式
      const list: Customer[] = json.success ? json.data || [] : json.customers || [];
      setData(list);
      setTotal(json.success ? json.total || 0 : list.length);
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [apiEndpoint, page, pageSize, searchTerm, selectedUser, selectedLevel, selectedStatus, isAdmin]);

  useEffect(() => {
    load();
  }, [load]);

  const handleSearch = () => {
    setSearchTerm(searchInput);
    setPage(1);
  };

  const handleReset = () => {
    setSearchInput('');
    setSearchTerm('');
    setSelectedUser('all');
    setSelectedLevel('all');
    setSelectedStatus('all');
    setPage(1);
  };

  const handleView = (c: Customer) => {
    if (onView) onView(c);
    else if (isAdmin) router.push(`/admin/customers/${c.id}`);
    else router.push(`/customers/${c.id}`);
  };

  const handleEdit = (c: Customer) => {
    if (onEdit) onEdit(c);
    else if (isAdmin) router.push(`/admin/customers/${c.id}/edit`);
    else router.push(`/customers/${c.id}/edit`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const url = isAdmin
        ? `${apiEndpoint}/${deleteTarget.id}`
        : `${apiEndpoint}?id=${deleteTarget.id}`;
      const res = await fetch(url, { method: 'DELETE' });
      const json = await res.json();
      const ok = json.success === true;
      if (ok) {
        toast.success('客户已删除');
        setDeleteTarget(null);
        load();
      } else {
        toast.error(json.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 搜索 + 筛选 */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative">
          <Search className="absolute left-2.5 top-2.5 h-4 w-4 text-muted-foreground" />
          <Input
            className="w-64 pl-8"
            placeholder="搜索公司/联系人/手机号"
            value={searchInput}
            onChange={(e) => setSearchInput(e.target.value)}
            onKeyDown={(e) => {
              if (e.key === 'Enter') handleSearch();
            }}
          />
        </div>
        {isAdmin && showUserFilter && (
          <Select
            value={selectedUser}
            onValueChange={(v) => {
              setSelectedUser(v);
              setPage(1);
            }}
          >
            <SelectTrigger className="w-40">
              <SelectValue placeholder="所属用户" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">全部用户</SelectItem>
              {users.map((u) => (
                <SelectItem key={u.id} value={u.id}>
                  {u.name}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        )}
        <Select
          value={selectedLevel}
          onValueChange={(v) => {
            setSelectedLevel(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="等级" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部等级</SelectItem>
            {CUSTOMER_LEVELS.map((lv) => (
              <SelectItem key={lv} value={lv}>
                {lv} 级
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Select
          value={selectedStatus}
          onValueChange={(v) => {
            setSelectedStatus(v);
            setPage(1);
          }}
        >
          <SelectTrigger className="w-28">
            <SelectValue placeholder="状态" />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value="all">全部状态</SelectItem>
            {CUSTOMER_STATUSES.map((s) => (
              <SelectItem key={s.value} value={s.value}>
                {s.label}
              </SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={handleSearch}>
          <Search className="mr-1 h-4 w-4" />
          搜索
        </Button>
        <Button size="sm" variant="ghost" onClick={handleReset}>
          <X className="mr-1 h-4 w-4" />
          重置
        </Button>
        {onCreate && (
          <Button size="sm" className="ml-auto" onClick={onCreate}>
            <UserPlus className="mr-1 h-4 w-4" />
            新增客户
          </Button>
        )}
      </div>

      {/* 表格 */}
      {loading ? (
        <CustomerListSkeleton />
      ) : (
        <div className="rounded-lg border bg-card">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>公司名称</TableHead>
                  <TableHead>项目</TableHead>
                  <TableHead>联系人</TableHead>
                  <TableHead>手机号</TableHead>
                  {isAdmin && <TableHead>所属用户</TableHead>}
                  <TableHead>等级</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>创建时间</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={isAdmin ? 9 : 8} className="h-40 text-center text-muted-foreground">
                      <Building2 className="mx-auto mb-2 h-8 w-8 opacity-40" />
                      暂无客户数据
                    </TableCell>
                  </TableRow>
                ) : (
                  data.map((c) => (
                    <TableRow
                      key={c.id}
                      className="cursor-pointer"
                      onClick={() => handleView(c)}
                    >
                      <TableCell className="font-medium">
                        {c.company_name || '—'}
                        {c.project_name ? (
                          <div className="text-xs text-muted-foreground">{c.project_name}</div>
                        ) : null}
                      </TableCell>
                      <TableCell>{c.project_name || '—'}</TableCell>
                      <TableCell>{c.contact_person || '—'}</TableCell>
                      <TableCell>{c.phone || '—'}</TableCell>
                      {isAdmin && <TableCell>{getOwnerName(c)}</TableCell>}
                      <TableCell>{getLevelBadge(c.metadata?.level)}</TableCell>
                      <TableCell>{getStatusBadge(c.metadata?.status)}</TableCell>
                      <TableCell className="whitespace-nowrap text-muted-foreground">
                        {c.created_at
                          ? new Date(c.created_at).toLocaleDateString('zh-CN')
                          : '—'}
                      </TableCell>
                      <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                        <div className="flex justify-end gap-1">
                          <Button variant="ghost" size="sm" onClick={() => handleView(c)}>
                            <Eye className="h-4 w-4" />
                            <span className="sr-only">查看</span>
                          </Button>
                          {(isAdmin || mode === 'user') && (
                            <Button variant="ghost" size="sm" onClick={() => handleEdit(c)}>
                              <Pencil className="h-4 w-4" />
                              <span className="sr-only">编辑</span>
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="sm"
                            className="text-destructive hover:text-destructive"
                            onClick={() => setDeleteTarget(c)}
                          >
                            <Trash2 className="h-4 w-4" />
                            <span className="sr-only">删除</span>
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                )}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col items-center justify-between gap-3 border-t p-4 sm:flex-row">
            <div className="flex items-center gap-2 text-sm text-muted-foreground">
              每页
              <Select
                value={String(pageSize)}
                onValueChange={(v) => {
                  setPageSize(Number(v));
                  setPage(1);
                }}
              >
                <SelectTrigger className="h-8 w-16">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {[10, 20, 50].map((n) => (
                    <SelectItem key={n} value={String(n)}>
                      {n}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
              条
            </div>
            <DynamicPagination
              page={page}
              totalPages={totalPages}
              totalCount={total}
              onPageChange={setPage}
            />
          </div>
        </div>
      )}

      {/* 删除确认 */}
      <Dialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>删除客户</DialogTitle>
            <DialogDescription>
              确定要删除客户「{deleteTarget?.company_name || ''}」吗？删除后将不再显示在客户列表中。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteTarget(null)} disabled={deleting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={deleting}>
              {deleting && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
