'use client';

import React, { useState, useEffect, Suspense } from 'react';
import { useParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  Loader2, Calendar, Clock, FileText, CheckCircle, XCircle, Send,
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

function fieldLabel(map: Record<string, string>, key: string): string {
  return map[key] || key;
}

export default function ShareQuotePage() {
  return (
    <Suspense fallback={
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
      </div>
    }>
      <ShareQuoteContent />
    </Suspense>
  );
}

function ShareQuoteContent() {
  const params = useParams();
  const quoteId = params.id as string;

  const [quote, setQuote] = useState<QuoteData | null>(null);
  const [loading, setLoading] = useState(true);
  const [notFound, setNotFound] = useState(false);

  useEffect(() => {
    if (!quoteId) return;
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch(`/api/quotes/share/${quoteId}`);
        const data = await res.json();
        if (data.success) {
          setQuote(data.data);
        } else {
          setNotFound(true);
          toast.error(data.error || '报价单不存在');
        }
      } catch {
        setNotFound(true);
        toast.error('网络错误');
      } finally {
        setLoading(false);
      }
    };
    load();
  }, [quoteId]);

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

  if (notFound || !quote) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="text-center space-y-4">
          <p className="text-2xl font-semibold text-gray-700">报价单不存在或已删除</p>
          <p className="text-sm text-gray-500">请确认分享链接是否正确</p>
        </div>
      </div>
    );
  }

  const st = STATUS_MAP[quote.status] || STATUS_MAP.draft;
  const products = quote.products || [];
  const supplierName = typeof quote.supplierInfo === 'object' && quote.supplierInfo
    ? (quote.supplierInfo.name || quote.supplierInfo.company_name || '')
    : '';

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="max-w-5xl mx-auto px-4 py-8">
        {/* 头部 */}
        <div className="flex items-center justify-between flex-wrap gap-3 mb-6">
          <div className="flex items-center gap-3">
            <h1 className="text-xl font-semibold">{quote.quoteNumber || '报价单'}</h1>
            <Badge variant="outline" className={`${st.color} gap-1 border-transparent`}>
              {st.icon}{st.label}
            </Badge>
          </div>
          {supplierName && (
            <p className="text-sm text-gray-500">{supplierName} 出品</p>
          )}
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
                      <span className="text-gray-500">{fieldLabel(CUSTOMER_FIELD_MAP, key)}</span>
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
                      <span className="text-gray-500">{fieldLabel(TERMS_FIELD_MAP, key)}：</span>
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

        {/* 产品明细 */}
        <Card className="mt-6">
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
        <Card className="mt-6">
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

        <p className="text-center text-xs text-gray-400 mt-6">本报价单由系统生成，最终解释权归出品方所有</p>
      </div>
    </div>
  );
}
