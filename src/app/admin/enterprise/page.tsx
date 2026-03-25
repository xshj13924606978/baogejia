'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import { Search, Building2, Users, Eye, Shield, Loader2, Trash2 } from 'lucide-react';
import { toast } from 'sonner';

interface EnterpriseUser {
  id: string;
  email: string;
  username: string;
  fullName?: string;
  role: string;
  status: string;
  points: number;
  phone?: string;
  createdAt: string;
  lastLogin?: string;
}

export default function EnterprisePage() {
  const [users, setUsers] = useState<EnterpriseUser[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');

  // 详情弹窗
  const [detailUser, setDetailUser] = useState<EnterpriseUser | null>(null);
  const [detailOpen, setDetailOpen] = useState(false);

  // 角色修改弹窗
  const [roleUser, setRoleUser] = useState<EnterpriseUser | null>(null);
  const [roleOpen, setRoleOpen] = useState(false);
  const [newRole, setNewRole] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const pageSize = 20;

  const loadUsers = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
        role: 'enterprise_admin',
      });
      if (keyword) params.set('keyword', keyword);

      const res = await fetch(`/api/admin/users?${params}`);
      const data = await res.json();
      if (data.success) {
        setUsers(data.data || []);
        setTotal(data.total || 0);
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  }, [keyword, page]);

  useEffect(() => { loadUsers(); }, [loadUsers]);

  const handleSearch = () => { setKeyword(searchInput); setPage(1); };
  const handleKeyDown = (e: React.KeyboardEvent) => { if (e.key === 'Enter') handleSearch(); };

  // 修改角色
  const openRoleDialog = (user: EnterpriseUser) => {
    setRoleUser(user);
    setNewRole(user.role);
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
        toast.success(`已将 ${roleUser.fullName || roleUser.username} 的角色更改为 ${newRole}`);
        setRoleOpen(false);
        loadUsers();
      } else {
        toast.error(data.error || '修改失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">企业用户管理</h1>
        <p className="text-gray-500">管理企业用户及其权限配置</p>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg"><Building2 className="h-5 w-5 text-blue-600" /></div>
              <div><p className="text-sm text-gray-500">企业用户总数</p><p className="text-xl font-bold">{total}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg"><Shield className="h-5 w-5 text-green-600" /></div>
              <div><p className="text-sm text-gray-500">本页显示</p><p className="text-xl font-bold">{users.length}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 搜索 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex gap-2">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input placeholder="搜索企业用户（邮箱/用户名/姓名）..." className="pl-9" value={searchInput} onChange={(e) => setSearchInput(e.target.value)} onKeyDown={handleKeyDown} />
            </div>
            <Button variant="outline" size="sm" onClick={handleSearch}>搜索</Button>
            {keyword && <Button variant="ghost" size="sm" onClick={() => { setKeyword(''); setSearchInput(''); setPage(1); }}>清除</Button>}
          </div>
        </CardContent>
      </Card>

      {/* 用户列表 */}
      <Card>
        <CardHeader><CardTitle className="text-lg">企业用户列表</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /><span className="ml-2">加载中...</span></div>
          ) : users.length === 0 ? (
            <div className="text-center py-16">
              <Building2 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">{keyword ? '没有匹配的企业用户' : '暂无企业用户'}</p>
              <p className="text-xs text-muted-foreground mt-2">可通过用户管理页面将用户角色设置为 enterprise_admin</p>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户信息</TableHead>
                      <TableHead>角色</TableHead>
                      <TableHead>状态</TableHead>
                      <TableHead>积分</TableHead>
                      <TableHead>注册时间</TableHead>
                      <TableHead className="text-right">操作</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {users.map((user) => (
                      <TableRow key={user.id}>
                        <TableCell>
                          <div>
                            <p className="font-medium text-sm">{user.fullName || user.username || '-'}</p>
                            <p className="text-xs text-muted-foreground">{user.email}</p>
                          </div>
                        </TableCell>
                        <TableCell>
                          <Badge variant="outline" className="bg-purple-100 text-purple-800">{user.role === 'enterprise_admin' ? '企业管理员' : user.role}</Badge>
                        </TableCell>
                        <TableCell>
                          <Badge variant={user.status === 'active' ? 'default' : 'secondary'}>
                            {user.status === 'active' ? '活跃' : user.status || '未知'}
                          </Badge>
                        </TableCell>
                        <TableCell className="text-sm">{user.points || 0}</TableCell>
                        <TableCell className="text-xs text-muted-foreground">
                          {new Date(user.createdAt).toLocaleString('zh-CN')}
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button variant="ghost" size="sm" className="h-8" onClick={() => { setDetailUser(user); setDetailOpen(true); }}>
                              <Eye className="h-4 w-4 mr-1" />详情
                            </Button>
                            <Button variant="ghost" size="sm" className="h-8" onClick={() => openRoleDialog(user)}>
                              <Shield className="h-4 w-4 mr-1" />角色
                            </Button>
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">第 {page}/{totalPages} 页，共 {total} 条</span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>

      {/* 详情弹窗 */}
      <Dialog open={detailOpen} onOpenChange={setDetailOpen}>
        <DialogContent className="max-w-md">
          <DialogHeader><DialogTitle>企业用户详情</DialogTitle></DialogHeader>
          {detailUser && (
            <div className="space-y-3 text-sm">
              <div className="grid grid-cols-2 gap-3">
                <div><span className="text-muted-foreground">姓名：</span>{detailUser.fullName || '-'}</div>
                <div><span className="text-muted-foreground">用户名：</span>{detailUser.username || '-'}</div>
                <div className="col-span-2"><span className="text-muted-foreground">邮箱：</span>{detailUser.email}</div>
                <div><span className="text-muted-foreground">角色：</span>{detailUser.role}</div>
                <div><span className="text-muted-foreground">状态：</span>{detailUser.status || '-'}</div>
                <div><span className="text-muted-foreground">积分：</span>{detailUser.points || 0}</div>
                <div><span className="text-muted-foreground">手机：</span>{detailUser.phone || '-'}</div>
                <div className="col-span-2"><span className="text-muted-foreground">注册时间：</span>{new Date(detailUser.createdAt).toLocaleString('zh-CN')}</div>
                {detailUser.lastLogin && (
                  <div className="col-span-2"><span className="text-muted-foreground">最后登录：</span>{new Date(detailUser.lastLogin).toLocaleString('zh-CN')}</div>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>

      {/* 角色修改弹窗 */}
      <Dialog open={roleOpen} onOpenChange={setRoleOpen}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>修改用户角色</DialogTitle>
            <DialogDescription>修改 {roleUser?.fullName || roleUser?.username} 的角色</DialogDescription>
          </DialogHeader>
          <div className="py-4">
            <Select value={newRole} onValueChange={setNewRole}>
              <SelectTrigger><SelectValue /></SelectTrigger>
              <SelectContent>
                <SelectItem value="enterprise_admin">企业管理员</SelectItem>
                <SelectItem value="admin">管理员</SelectItem>
                <SelectItem value="free">免费用户</SelectItem>
                <SelectItem value="vip">VIP用户</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setRoleOpen(false)}>取消</Button>
            <Button onClick={handleRoleChange} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}确认修改
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
