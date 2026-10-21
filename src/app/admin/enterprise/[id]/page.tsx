'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
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
  ArrowLeft, Pencil, Trash2, Loader2, Building2, User, Phone,
  Mail, MapPin, Globe, Calendar, Clock, Shield, CreditCard, IdCard,
} from 'lucide-react';
import { toast } from 'sonner';

interface EnterpriseData {
  id: string;
  name: string;
  credit_code: string;
  legal_person: string;
  contact_person: string;
  contact_phone: string;
  email: string;
  address: string;
  industry: string;
  scale: string;
  description: string;
  logo_url: string;
  status: string;
  user_id: string;
  adminName: string;
  created_at: string;
  updated_at: string;
}

const STATUS_MAP: Record<string, { label: string; color: string }> = {
  active: { label: '正常', color: 'bg-green-100 text-green-700' },
  disabled: { label: '已禁用', color: 'bg-red-100 text-red-700' },
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-700' },
};

const SCALE_OPTIONS = ['1-50人', '50-200人', '200-500人', '500-1000人', '1000-5000人', '5000人以上'];

const INDUSTRY_OPTIONS = [
  '制造业', '建筑业', '信息技术', '金融业', '批发零售', '交通运输',
  '住宿餐饮', '教育', '医疗卫生', '科学研究', '水利环境', '其他',
];

export default function EnterpriseDetailPage() {
  const params = useParams();
  const router = useRouter();
  const enterpriseId = params.id;

  const [enterprise, setEnterprise] = useState<EnterpriseData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [editOpen, setEditOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  const loadEnterprise = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/enterprises/${enterpriseId}`);
      const data = await res.json();
      if (data.success) setEnterprise(data.data);
      else { toast.error('企业不存在'); router.push('/admin/enterprise'); }
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (enterpriseId) loadEnterprise(); }, [enterpriseId]);

  const openEdit = () => {
    if (!enterprise) return;
    setEditForm({
      name: enterprise.name || '',
      credit_code: enterprise.credit_code || '',
      legal_person: enterprise.legal_person || '',
      contact_person: enterprise.contact_person || '',
      contact_phone: enterprise.contact_phone || '',
      email: enterprise.email || '',
      address: enterprise.address || '',
      industry: enterprise.industry || '',
      scale: enterprise.scale || '',
      description: enterprise.description || '',
      logo_url: enterprise.logo_url || '',
      status: enterprise.status || 'active',
    });
    setEditOpen(true);
  };

  const handleSave = async () => {
    if (!editForm.name.trim()) { toast.error('企业名称不能为空'); return; }
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/enterprises/${enterpriseId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(editForm),
      });
      const data = await res.json();
      if (data.success) { toast.success('企业信息已更新'); setEditOpen(false); loadEnterprise(); }
      else toast.error(data.error || '更新失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/enterprises/${enterpriseId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast.success('企业已删除'); router.push('/admin/enterprise'); }
      else toast.error(data.error || '删除失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载企业详情...</span>
      </div>
    );
  }

  if (!enterprise) return null;

  const st = STATUS_MAP[enterprise.status] || STATUS_MAP.active;

  const InfoRow = ({ icon: Icon, label, value }: { icon?: React.ElementType; label: string; value: React.ReactNode }) => (
    <div className="flex items-center gap-3 py-2.5 border-b border-gray-50 last:border-0">
      {Icon && <Icon className="h-4 w-4 text-gray-400 shrink-0" />}
      <span className="text-sm text-gray-500 w-24 shrink-0">{label}</span>
      <span className="text-sm font-medium">{value || '-'}</span>
    </div>
  );

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{enterprise.name}</h1>
              <Badge className={st.color}>{st.label}</Badge>
            </div>
            <p className="text-gray-500 text-sm">企业详情</p>
          </div>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={openEdit}>
            <Pencil className="h-4 w-4 mr-2" />编辑
          </Button>
          <Button variant="outline" size="sm" className="text-red-600" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />删除
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* 企业卡片 */}
        <Card>
          <CardContent className="pt-6">
            <div className="flex flex-col items-center text-center">
              {enterprise.logo_url ? (
                <img src={enterprise.logo_url} alt={enterprise.name} className="w-20 h-20 rounded-lg object-cover mb-3 border" />
              ) : (
                <div className="w-20 h-20 rounded-lg bg-blue-100 flex items-center justify-center mb-3">
                  <Building2 className="h-10 w-10 text-blue-500" />
                </div>
              )}
              <h3 className="text-lg font-semibold">{enterprise.name}</h3>
              {enterprise.industry && (
                <Badge variant="outline" className="mt-2">{enterprise.industry}</Badge>
              )}
              {enterprise.scale && (
                <p className="text-xs text-gray-500 mt-1">{enterprise.scale}</p>
              )}
            </div>
          </CardContent>
        </Card>

        {/* 基本信息 */}
        <Card className="md:col-span-2">
          <CardHeader>
            <CardTitle className="text-lg">基本信息</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow icon={CreditCard} label="信用代码" value={enterprise.credit_code ? <span className="font-mono text-xs">{enterprise.credit_code}</span> : null} />
            <InfoRow icon={User} label="法人代表" value={enterprise.legal_person} />
            <InfoRow icon={Building2} label="所属行业" value={enterprise.industry} />
            <InfoRow icon={Globe} label="企业规模" value={enterprise.scale} />
            {enterprise.description && (
              <div className="pt-2 mt-1 border-t">
                <p className="text-xs text-gray-500 mb-1">企业简介</p>
                <p className="text-sm text-gray-700">{enterprise.description}</p>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        {/* 联系信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">联系信息</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow icon={User} label="联系人" value={enterprise.contact_person} />
            <InfoRow icon={Phone} label="联系电话" value={enterprise.contact_phone} />
            <InfoRow icon={Mail} label="企业邮箱" value={enterprise.email} />
            <InfoRow icon={MapPin} label="企业地址" value={enterprise.address} />
          </CardContent>
        </Card>

        {/* 其他信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">管理信息</CardTitle>
          </CardHeader>
          <CardContent>
            <InfoRow icon={Shield} label="状态" value={<Badge className={st.color}>{st.label}</Badge>} />
            <InfoRow icon={User} label="管理员" value={enterprise.adminName || '未关联'} />
            <InfoRow icon={Calendar} label="创建时间" value={enterprise.created_at ? new Date(enterprise.created_at).toLocaleString('zh-CN') : '-'} />
            <InfoRow icon={Clock} label="更新时间" value={enterprise.updated_at ? new Date(enterprise.updated_at).toLocaleString('zh-CN') : '-'} />
            <InfoRow icon={IdCard} label="企业ID" value={enterprise.id?.slice(0, 8) + '...'} />
          </CardContent>
        </Card>
      </div>

      {/* 编辑对话框 */}
      <Dialog open={editOpen} onOpenChange={(o) => !saving && setEditOpen(o)}>
        <DialogContent className="sm:max-w-[600px] max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑企业信息</DialogTitle>
            <DialogDescription>修改「{enterprise.name}」的信息</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 md:grid-cols-2 py-2">
            <div className="md:col-span-2">
              <Label>企业名称 *</Label>
              <Input value={editForm.name} onChange={(e) => setEditForm({ ...editForm, name: e.target.value })} />
            </div>
            <div>
              <Label>统一社会信用代码</Label>
              <Input value={editForm.credit_code} onChange={(e) => setEditForm({ ...editForm, credit_code: e.target.value })} placeholder="18位" maxLength={18} />
            </div>
            <div>
              <Label>法人代表</Label>
              <Input value={editForm.legal_person} onChange={(e) => setEditForm({ ...editForm, legal_person: e.target.value })} />
            </div>
            <div>
              <Label>联系人</Label>
              <Input value={editForm.contact_person} onChange={(e) => setEditForm({ ...editForm, contact_person: e.target.value })} />
            </div>
            <div>
              <Label>联系电话</Label>
              <Input value={editForm.contact_phone} onChange={(e) => setEditForm({ ...editForm, contact_phone: e.target.value })} />
            </div>
            <div>
              <Label>企业邮箱</Label>
              <Input type="email" value={editForm.email} onChange={(e) => setEditForm({ ...editForm, email: e.target.value })} />
            </div>
            <div>
              <Label>所属行业</Label>
              <Select value={editForm.industry} onValueChange={(v) => setEditForm({ ...editForm, industry: v })}>
                <SelectTrigger><SelectValue placeholder="选择行业" /></SelectTrigger>
                <SelectContent>
                  {INDUSTRY_OPTIONS.map(i => <SelectItem key={i} value={i}>{i}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>企业规模</Label>
              <Select value={editForm.scale} onValueChange={(v) => setEditForm({ ...editForm, scale: v })}>
                <SelectTrigger><SelectValue placeholder="选择规模" /></SelectTrigger>
                <SelectContent>
                  {SCALE_OPTIONS.map(s => <SelectItem key={s} value={s}>{s}</SelectItem>)}
                </SelectContent>
              </Select>
            </div>
            <div className="md:col-span-2">
              <Label>企业地址</Label>
              <Input value={editForm.address} onChange={(e) => setEditForm({ ...editForm, address: e.target.value })} />
            </div>
            <div className="md:col-span-2">
              <Label>企业简介</Label>
              <Textarea value={editForm.description} onChange={(e) => setEditForm({ ...editForm, description: e.target.value })} rows={3} />
            </div>
            <div className="md:col-span-2">
              <Label>Logo URL</Label>
              <Input value={editForm.logo_url} onChange={(e) => setEditForm({ ...editForm, logo_url: e.target.value })} placeholder="https://..." />
            </div>
            <div>
              <Label>状态</Label>
              <Select value={editForm.status} onValueChange={(v) => setEditForm({ ...editForm, status: v })}>
                <SelectTrigger><SelectValue /></SelectTrigger>
                <SelectContent>
                  <SelectItem value="active">正常</SelectItem>
                  <SelectItem value="disabled">已禁用</SelectItem>
                  <SelectItem value="pending">待审核</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditOpen(false)} disabled={saving}>取消</Button>
            <Button onClick={handleSave} disabled={saving || !editForm.name.trim()}>
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
            <DialogDescription>确定要删除企业「{enterprise.name}」吗？此操作不可撤销。</DialogDescription>
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
