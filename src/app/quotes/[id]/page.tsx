'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams, useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Trash2, Loader2, Calendar, Clock, FileText,
  CheckCircle, XCircle, Send, Pencil, Save, X,
} from 'lucide-react';
import { toast } from 'sonner';
import { ShareQuoteDialog } from '@/components/quotes/ShareQuoteDialog';

interface QuoteProduct {
  name: string;
  model?: string;
  brand?: string;
  category?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
}

interface QuoteData {
  id: string;
  quoteNumber: string;
  status: string;
  subtotal: number;
  taxRate: number;
  taxAmount: number;
  discountRate: number;
  discountAmount: number;
  totalAmount: number;
  products: QuoteProduct[];
  customerInfo: Record<string, any>;
  supplierInfo: Record<string, any>;
  terms: Record<string, any>;
  version: number;
  issuedAt: string | null;
  validUntil: string | null;
  createdAt: string;
  updatedAt: string;
  creatorName: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-700', icon: <FileText className="h-3.5 w-3.5" /> },
  sent: { label: '已发送', color: 'bg-blue-100 text-blue-700', icon: <Send className="h-3.5 w-3.5" /> },
  approved: { label: '已接受', color: 'bg-green-100 text-green-700', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-700', icon: <XCircle className="h-3.5 w-3.5" /> },
  expired: { label: '已过期', color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="h-3.5 w-3.5" /> },
};

/** 客户信息字段汉化映射 */
const CUSTOMER_FIELD_MAP: Record<string, string> = {
  name: '客户名称',
  customer_name: '客户名称',
  contact: '联系人',
  contactPerson: '联系人',
  contact_person: '联系人',
  contactName: '联系人',
  phone: '联系电话',
  contact_phone: '联系电话',
  tel: '联系电话',
  email: '邮箱',
  address: '地址',
  projectName: '项目名称',
  project_name: '项目名称',
  company: '公司名称',
  company_name: '公司名称',
  tax_no: '税号',
  remark: '备注',
};

/** 商务条款字段汉化映射 */
const TERMS_FIELD_MAP: Record<string, string> = {
  payment: '付款方式',
  payment_terms: '付款方式',
  delivery: '交货期',
  delivery_time: '交货期',
  validity: '有效期',
  validity_days: '有效期',
  warranty: '质保期',
  warranty_period: '质保期',
  currency: '币种',
  freight: '运费',
  tax: '税费',
  discount: '折扣',
  remark: '备注',
  remarks: '备注',
  notes: '备注',
};

function formatMoney(n: number): string {
  return `¥${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function QuoteDetailPage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span>加载报价单...</span>
        </div>
      </div>
    }>
      <QuoteDetailContent />
    </Suspense>
  );
}

function QuoteDetailContent() {
  const params = useParams();
  const router = useRouter();
  const searchParams = useSearchParams();
  const quoteId = params.id as string;

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);
  const [shareOpen, setShareOpen] = useState(false);
  const [editMode, setEditMode] = useState(searchParams.get('edit') === '1');
  const [editCustomerName, setEditCustomerName] = useState('');
  const [editCustomerPhone, setEditCustomerPhone] = useState('');
  const [editCustomerEmail, setEditCustomerEmail] = useState('');
  const [editCustomerAddress, setEditCustomerAddress] = useState('');
  const [editProjectName, setEditProjectName] = useState('');
  const [editContactPerson, setEditContactPerson] = useState('');
  const [editPayment, setEditPayment] = useState('');
  const [editDelivery, setEditDelivery] = useState('');
  const [editValidity, setEditValidity] = useState('');
  const [editWarranty, setEditWarranty] = useState('');
  const [editValidUntil, setEditValidUntil] = useState('');
  const [editProducts, setEditProducts] = useState<QuoteProduct[]>([]);

  const loadQuote = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`);
      const data = await res.json();
      if (data.success) {
        setQuote(data.data);
        const ci = data.data.customerInfo || {};
        setEditCustomerName(ci.name || ci.customer_name || '');
        setEditCustomerPhone(ci.phone || ci.contact_phone || ci.tel || '');
        setEditCustomerEmail(ci.email || '');
        setEditCustomerAddress(ci.address || '');
        setEditProjectName(ci.projectName || ci.project_name || '');
        setEditContactPerson(ci.contactPerson || ci.contact_person || ci.contactName || ci.contact || '');
        const tm = data.data.terms || {};
        setEditPayment(tm.payment || tm.payment_terms || '');
        setEditDelivery(tm.delivery || tm.delivery_time || '');
        setEditValidity(tm.validity || tm.validity_days || '');
        setEditWarranty(tm.warranty || tm.warranty_period || '');
        setEditValidUntil(data.data.validUntil ? data.data.validUntil.slice(0, 10) : '');
        setEditProducts((data.data.products || []).map((p: QuoteProduct) => ({ ...p })));
      } else {
        toast.error(data.error || '报价单不存在');
        router.push('/quotes');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (quoteId) loadQuote();
  }, [quoteId]);

  const updateStatus = async (status: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.status === 'sent' ? '报价单已发送' : '状态已更新');
        loadQuote();
      } else {
        toast.error(data.error || '更新失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const updateEditProduct = (index: number, field: string, value: string) => {
    setEditProducts((prev) => prev.map((p, i) => {
      if (i !== index) return p;
      const next = { ...p };
      if (field === 'quantity' || field === 'unitPrice') {
        (next as any)[field] = Number(value) || 0;
      } else {
        (next as any)[field] = value;
      }
      next.totalPrice = (next.quantity || 0) * (next.unitPrice || 0);
      return next;
    }));
  };

  const addEditProduct = () => {
    setEditProducts((prev) => [...prev, { name: '', model: '', brand: '', unit: '', quantity: 1, unitPrice: 0, totalPrice: 0 }]);
  };

  const removeEditProduct = (index: number) => {
    setEditProducts((prev) => prev.filter((_, i) => i !== index));
  };

  const handleSaveEdit = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          products: editProducts,
          customerInfo: {
            ...(quote?.customerInfo || {}),
            name: editCustomerName,
            phone: editCustomerPhone,
            email: editCustomerEmail,
            address: editCustomerAddress,
            projectName: editProjectName,
            contactPerson: editContactPerson,
          },
          terms: {
            ...(quote?.terms || {}),
            payment: editPayment,
            delivery: editDelivery,
            validity: editValidity,
            warranty: editWarranty,
          },
          validUntil: editValidUntil ? new Date(editValidUntil).toISOString() : null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('报价单已更新');
        setEditMode(false);
        loadQuote();
      } else {
        toast.error(data.error || '更新失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/quotes/${quoteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) {
        toast.success('报价单已删除');
        router.push('/quotes');
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="flex items-center gap-2 text-gray-500">
          <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
          <span>加载报价单...</span>
        </div>
      </div>
    );
  }

  if (!quote) return null;

  const st = STATUS_MAP[quote.status] || STATUS_MAP.draft;
  const products = quote.products || [];
  const isDraft = quote.status === 'draft';

  const renderInfoValue = (label: string, value: any) => (
    <div key={label} className="flex justify-between text-sm">
      <span className="text-gray-500">{CUSTOMER_FIELD_MAP[label] || label}</span>
      <span className="font-medium">{String(value) || '-'}</span>
    </div>
  );

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="sm" onClick={() => router.push('/quotes')}>
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回列表
          </Button>
          <div className="flex items-center gap-2">
            <h1 className="text-lg font-semibold">{quote.quoteNumber || '报价单'}</h1>
            <Badge variant="outline" className={`${st.color} gap-1 border-transparent`}>
              {st.icon}{st.label}
            </Badge>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {isDraft && (
            <>
              {editMode ? (
                <>
                  <Button variant="outline" size="sm" onClick={() => setEditMode(false)} disabled={saving}>
                    <X className="h-4 w-4 mr-1" />取消
                  </Button>
                  <Button size="sm" onClick={handleSaveEdit} disabled={saving}>
                    {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
                    <Save className="h-4 w-4 mr-1" />保存
                  </Button>
                </>
              ) : (
                <Button variant="outline" size="sm" onClick={() => setEditMode(true)}>
                  <Pencil className="h-4 w-4 mr-1" />编辑
                </Button>
              )}
              <Button size="sm" onClick={() => setShareOpen(true)} disabled={saving}>
                <Send className="h-4 w-4 mr-1" />发送
              </Button>
              <Button variant="outline" size="sm" className="text-red-600" onClick={() => setDeleteOpen(true)}>
                <Trash2 className="h-4 w-4 mr-1" />删除
              </Button>
            </>
          )}
        </div>
      </div>

      <div className="max-w-5xl mx-auto px-4 py-6 space-y-6 max-h-[calc(100vh-200px)] overflow-y-auto">
        <p className="text-sm text-gray-500">
          版本 v{quote.version || 1} · 创建者：{quote.creatorName || '-'} · 创建时间：
          {quote.createdAt ? new Date(quote.createdAt).toLocaleString('zh-CN') : '-'}
        </p>

        {editMode && (
          <>
            {/* 编辑客户信息 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">编辑客户信息</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>客户名称</Label>
                  <Input value={editCustomerName} onChange={(e) => setEditCustomerName(e.target.value)} placeholder="客户名称" />
                </div>
                <div className="space-y-1.5">
                  <Label>联系电话</Label>
                  <Input value={editCustomerPhone} onChange={(e) => setEditCustomerPhone(e.target.value)} placeholder="联系电话" />
                </div>
                <div className="space-y-1.5">
                  <Label>邮箱</Label>
                  <Input value={editCustomerEmail} onChange={(e) => setEditCustomerEmail(e.target.value)} placeholder="邮箱" />
                </div>
                <div className="space-y-1.5">
                  <Label>地址</Label>
                  <Input value={editCustomerAddress} onChange={(e) => setEditCustomerAddress(e.target.value)} placeholder="地址" />
                </div>
                <div className="space-y-1.5">
                  <Label>项目名称</Label>
                  <Input value={editProjectName} onChange={(e) => setEditProjectName(e.target.value)} placeholder="项目名称" />
                </div>
                <div className="space-y-1.5">
                  <Label>联系人</Label>
                  <Input value={editContactPerson} onChange={(e) => setEditContactPerson(e.target.value)} placeholder="联系人" />
                </div>
              </CardContent>
            </Card>

            {/* 编辑商务条款 */}
            <Card>
              <CardHeader>
                <CardTitle className="text-lg">编辑商务条款</CardTitle>
              </CardHeader>
              <CardContent className="grid gap-4 sm:grid-cols-3">
                <div className="space-y-1.5">
                  <Label>付款方式</Label>
                  <Input value={editPayment} onChange={(e) => setEditPayment(e.target.value)} placeholder="付款方式" />
                </div>
                <div className="space-y-1.5">
                  <Label>交货期</Label>
                  <Input value={editDelivery} onChange={(e) => setEditDelivery(e.target.value)} placeholder="交货期" />
                </div>
                <div className="space-y-1.5">
                  <Label>有效期</Label>
                  <Input value={editValidity} onChange={(e) => setEditValidity(e.target.value)} placeholder="有效期" />
                </div>
                <div className="space-y-1.5">
                  <Label>质保期</Label>
                  <Input value={editWarranty} onChange={(e) => setEditWarranty(e.target.value)} placeholder="质保期" />
                </div>
                <div className="space-y-1.5">
                  <Label>有效期至</Label>
                  <Input type="date" value={editValidUntil} onChange={(e) => setEditValidUntil(e.target.value)} />
                </div>
              </CardContent>
            </Card>

            {/* 编辑产品明细 */}
            <Card>
              <CardHeader className="flex flex-row items-center justify-between space-y-0">
                <CardTitle className="text-lg">编辑产品明细</CardTitle>
                <Button variant="outline" size="sm" onClick={addEditProduct}>+ 添加产品</Button>
              </CardHeader>
              <CardContent>
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="w-10">#</TableHead>
                        <TableHead>产品名称</TableHead>
                        <TableHead>规格型号</TableHead>
                        <TableHead>品牌</TableHead>
                        <TableHead className="w-24">数量</TableHead>
                        <TableHead className="w-20">单位</TableHead>
                        <TableHead className="w-28">单价</TableHead>
                        <TableHead className="w-10"></TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {editProducts.map((p, i) => (
                        <TableRow key={i}>
                          <TableCell className="text-gray-400">{i + 1}</TableCell>
                          <TableCell>
                            <Input value={p.name || ''} onChange={(e) => updateEditProduct(i, 'name', e.target.value)} className="h-8" placeholder="产品名称" />
                          </TableCell>
                          <TableCell>
                            <Input value={p.model || ''} onChange={(e) => updateEditProduct(i, 'model', e.target.value)} className="h-8" placeholder="规格型号" />
                          </TableCell>
                          <TableCell>
                            <Input value={p.brand || ''} onChange={(e) => updateEditProduct(i, 'brand', e.target.value)} className="h-8" placeholder="品牌" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" min={0} value={p.quantity} onChange={(e) => updateEditProduct(i, 'quantity', e.target.value)} className="h-8" />
                          </TableCell>
                          <TableCell>
                            <Input value={p.unit || ''} onChange={(e) => updateEditProduct(i, 'unit', e.target.value)} className="h-8" placeholder="单位" />
                          </TableCell>
                          <TableCell>
                            <Input type="number" min={0} step="0.01" value={p.unitPrice} onChange={(e) => updateEditProduct(i, 'unitPrice', e.target.value)} className="h-8" />
                          </TableCell>
                          <TableCell>
                            <Button variant="ghost" size="icon" className="h-8 w-8 text-red-500" onClick={() => removeEditProduct(i)}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </TableCell>
                        </TableRow>
                      ))}
                      {editProducts.length === 0 && (
                        <TableRow>
                          <TableCell colSpan={8} className="text-center text-muted-foreground py-6">暂无产品，点击「+ 添加产品」</TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>
          </>
        )}

        <div className="grid gap-6 md:grid-cols-3">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">客户信息</CardTitle>
            </CardHeader>
            <CardContent>
              {quote.customerInfo && Object.keys(quote.customerInfo).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(quote.customerInfo).map(([key, val]) => renderInfoValue(key, val))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">未填写客户信息</p>
              )}
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">时间信息</CardTitle>
            </CardHeader>
            <CardContent className="space-y-3">
              <div className="flex items-center gap-2 text-sm">
                <Calendar className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500 w-20">签发日期</span>
                <span>{quote.issuedAt ? new Date(quote.issuedAt).toLocaleDateString('zh-CN') : '-'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <Clock className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500 w-20">有效期至</span>
                <span>{quote.validUntil ? new Date(quote.validUntil).toLocaleDateString('zh-CN') : '-'}</span>
              </div>
              <div className="flex items-center gap-2 text-sm">
                <FileText className="h-4 w-4 text-gray-400" />
                <span className="text-gray-500 w-20">更新时间</span>
                <span>{quote.updatedAt ? new Date(quote.updatedAt).toLocaleString('zh-CN') : '-'}</span>
              </div>
            </CardContent>
          </Card>

          <Card>
            <CardHeader>
              <CardTitle className="text-lg">商务条款</CardTitle>
            </CardHeader>
            <CardContent>
              {quote.terms && Object.keys(quote.terms).length > 0 ? (
                <div className="space-y-2">
                  {Object.entries(quote.terms).map(([key, val]) => (
                    <div key={key} className="text-sm">
                      <span className="text-gray-500">{TERMS_FIELD_MAP[key] || key}：</span>
                      <span>{String(val) || '-'}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-muted-foreground">未填写商务条款</p>
              )}
            </CardContent>
          </Card>
        </div>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">产品明细 ({products.length} 项)</CardTitle>
          </CardHeader>
          <CardContent>
            {products.length > 0 ? (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>序号</TableHead>
                      <TableHead>产品名称</TableHead>
                      <TableHead>规格型号</TableHead>
                      <TableHead>品牌</TableHead>
                      <TableHead className="text-right">数量</TableHead>
                      <TableHead>单位</TableHead>
                      <TableHead className="text-right">单价</TableHead>
                      <TableHead className="text-right">总价</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {products.map((p, i) => (
                      <TableRow key={i}>
                        <TableCell className="text-gray-400">{i + 1}</TableCell>
                        <TableCell className="font-medium">{p.name}</TableCell>
                        <TableCell className="text-sm text-gray-500">{p.model || '-'}</TableCell>
                        <TableCell className="text-sm text-gray-500">{p.brand || '-'}</TableCell>
                        <TableCell className="text-right">{p.quantity}</TableCell>
                        <TableCell className="text-sm text-gray-500">{p.unit || '-'}</TableCell>
                        <TableCell className="text-right">{formatMoney(p.unitPrice)}</TableCell>
                        <TableCell className="text-right font-medium">{formatMoney(p.totalPrice)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">暂无产品</p>
            )}
          </CardContent>
        </Card>

        <Card>
          <CardHeader>
            <CardTitle className="text-lg">金额汇总</CardTitle>
          </CardHeader>
          <CardContent>
            <div className="max-w-sm ml-auto space-y-2">
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">小计</span>
                <span>{formatMoney(quote.subtotal)}</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">税率</span>
                <span>{quote.taxRate}%</span>
              </div>
              <div className="flex justify-between text-sm">
                <span className="text-gray-500">税额</span>
                <span>{formatMoney(quote.taxAmount)}</span>
              </div>
              {quote.discountRate > 0 && (
                <div className="flex justify-between text-sm">
                  <span className="text-gray-500">折扣 ({quote.discountRate}%)</span>
                  <span className="text-red-600">-{formatMoney(quote.discountAmount)}</span>
                </div>
              )}
              <div className="border-t pt-2 flex justify-between text-lg font-bold">
                <span>总计</span>
                <span className="text-green-600">{formatMoney(quote.totalAmount)}</span>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>

      <Dialog open={deleteOpen} onOpenChange={(o) => !saving && setDeleteOpen(o)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除报价单「{quote.quoteNumber}」吗？此操作不可恢复。</DialogDescription>
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

      <ShareQuoteDialog
        open={shareOpen}
        onOpenChange={setShareOpen}
        quoteId={quote.id}
        quoteNumber={quote.quoteNumber}
        onSent={loadQuote}
      />
    </div>
  );
}
