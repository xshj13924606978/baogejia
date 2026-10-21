'use client';

import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ExternalLink, Receipt, Loader2 } from 'lucide-react';
import { useRouter } from 'next/navigation';
import type { CustomerQuote } from './types';

interface CustomerQuotesProps {
  quotes: CustomerQuote[];
  loading?: boolean;
  /** 查看报价详情回调（默认跳转 /admin/quotes/:id） */
  onViewQuote?: (quote: CustomerQuote) => void;
}

const statusStyles: Record<string, string> = {
  draft: 'bg-gray-100 text-gray-700',
  sent: 'bg-blue-100 text-blue-700',
  accepted: 'bg-green-100 text-green-700',
  confirmed: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  expired: 'bg-amber-100 text-amber-700',
  cancelled: 'bg-gray-100 text-gray-500',
};

const statusLabels: Record<string, string> = {
  draft: '草稿',
  sent: '已发送',
  accepted: '已接受',
  confirmed: '已确认',
  rejected: '已拒绝',
  expired: '已过期',
  cancelled: '已取消',
};

function formatAmount(v: number | string | undefined) {
  if (v === undefined || v === null || v === '') return '—';
  const n = Number(v);
  if (Number.isNaN(n)) return String(v);
  return n.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

export function CustomerQuotes({ quotes, loading, onViewQuote }: CustomerQuotesProps) {
  const router = useRouter();

  const handleView = (q: CustomerQuote) => {
    if (onViewQuote) onViewQuote(q);
    else router.push(`/admin/quotes/${q.id}`);
  };

  return (
    <div className="rounded-lg border bg-card">
      <div className="border-b px-5 py-4">
        <h3 className="flex items-center gap-2 text-base font-semibold">
          <Receipt className="h-4 w-4 text-muted-foreground" />
          报价记录（{quotes.length}）
        </h3>
      </div>
      <div className="overflow-x-auto">
        <Table>
          <TableHeader>
            <TableRow>
              <TableHead>报价编号</TableHead>
              <TableHead>客户信息</TableHead>
              <TableHead>金额</TableHead>
              <TableHead>状态</TableHead>
              <TableHead>创建时间</TableHead>
              <TableHead className="text-right">操作</TableHead>
            </TableRow>
          </TableHeader>
          <TableBody>
            {loading ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center">
                  <Loader2 className="mx-auto h-5 w-5 animate-spin text-muted-foreground" />
                </TableCell>
              </TableRow>
            ) : quotes.length === 0 ? (
              <TableRow>
                <TableCell colSpan={6} className="h-24 text-center text-muted-foreground">
                  暂无关联报价记录
                </TableCell>
              </TableRow>
            ) : (
              quotes.map((q) => {
                const st = q.status || 'draft';
                const customerName =
                  q.customer_info?.name || q.customer_info?.customer_name || '—';
                return (
                  <TableRow key={q.id}>
                    <TableCell className="font-medium">
                      {q.quote_number || q.id.slice(0, 8)}
                    </TableCell>
                    <TableCell>
                      {customerName}
                      {q.customer_info?.contactPerson ? (
                        <div className="text-xs text-muted-foreground">
                          {q.customer_info.contactPerson}
                        </div>
                      ) : null}
                    </TableCell>
                    <TableCell>¥ {formatAmount(q.total_amount)}</TableCell>
                    <TableCell>
                      <Badge
                        variant="outline"
                        className={statusStyles[st] || 'bg-gray-100 text-gray-700'}
                      >
                        {statusLabels[st] || st}
                      </Badge>
                    </TableCell>
                    <TableCell className="whitespace-nowrap text-muted-foreground">
                      {q.created_at
                        ? new Date(q.created_at).toLocaleString('zh-CN', { dateStyle: 'short' })
                        : '—'}
                    </TableCell>
                    <TableCell className="text-right">
                      <Button variant="ghost" size="sm" onClick={() => handleView(q)}>
                        <ExternalLink className="h-4 w-4" />
                        <span className="sr-only">查看报价</span>
                      </Button>
                    </TableCell>
                  </TableRow>
                );
              })
            )}
          </TableBody>
        </Table>
      </div>
    </div>
  );
}
