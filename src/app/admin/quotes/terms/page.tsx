'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  DropdownMenu, DropdownMenuContent, DropdownMenuItem,
  DropdownMenuSeparator, DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import {
  Plus, Search, MoreHorizontal, Pencil, Star, Trash2,
  Loader2, FileText, ShieldCheck,
} from 'lucide-react';
import { toast } from 'sonner';

interface QuoteTerm {
  id: number;
  name: string;
  paymentTerms: string;
  warrantyPeriod: string;
  deliveryPeriod: string;
  validityPeriod: string;
  remarks: string;
  taxRate: number;
  shipping: number;
  installation: number;
  otherFees: number;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

const emptyForm = {
  name: '',
  paymentTerms: '预付30%，发货前付清70%',
  warrantyPeriod: '整机质保12个月',
  deliveryPeriod: '合同签订后15个工作日内',
  validityPeriod: '15天',
  taxRate: 13,
  shipping: 0,
  installation: 0,
  otherFees: 0,
  remarks: '',
  isDefault: false,
};

export default function QuoteTermsPage() {
  const [terms, setTerms] = useState<QuoteTerm[]>([]);
  const [loading, setLoading] = useState(true);
  const [keyword, setKeyword] = useState('');

  // 对话框
  const [formOpen, setFormOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [editing, setEditing] = useState<QuoteTerm | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<QuoteTerm | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const [form, setForm] = useState(emptyForm);

  const loadTerms = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/quote-terms');
      const data = await res.json();
      if (data.success) {
        setTerms(data.data || []);
      } else {
        toast.error(data.error || '加载条款失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadTerms(); }, []);

  const openCreate = () => {
    setEditing(null);
    setForm(emptyForm);
    setFormOpen(true);
  };

  const openEdit = (term: QuoteTerm) => {
    setEditing(term);
    setForm({
      name: term.name,
      paymentTerms: term.paymentTerms,
      warrantyPeriod: term.warrantyPeriod,
      deliveryPeriod: term.deliveryPeriod,
      validityPeriod: term.validityPeriod,
      taxRate: term.taxRate,
      shipping: term.shipping,
      installation: term.installation,
      otherFees: term.otherFees,
      remarks: term.remarks,
      isDefault: term.isDefault,
    });
    setFormOpen(true);
  };

  const handleSave = async () => {
    if (!form.name.trim()) {
      toast.error('请输入条款名称');
      return;
    }
    setSubmitting(true);
    try {
      const url = editing ? `/api/admin/quote-terms/${editing.id}` : '/api/admin/quote-terms';
      const method = editing ? 'PUT' : 'POST';
      const res = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(form),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(editing ? '条款已更新' : '条款创建成功');
        setFormOpen(false);
        loadTerms();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const handleSetDefault = async (term: QuoteTerm) => {
    if (term.isDefault) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/quote-terms/${term.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isDefault: true }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(`已将「${term.name}」设为默认条款`);
        loadTerms();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/quote-terms/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('条款已删除');
        setDeleteOpen(false);
        loadTerms();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSubmitting(false);
    }
  };

  const filtered = keyword.trim()
    ? terms.filter(t => t.name.toLowerCase().includes(keyword.toLowerCase()))
    : terms;

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">报价条款管理</h1>
          <p className="text-gray-500">管理报价单商务条款模板</p>
        </div>
        <Button onClick={openCreate}>
          <Plus className="h-4 w-4 mr-2" />
          新增条款
        </Button>
      </div>

      {/* 统计 */}
      <div className="grid gap-4 md:grid-cols-3">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-blue-100 p-2 rounded-lg">
              <FileText className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">条款总数</p>
              <p className="text-xl font-bold">{terms.length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-green-100 p-2 rounded-lg">
              <ShieldCheck className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">默认条款</p>
              <p className="text-xl font-bold">{terms.filter(t => t.isDefault).length}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-purple-100 p-2 rounded-lg">
              <Star className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">默认税率</p>
              <p className="text-xl font-bold">
                {terms.find(t => t.isDefault)?.taxRate ?? 13}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 列表 */}
      <Card>
        <CardHeader className="pb-0">
          <div className="flex items-center justify-between">
            <CardTitle className="text-lg">条款列表</CardTitle>
            <div className="relative w-64">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜索条款名称..."
                className="pl-9"
                value={keyword}
                onChange={(e) => setKeyword(e.target.value)}
              />
            </div>
          </div>
        </CardHeader>
        <CardContent className="pt-4">
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : filtered.length === 0 ? (
            <div className="text-center py-16">
              <FileText className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">
                {keyword ? '没有匹配的条款' : '暂无条款模板，点击上方按钮创建'}
              </p>
            </div>
          ) : (
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>名称</TableHead>
                    <TableHead>付款方式</TableHead>
                    <TableHead>质保期</TableHead>
                    <TableHead>交货期</TableHead>
                    <TableHead>有效期</TableHead>
                    <TableHead className="text-right">税率</TableHead>
                    <TableHead className="text-right">操作</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {filtered.map((term) => (
                    <TableRow key={term.id}>
                      <TableCell>
                        <div className="flex items-center gap-2">
                          <span className="font-medium">{term.name}</span>
                          {term.isDefault && (
                            <Badge className="bg-green-100 text-green-700 text-[10px]">默认</Badge>
                          )}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[200px] truncate text-sm text-gray-600">
                        {term.paymentTerms || '-'}
                      </TableCell>
                      <TableCell className="text-sm">{term.warrantyPeriod || '-'}</TableCell>
                      <TableCell className="text-sm">{term.deliveryPeriod || '-'}</TableCell>
                      <TableCell className="text-sm">{term.validityPeriod || '-'}</TableCell>
                      <TableCell className="text-right font-medium">{term.taxRate}%</TableCell>
                      <TableCell className="text-right">
                        <DropdownMenu>
                          <DropdownMenuTrigger asChild>
                            <Button variant="ghost" size="icon" className="h-8 w-8">
                              <MoreHorizontal className="h-4 w-4" />
                            </Button>
                          </DropdownMenuTrigger>
                          <DropdownMenuContent align="end" className="w-40">
                            <DropdownMenuItem onClick={() => openEdit(term)}>
                              <Pencil className="h-4 w-4 mr-2" />
                              编辑
                            </DropdownMenuItem>
                            {!term.isDefault && (
                              <DropdownMenuItem onClick={() => handleSetDefault(term)}>
                                <Star className="h-4 w-4 mr-2" />
                                设为默认
                              </DropdownMenuItem>
                            )}
                            <DropdownMenuSeparator />
                            <DropdownMenuItem
                              className="text-red-600"
                              onClick={() => { setDeleteTarget(term); setDeleteOpen(true); }}
                            >
                              <Trash2 className="h-4 w-4 mr-2" />
                              删除
                            </DropdownMenuItem>
                          </DropdownMenuContent>
                        </DropdownMenu>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          )}
        </CardContent>
      </Card>

      {/* 新增/编辑对话框 */}
      <Dialog open={formOpen} onOpenChange={(open) => !submitting && setFormOpen(open)}>
        <DialogContent className="max-w-lg max-h-[85vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing ? '编辑条款' : '新增条款'}</DialogTitle>
            <DialogDescription>
              {editing ? `编辑「${editing.name}」条款模板` : '创建新的报价条款模板'}
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-2">
            <div>
              <Label>条款名称 *</Label>
              <Input
                value={form.name}
                onChange={(e) => setForm({ ...form, name: e.target.value })}
                placeholder="如：标准条款、工程条款"
              />
            </div>

            <div>
              <Label>付款方式</Label>
              <Textarea
                value={form.paymentTerms}
                onChange={(e) => setForm({ ...form, paymentTerms: e.target.value })}
                placeholder="如：预付30%，发货前付清70%"
                rows={2}
              />
            </div>

            <div className="grid grid-cols-3 gap-4">
              <div>
                <Label>质保期</Label>
                <Input
                  value={form.warrantyPeriod}
                  onChange={(e) => setForm({ ...form, warrantyPeriod: e.target.value })}
                  placeholder="整机质保12个月"
                />
              </div>
              <div>
                <Label>交货期</Label>
                <Input
                  value={form.deliveryPeriod}
                  onChange={(e) => setForm({ ...form, deliveryPeriod: e.target.value })}
                  placeholder="合同签订后15个工作日内"
                />
              </div>
              <div>
                <Label>有效期</Label>
                <Input
                  value={form.validityPeriod}
                  onChange={(e) => setForm({ ...form, validityPeriod: e.target.value })}
                  placeholder="15天"
                />
              </div>
            </div>

            <div>
              <Label className="text-sm font-medium text-gray-700 mb-2 block">费用设置</Label>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <Label>税率 (%)</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.taxRate}
                    onChange={(e) => setForm({ ...form, taxRate: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>运费</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.shipping}
                    onChange={(e) => setForm({ ...form, shipping: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>安装费</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.installation}
                    onChange={(e) => setForm({ ...form, installation: parseFloat(e.target.value) || 0 })}
                  />
                </div>
                <div>
                  <Label>其他费用</Label>
                  <Input
                    type="number"
                    step="0.01"
                    value={form.otherFees}
                    onChange={(e) => setForm({ ...form, otherFees: parseFloat(e.target.value) || 0 })}
                  />
                </div>
              </div>
            </div>

            <div>
              <Label>备注</Label>
              <Textarea
                value={form.remarks}
                onChange={(e) => setForm({ ...form, remarks: e.target.value })}
                placeholder="条款备注信息（选填）"
                rows={2}
              />
            </div>

            <div className="flex items-center gap-2">
              <input
                type="checkbox"
                id="isDefault"
                checked={form.isDefault}
                onChange={(e) => setForm({ ...form, isDefault: e.target.checked })}
                className="rounded"
              />
              <Label htmlFor="isDefault" className="cursor-pointer">设为默认条款</Label>
            </div>
          </div>

          <DialogFooter>
            <Button variant="outline" onClick={() => setFormOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button onClick={handleSave} disabled={submitting || !form.name.trim()}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {editing ? '保存' : '创建'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <Dialog open={deleteOpen} onOpenChange={(open) => !submitting && setDeleteOpen(open)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>
              确定要删除条款「{deleteTarget?.name}」吗？此操作不可撤销。
            </DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDeleteOpen(false)} disabled={submitting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              确认删除
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
