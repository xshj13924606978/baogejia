'use client';

import React, { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { FileText, Loader2, Send, PlusCircle, Clock, CheckCircle, XCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';

interface QuoteItem {
  id: string;
  quoteNumber: string;
  status: string;
  totalAmount: number;
  productCount: number;
  customerName: string;
  createdAt: string;
}

const STATUS_MAP: Record<string, { label: string; color: string; icon: React.ReactNode }> = {
  draft: { label: '草稿', color: 'bg-gray-100 text-gray-700', icon: <Clock className="h-3 w-3" /> },
  sent: { label: '已发送', color: 'bg-blue-100 text-blue-700', icon: <Send className="h-3 w-3" /> },
  approved: { label: '已接受', color: 'bg-green-100 text-green-700', icon: <CheckCircle className="h-3 w-3" /> },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-700', icon: <XCircle className="h-3 w-3" /> },
  expired: { label: '已过期', color: 'bg-yellow-100 text-yellow-700', icon: <Clock className="h-3 w-3" /> },
};

export default function QuotesPanel({ user }: { user: any }) {
  const router = useRouter();
  const [quotes, setQuotes] = useState<QuoteItem[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const load = async () => {
      setLoading(true);
      try {
        const res = await fetch('/api/quotes?limit=5');
        const data = await res.json();
        if (data.success) setQuotes(data.data || []);
      } catch (err) {
        console.error('加载报价单失败:', err);
      } finally {
        setLoading(false);
      }
    };
    if (user?.id) load();
  }, [user?.id]);

  return (
    <div className="space-y-3">
      <div className="flex items-center justify-between">
        <h3 className="text-sm font-semibold text-gray-700">📄 我的报价单</h3>
        <Button
          variant="ghost"
          size="sm"
          className="h-7 px-2 text-xs text-blue-600"
          onClick={() => {
            window.location.href = '/quotes';
          }}
        >
          查看全部
        </Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-6 text-gray-400">
          <Loader2 className="h-5 w-5 animate-spin" />
        </div>
      ) : quotes.length === 0 ? (
        <div className="text-center py-6">
          <FileText className="h-8 w-8 text-gray-300 mx-auto mb-2" />
          <p className="text-xs text-gray-400 mb-3">暂无报价单</p>
          <Button
            size="sm"
            className="h-7 text-xs"
            onClick={() => {
              window.location.href = '/';
            }}
          >
            <PlusCircle className="h-3.5 w-3.5 mr-1" />
            新建报价
          </Button>
        </div>
      ) : (
        <div className="space-y-2">
          {quotes.map((q) => {
            const st = STATUS_MAP[q.status] || STATUS_MAP.draft;
            return (
              <button
                key={q.id}
                onClick={() => {
                  window.location.href = `/quotes/${q.id}`;
                }}
                className="w-full text-left p-2.5 rounded-lg border border-gray-200 hover:bg-gray-50 transition-colors"
              >
                <div className="flex items-center justify-between mb-1">
                  <span className="text-xs font-medium text-blue-600 truncate">
                    {q.quoteNumber}
                  </span>
                  <Badge variant="outline" className={`${st.color} gap-0.5 border-transparent px-1.5 py-0 text-[10px]`}>
                    {st.icon}
                    {st.label}
                  </Badge>
                </div>
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-gray-500 truncate">
                    {q.customerName || '未命名客户'} · {q.productCount} 项
                  </span>
                  <span className="text-xs font-semibold text-gray-800">
                    ¥{Number(q.totalAmount).toLocaleString(undefined, { minimumFractionDigits: 2 })}
                  </span>
                </div>
                <div className="mt-1 text-[10px] text-gray-400">
                  {q.createdAt ? new Date(q.createdAt).toLocaleDateString('zh-CN') : ''}
                </div>
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
