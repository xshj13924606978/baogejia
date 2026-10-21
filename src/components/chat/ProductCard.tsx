'use client';

/**
 * 产品询价卡片（#[20260827-1030]-2-UI 最终版）
 * 展示产品价格 + 数据来源标注（产品价格库/定额库/联网搜索/规则估算）
 */

import { Badge } from '@/components/ui/badge';
import type { ProductCardItem } from '@/lib/intent-recognizer';

/** 数据来源标签样式 */
const SOURCE_STYLES: Record<string, string> = {
  产品价格库: 'bg-emerald-100 text-emerald-700 border-emerald-200',
  定额库: 'bg-blue-100 text-blue-700 border-blue-200',
  联网搜索: 'bg-violet-100 text-violet-700 border-violet-200',
  规则估算: 'bg-amber-100 text-amber-700 border-amber-200',
  产品知识库: 'bg-emerald-100 text-emerald-700 border-emerald-200',
};

/** 置信度标签样式 */
const CONFIDENCE_STYLES: Record<string, string> = {
  极高: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  高: 'bg-emerald-50 text-emerald-600 border-emerald-100',
  中: 'bg-amber-50 text-amber-600 border-amber-100',
  低: 'bg-orange-50 text-orange-600 border-orange-100',
  估算: 'bg-red-50 text-red-500 border-red-100',
};

interface ProductCardProps {
  products: ProductCardItem[];
}

export function ProductCard({ products }: ProductCardProps) {
  const primary = products[0];
  if (!primary) return null;

  return (
    <div className="overflow-hidden rounded-xl border border-blue-100 bg-white shadow-sm">
      <div className="flex items-center justify-between bg-blue-50/70 px-4 py-2.5">
        <span className="flex items-center gap-1.5 text-sm font-semibold text-blue-800">
          <span aria-hidden>📦</span>
          {primary.productName}
        </span>
        <span className="text-xs text-blue-600">产品询价</span>
      </div>

      <div className="space-y-3 p-4">
        {products.map((item, index) => (
          <div key={index} className="flex items-start justify-between gap-3">
            <div className="min-w-0 flex-1">
              <div className="text-sm font-medium text-gray-800">
                {item.productName}
                {item.model ? `（${item.model}）` : ''}
              </div>
              {item.brand && <div className="mt-0.5 text-xs text-gray-500">品牌：{item.brand}</div>}
              {item.parameterDescription && (
                <div className="mt-0.5 line-clamp-2 text-xs text-gray-500">{item.parameterDescription}</div>
              )}
              {item.matchedBy && <div className="mt-0.5 text-xs text-gray-400">匹配方式：{item.matchedBy}</div>}
            </div>
            <div className="flex-shrink-0 text-right">
              <div className="text-lg font-bold text-blue-600">
                ¥{item.price.toLocaleString('zh-CN', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}
              </div>
              <div className="text-xs text-gray-400">单价（{item.unit || '元'}）</div>
            </div>
          </div>
        ))}

        {/* 数据来源标注 */}
        <div className="flex flex-wrap items-center gap-2 border-t border-gray-100 pt-2.5 text-xs">
          <span className="text-gray-500">数据来源：</span>
          <Badge
            variant="outline"
            className={SOURCE_STYLES[primary.source] || 'bg-gray-50 text-gray-600 border-gray-200'}
          >
            {primary.source}
          </Badge>
          {primary.confidence && (
            <Badge
              variant="outline"
              className={CONFIDENCE_STYLES[primary.confidence] || 'bg-gray-50 text-gray-500 border-gray-200'}
            >
              置信度 {primary.confidence}
            </Badge>
          )}
          {primary.sourceDetail && <span className="text-gray-400">{primary.sourceDetail}</span>}
        </div>
      </div>
    </div>
  );
}
