'use client';

/**
 * 批量报价卡片（#[20260827-1030]-2-UI 最终版）
 * 多产品报价单表格 + 逐项数据来源标注
 */

import { Badge } from '@/components/ui/badge';
import type { ProductCardItem } from '@/lib/intent-recognizer';

const SOURCE_STYLES: Record<string, string> = {
  产品价格库: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  定额库: 'bg-blue-100 text-blue-700 border-blue-200',
  联网搜索: 'bg-violet-100 text-violet-700 border-violet-200',
  规则估算: 'bg-amber-100 text-amber-700 border-amber-200',
  产品知识库: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

interface QuoteCardProps {
  items: ProductCardItem[];
}

export function QuoteCard({ items }: QuoteCardProps) {
  if (!items || items.length === 0) return null;

  const total = items.reduce((sum, it) => sum + it.price, 0);

  return (
    <div className="overflow-hidden rounded-xl border border-indigo-100 bg-white shadow-sm">
      <div className="flex items-center justify-between bg-indigo-50/70 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-indigo-800">
          <span aria-hidden>📋</span>
          批量报价（{items.length} 项）
        </span>
        <span className="text-xs text-indigo-600">合计 ¥{total.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}</span>
      </div>

      <div className="overflow-x-auto">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50/60 text-left text-xs text-gray-500">
              <th className="px-4 py-2 font-medium">产品</th>
              <th className="px-2 py-2 font-medium">型号</th>
              <th className="px-2 py-2 font-medium">品牌</th>
              <th className="px-2 py-2 text-right font-medium">单价（元）</th>
              <th className="px-4 py-2 text-right font-medium">数据来源</th>
            </tr>
          </thead>
          <tbody>
            {items.map((item, index) => (
              <tr key={index} className="border-b border-gray-50 last:border-0">
                <td className="px-4 py-2 font-medium text-gray-800">{item.productName}</td>
                <td className="px-2 py-2 text-gray-600">{item.model || '—'}</td>
                <td className="px-2 py-2 text-gray-600">{item.brand || '—'}</td>
                <td className="px-2 py-2 text-right font-semibold text-blue-600">
                  ¥{item.price.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
                </td>
                <td className="px-4 py-2 text-right">
                  <Badge
                    variant="outline"
                    className={SOURCE_STYLES[item.source] || 'bg-gray-50 text-gray-600 border-gray-200'}
                  >
                    {item.source}
                  </Badge>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      <div className="border-t border-gray-100 px-4 py-2 text-xs text-gray-400">
        注：价格均来自真实数据查询（产品价格库 → 定额库 → 联网搜索 → 规则估算），估算价请核实后使用
      </div>
    </div>
  );
}
