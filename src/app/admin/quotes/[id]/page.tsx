'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  ArrowLeft, Trash2, Loader2, Calendar, Clock, User,
  FileText, CheckCircle, XCircle, Send,
} from 'lucide-react';
import { toast } from 'sonner';

interface QuoteProduct {
  name: string;
  model?: string;
  brand?: string;
  category?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  cost_price?: number;
  min_price?: number;
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
  creatorEmail: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-700', icon: <FileText className="h-3.5 w-3.5" /> },
  pending_review: { label: '待审核', color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="h-3.5 w-3.5" /> },
  approved: { label: '已批准', color: 'bg-green-100 text-green-700', icon: <CheckCircle className="h-3.5 w-3.5" /> },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-700', icon: <XCircle className="h-3.5 w-3.5" /> },
  sent: { label: '已发送', color: 'bg-blue-100 text-blue-700', icon: <Send className="h-3.5 w-3.5" /> },
};

function formatMoney(n: number): string {
  return `¥${Number(n).toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

export default function QuoteDetailPage() {
  const params = useParams();
  const router = useRouter();
  const quoteId = params.id;

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const loadQuote = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}`);
      const data = await res.json();
      if (data.success) setQuote(data.data);
      else { toast.error('报价单不存在'); router.push('/admin/quotes'); }
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (quoteId) loadQuote(); }, [quoteId]);

  const updateStatus = async (status: string) => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      const data = await res.json();
      if (data.success) { toast.success('状态已更新'); loadQuote(); }
      else toast.error(data.error || '更新失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  const handleDelete = async () => {
    setSaving(true);
    try {
      const res = await fetch(`/api/admin/quotes/${quoteId}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast.success('报价单已删除'); router.push('/admin/quotes'); }
      else toast.error(data.error || '删除失败');
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载报价单...</span>
      </div>
    );
  }

  if (!quote) return null;

  const st = STATUS_MAP[quote.status] || STATUS_MAP.draft;
  const products = quote.products || [];

  return (
    <div className="space-y-6">
      {/* 标题栏 */}
      <div className="flex items-center justify-between flex-wrap gap-3">
        <div className="flex items-center gap-3">
          <Button variant="ghost" size="icon" onClick={() => router.back()}>
            <ArrowLeft className="h-4 w-4" />
          </Button>
          <div>
            <div className="flex items-center gap-2">
              <h1 className="text-2xl font-bold">{quote.quoteNumber || '报价单'}</h1>
              <Badge className={`${st.color} flex items-center gap-1`}>{st.icon}{st.label}</Badge>
            </div>
            <p className="text-gray-500 text-sm">版本 v{quote.version || 1} · 创建者：{quote.creatorName || quote.creatorEmail || '-'}</p>
          </div>
        </div>
        <div className="flex gap-2 flex-wrap">
          {quote.status === 'draft' && (
            <Button variant="outline" size="sm" onClick={() => updateStatus('pending_review')} disabled={saving}>
              <Send className="h-4 w-4 mr-2" />提交审核
            </Button>
          )}
          {quote.status === 'pending_review' && (
            <>
              <Button size="sm" onClick={() => updateStatus('approved')} disabled={saving}>
                <CheckCircle className="h-4 w-4 mr-2" />批准
              </Button>
              <Button variant="outline" size="sm" className="text-red-600" onClick={() => updateStatus('rejected')} disabled={saving}>
                <XCircle className="h-4 w-4 mr-2" />拒绝
              </Button>
            </>
          )}
          {quote.status === 'approved' && (
            <Button variant="outline" size="sm" onClick={() => updateStatus('sent')} disabled={saving}>
              <Send className="h-4 w-4 mr-2" />标记已发送
            </Button>
          )}
          <Button variant="outline" size="sm" className="text-red-600" onClick={() => setDeleteOpen(true)}>
            <Trash2 className="h-4 w-4 mr-2" />删除
          </Button>
        </div>
      </div>

      <div className="grid gap-6 md:grid-cols-3">
        {/* 客户信息 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">客户信息</CardTitle>
          </CardHeader>
          <CardContent>
            {quote.customerInfo && Object.keys(quote.customerInfo).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(quote.customerInfo).map(([key, val]) => (
                  <div key={key} className="flex justify-between text-sm">
                    <span className="text-gray-500">{key}</span>
                    <span className="font-medium">{String(val) || '-'}</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-sm text-muted-foreground">未填写客户信息</p>
            )}
          </CardContent>
        </Card>

        {/* 时间信息 */}
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
              <span className="text-gray-500 w-20">创建时间</span>
              <span>{quote.createdAt ? new Date(quote.createdAt).toLocaleString('zh-CN') : '-'}</span>
            </div>
            <div className="flex items-center gap-2 text-sm">
              <Clock className="h-4 w-4 text-gray-400" />
              <span className="text-gray-500 w-20">更新时间</span>
              <span>{quote.updatedAt ? new Date(quote.updatedAt).toLocaleString('zh-CN') : '-'}</span>
            </div>
          </CardContent>
        </Card>

        {/* 商务条款 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">商务条款</CardTitle>
          </CardHeader>
          <CardContent>
            {quote.terms && Object.keys(quote.terms).length > 0 ? (
              <div className="space-y-2">
                {Object.entries(quote.terms).map(([key, val]) => (
                  <div key={key} className="text-sm">
                    <span className="text-gray-500">{key}：</span>
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

      {/* 产品行项目 */}
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

      {/* 金额汇总 */}
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

      {/* 删除对话框 */}
      <Dialog open={deleteOpen} onOpenChange={(o) => !saving && setDeleteOpen(o)}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除报价单「{quote.quoteNumber}」吗？此操作不可撤销。</DialogDescription>
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
