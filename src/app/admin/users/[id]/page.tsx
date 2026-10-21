'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  ArrowLeft, Pencil, Ban, CheckCircle, Trash2, Coins,
  Loader2, Mail, Phone, Calendar, Shield, Clock,
} from 'lucide-react';
import { toast } from 'sonner';

interface UserData {
  id: string;
  name: string;
  email: string;
  username: string;
  role: string;
  status: string;
  phone: string;
  avatar: string;
  points: number;
  createdAt: string;
  lastLogin: string;
}

const ROLE_OPTIONS = [
  { value: 'super_admin', label: '超级管理员' },
  { value: 'admin', label: '系统管理员' },
  { value: 'enterprise_admin', label: '企业管理员' },
  { value: 'manufacturer', label: '产品厂家' },
  { value: 'vip', label: 'VIP会员' },
  { value: 'premium', label: '付费会员' },
  { value: 'free', label: '免费用户' },
];

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '正常', color: 'bg-green-100 text-green-700' },
  disabled: { label: '已禁用', color: 'bg-red-100 text-red-700' },
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-700' },
};

export default function UserDetailPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id;

  const [user, setUser] = useState<UserData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 对话框
  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [pointsOpen, setPointsOpen] = useState(false);

  // 编辑表单
  const [editForm, setEditForm] = useState({ name: '', email: '', phone: '', role: '' });
  // 积分
  const [newPoints, setNewPoints] = useState('');

  const loadUser = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`);
      const data = await res.json();
      if (data.success) {
        setUser(data.data);
      } else {
        toast.error(data.error || '加载用户失败');
        router.push('/admin/users');
      }
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (userId) loadUser(); }, [userId]);

  // 编辑
  const openEdit = () => {
    if (!user) return;
    setEditForm({ name: user.name, email: user.email, phone: user.phone || '', role: user.role });
    setEditOpen(true);
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ full_name: editForm.name, email: editForm.email, phone: editForm.phone, role: editForm.role }),
      });
      const data = await res.json();
      if (data.success) { toast.success('用户信息已更新'); setEditOpen(false); loadUser(); }
      else toast.error(data.error || '更新失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  // 启用/禁用
  const toggleStatus = async () => {
    if (!user) return;
    const action = user.status === 'disabled' ? 'enable' : 'disable';
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/disable`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ action }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(action === 'disable' ? '用户已禁用' : '用户已启用');
        loadUser();
      } else toast.error(data.error || '操作失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  // 删除
  const handleDelete = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast.success('用户已删除'); router.push('/admin/users'); }
      else toast.error(data.error || '删除失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  // 积分
  const openPoints = () => { if (user) { setNewPoints(String(user.points)); setPointsOpen(true); } };
  const handleSavePoints = async () => {
    const pts = parseInt(newPoints);
    if (isNaN(pts) || pts < 0) { toast.error('请输入有效的积分值'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/users/${userId}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: pts }),
      });
      const data = await res.json();
      if (data.success) { toast.success('积分已更新'); setPointsOpen(false); loadUser(); }
      else toast.error(data.error || '更新失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载用户详情...</span>
      </div>
    );
  }

  if (!user) return null;

  const st = STATUS_MAP[user.status] || STATUS_MAP.active;

  const InfoItem = ({ icon: Icon, label, value }: { icon?: React.ElementType; label: string; value: string }) => (
    <div className="flex items-center gap-3 py-2">
      {Icon && <Icon className="h-4 w-4 text-gray-400" />}
      <span className="text-sm text-gray-500 w-24 shrink-0">{label}</span>
      <span className="text-sm font-medium">{value || '-'}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <h1 className="text-2xl font-bold">用户详情</h1>
            <p className="text-gray-500">{user.name} 的详细信息</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Pencil className="h-4 w-4 mr-2" />
            编辑
          </Button>
          <Button variant="outline" size="sm" onClick={toggleStatus} disabled={saving}>
            {user.status === 'disabled'
              ? <><CheckCircle className="h-4 w-4 mr-2" />启用</>
              : <><Ban className="h-4 w-4 mr-2" />禁用</>
            }
          </Button>
          <Button variant="outline" size="sm" onClick={openPoints}>
            <Coins className="h-4 w-4 mr-2" />
            积分
          </Button>
          <Button variant="outline" size="sm" className="text-red-600" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />
            删除
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* 用户卡片 */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              <Avatar className="h-20 w-20 mb-3">
                {user.avatar ? <AvatarImage src={user.avatar} /> : null}
                <AvatarFallback className="text-xl">{user.name?.[0] || 'U'}</AvatarFallback>
              </Avatar>
              <h3 className="text-lg font-semibold">{user.name}</h3>
              <p className="text-sm text-gray-500">@{user.username}</p>
              <div className="flex gap-2 mt-3">
                <Badge className={st.color}>{st.label}</Badge>
                <Badge variant="outline">{ROLE_OPTIONS.find(r => r.value === user.role)?.label || user.role}</Badge>
              </div>
              {user.points > 0 && (
                <div className="mt-3 flex items-center gap-1 text-sm text-amber-600">
                  <Coins className="h-4 w-4" />
                  <span className="font-medium">{user.points} 积分</span>
                </div>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 基本信息 */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">基本信息</CardTitle>
          </CardHeader>
          <CardContent className="space-y-1">
            <InfoItem icon={Mail} label="邮箱" value={user.email} />
            <InfoItem icon={Phone} label="手机号" value={user.phone} />
            <InfoItem icon={Calendar} label="注册时间" value={user.createdAt ? new Date(user.createdAt).toLocaleString('zh-CN') : '-'} />
            <InfoItem icon={Clock} label="最后登录" value={user.lastLogin ? new Date(user.lastLogin).toLocaleString('zh-CN') : '-'} />
            <InfoItem icon={Shield} label="角色" value={ROLE_OPTIONS.find(r => r.value === user.role)?.label || user.role} />
            <InfoItem icon={CheckCircle} label="状态" value={st.label} />
            <InfoItem label="用户ID" value={user.id?.slice(0, 8) + '...'} />
          </CardContent>
        </Card>
      </div>

      {/* 编辑对话框 */}
      <Dialog open={editOpen} onOpenChange={(o) => !saving && setEditOpen(o)}>
        <DialogContent className="sm:max-w-[420px]">
          <DialogHeader>
            <DialogTitle>编辑用户信息</DialogTitle>
            <DialogDescription>修改 {user.name} 的基本信息</DialogDescription>
          </DialogHeader>
          <div className="space-y-4 py-2">
            <div>
              <Label>姓名 *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <Label>邮箱</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div>
              <Label>手机号</Label>
              <Input value={editForm.phone} onChange={(e) => setEditForm({ ...editForm, phone: e.target.value })} />
            </div>
            <div>
              <Label>角色</Label>
              <Select value={editForm.role} onValueChange={(v) => setEditForm({ ...editForm, role: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  {ROLE_OPTIONS.map(r => <SelectItem key={r.value} value={r.value}>{r.label}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={handleSaveEdit} disabled={saving || !editForm.name.trim()}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 积分对话框 */}
      <Dialog open={pointsOpen} onOpenChange={(o) => !saving && setPointsOpen(o)}>
        <DialogContent className="sm:max-w-[360px]">
          <DialogHeader>
            <DialogTitle>设置积分</DialogTitle>
            <DialogDescription>当前积分：{user.points}</DialogDescription>
          </DialogHeader>
          <div className="py-2">
            <Label>积分余额</Label>
            <Input
              type="number"
              min="0"
              value={newPoints}
              onChange={(e) => setNewPoints(e.target.value)}
              placeholder="0"
            />
            <p className="text-xs text-gray-400 mt-1">设置用户的积分余额（非增减）</p>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setPointsOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={handleSavePoints} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              保存
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除对话框 */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !saving && setDeleteOpen(o)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除用户「{user.name}」({user.email})吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={saving}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
