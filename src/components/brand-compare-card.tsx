'use client';

import { useState, useMemo } from 'react';
import { Badge } from '@/components/ui/badge';
import { Card, CardHeader, CardContent } from '@/components/ui/card';
import { ChevronDown, ChevronUp, Factory, Tag, Shield, Eye, EyeOff } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';

export interface BrandCompareItem {
  brand: string;
  productName?: string;
  supplier?: string;
  contactPhone?: string;
  model: string;
  price: number;
  minPrice?: number;
  guidePrice?: number;
  costPrice?: number;
  confidence: number;
  rating: number;
  quoteCount: number;
  responseTime?: number;
  tags: string[];
  isRecommended: boolean;
  source: string;
  parameterDescription?: string;
  /** 与用户需求不一致的参数列表 */
  paramDiffs?: string[];
  /** 是否为回退模式（无严格匹配时展示的相近产品） */
  isFallback?: boolean;
}

interface BrandCompareCardProps {
  items: BrandCompareItem[];
  onBrandSelect?: (item: BrandCompareItem) => void;
}

/**
 * 解析参数描述，提取结构化参数
 * 通用解析：支持 "功率：5.5KW"、"工作压力 0.8 Mpa"、"永磁变频" 等格式
 */
function parseParams(desc: string): { key: string; value: string }[] {
  if (!desc) return [];
  const params: { key: string; value: string }[] = [];
  const kvRegex = /([^，,、]+?)[：:]\s*([^，,、]+?)(?=[，,、]|$)/g;
  let match;
  while ((match = kvRegex.exec(desc)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (key && value) {
      params.push({ key, value });
    }
  }
  if (params.length === 0) {
    const parts = desc.split(/[，,、]/).map(s => s.trim()).filter(Boolean);
    parts.forEach(part => {
      if (part && !part.match(/^\d+(\.\d+)?$/)) {
        params.push({ key: '', value: part });
      }
    });
  }
  return params;
}

/** 从多个产品中找出差异化的参数 key */
function findDifferentiatingKeys(items: BrandCompareItem[]): Set<string> {
  const keyValues = new Map<string, Set<string>>();
  for (const item of items) {
    const params = parseParams(item.parameterDescription || '');
    for (const p of params) {
      if (p.key) {
        if (!keyValues.has(p.key)) keyValues.set(p.key, new Set());
        keyValues.get(p.key)!.add(p.value);
      }
    }
  }
  const diffKeys = new Set<string>();
  for (const [key, values] of keyValues) {
    if (values.size > 1) diffKeys.add(key);
  }
  if (diffKeys.size === 0) {
    for (const key of keyValues.keys()) diffKeys.add(key);
  }
  return diffKeys;
}

/** 脱敏处理：手机号中间4位替换为**** */
function maskPhone(phone: string): string {
  if (!phone || phone.length < 7) return phone;
  return phone.slice(0, 3) + '****' + phone.slice(-4);
}

export function BrandCompareCard({ items, onBrandSelect }: BrandCompareCardProps) {
  if (!items || items.length === 0) return null;

  return (
    <div className="space-y-3">
      <div className="flex items-center gap-2 text-sm font-medium text-muted-foreground">
        <span>
          {new Set(items.map(i => i.brand)).size > 1 ? '多品牌产品对比' : '产品对比'}
        </span>
        <span className="text-xs">（共 {items.length} 款产品，点击卡片查看详情）</span>
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-3">
        {items.map((item, index) => (
          <ProductCard
            key={`${item.brand}-${item.model}-${index}`}
            item={item}
            diffKeys={findDifferentiatingKeys(items)}
            hasPriceDiff={new Set(items.map(i => i.price).filter(p => p > 0)).size > 1}
            isRecommended={index === 0}
            onSelect={() => onBrandSelect?.(item)}
          />
        ))}
      </div>
    </div>
  );
}

/** 单个产品卡片 */
function ProductCard({
  item,
  diffKeys,
  hasPriceDiff,
  isRecommended,
  onSelect,
}: {
  item: BrandCompareItem;
  diffKeys: Set<string>;
  hasPriceDiff: boolean;
  isRecommended: boolean;
  onSelect: () => void;
}) {
  const [expanded, setExpanded] = useState(false);
  const { user } = useUser();

  // 用户权限
  const canViewMinPrice = user?.levelConfig?.can_view_min_price ?? false;
  const canViewCostPrice = user?.levelConfig?.can_view_cost_price ?? false;
  const canViewManufacturer = user?.levelConfig?.can_view_manufacturer ?? false;
  const canViewContact = user?.levelConfig?.can_view_contact ?? false;
  const canViewPhone = user?.levelConfig?.can_view_phone ?? false;
  const isPrivileged = user?.level && user.level >= 3; // VIP及以上

  // 解析参数
  const params = useMemo(() => parseParams(item.parameterDescription || ''), [item.parameterDescription]);
  const diffParams = params.filter(p => p.key && diffKeys.has(p.key));
  const otherParams = params.filter(p => p.key && !diffKeys.has(p.key));
  const labelParams = params.filter(p => !p.key && p.value);

  // 利润率计算
  const margin = (item.costPrice && item.price > 0)
    ? ((item.price - item.costPrice) / item.price * 100).toFixed(1)
    : null;

  return (
    <Card
      className={`transition-shadow hover:shadow-md cursor-pointer ${
        isRecommended
          ? 'border-blue-500 ring-1 ring-blue-200 bg-blue-50/20'
          : ''
      }`}
      onClick={() => setExpanded(!expanded)}
    >
      <CardHeader className="pb-2">
        <div className="flex justify-between items-start gap-2">
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              <h3 className="font-semibold text-sm truncate">{item.brand}</h3>
              {isRecommended && (
                <Badge variant="default" className="text-xs shrink-0">推荐</Badge>
              )}
            </div>
            {item.productName && item.productName !== item.brand && (
              <p className="text-xs text-muted-foreground mt-0.5 truncate" title={item.productName}>{item.productName}</p>
            )}
            {item.model && item.model !== '-' && (
              <p className="text-xs text-muted-foreground mt-0.5">型号: {item.model}</p>
            )}
          </div>
          <div className="text-right shrink-0">
            <div className={`text-lg font-bold ${hasPriceDiff ? 'text-red-600' : 'text-foreground'}`}>
              ¥{item.price.toLocaleString()}
            </div>
            {canViewMinPrice && item.minPrice != null && item.minPrice > 0 && (
              <div className="text-xs text-orange-600">
                底价 ¥{item.minPrice.toLocaleString()}
              </div>
            )}
          </div>
        </div>

        {/* 与用户需求的差异标注（仅回退模式：无严格匹配时） */}
        {item.isFallback && item.paramDiffs && item.paramDiffs.length > 0 && (
          <div className="mt-2 p-1.5 bg-amber-50 border border-amber-200 rounded text-xs">
            <span className="text-amber-700 font-medium">与需求差异：</span>
            {item.paramDiffs.map((diff, i) => (
              <span key={i} className="text-amber-600 ml-1">{diff}</span>
            ))}
          </div>
        )}

        {/* 差异化参数 - 紧凑展示 */}
        {diffParams.length > 0 && (
          <div className="flex flex-wrap gap-x-4 gap-y-0.5 mt-2 text-xs">
            {diffParams.map((p, i) => (
              <span key={i}>
                <span className="text-muted-foreground">{p.key}:</span>{' '}
                <span className="font-medium">{p.value}</span>
              </span>
            ))}
          </div>
        )}

        {/* 标签参数 */}
        {labelParams.length > 0 && (
          <div className="flex flex-wrap gap-1 mt-2">
            {labelParams.map((p, i) => (
              <Badge key={i} variant="outline" className="text-xs gap-0.5">
                <Tag className="h-2.5 w-2.5" />
                {p.value}
              </Badge>
            ))}
          </div>
        )}
      </CardHeader>

      <CardContent className="pt-0">
        {/* 展开/折叠按钮 */}
        <div
          className="flex items-center gap-1 text-xs text-muted-foreground mt-1 hover:text-foreground transition-colors"
          onClick={(e) => { e.stopPropagation(); setExpanded(!expanded); }}
        >
          {expanded ? <ChevronUp className="h-3 w-3" /> : <ChevronDown className="h-3 w-3" />}
          {expanded ? '收起详情' : '展开详情'}
        </div>

        {/* 展开的详情区域 */}
        {expanded && (
          <div className="mt-3 pt-3 border-t space-y-3">
            {/* 价格信息 */}
            <div className="space-y-1.5">
              <div className="text-xs font-medium text-muted-foreground mb-1">价格信息</div>
              <div className="grid grid-cols-2 gap-1.5 text-xs">
                <div className="flex justify-between">
                  <span className="text-muted-foreground">参考价</span>
                  <span className="font-semibold text-red-600">¥{item.price.toLocaleString()}</span>
                </div>
                {canViewMinPrice && item.minPrice != null && item.minPrice > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">最低售价</span>
                    <span className="font-medium text-orange-600">¥{item.minPrice.toLocaleString()}</span>
                  </div>
                )}
                {canViewCostPrice && item.costPrice != null && item.costPrice > 0 && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">成本价</span>
                    <span className="font-medium">¥{item.costPrice.toLocaleString()}</span>
                  </div>
                )}
                {canViewCostPrice && margin && (
                  <div className="flex justify-between">
                    <span className="text-muted-foreground">利润率</span>
                    <span className="font-medium text-green-600">{margin}%</span>
                  </div>
                )}
                {!canViewMinPrice && (
                  <div className="col-span-2 text-xs text-muted-foreground flex items-center gap-1">
                    <EyeOff className="h-3 w-3" />
                    <span>升级会员可查看底价等更多价格信息</span>
                  </div>
                )}
              </div>
            </div>

            {/* 技术参数 */}
            {params.length > 0 && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground mb-1">技术参数</div>
                <div className="space-y-0.5 text-xs">
                  {params.map((p, i) => (
                    <div key={i} className="flex justify-between">
                      <span className="text-muted-foreground">{p.key || '特性'}</span>
                      <span className="font-medium">{p.value}</span>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* 供应商信息（权限控制） */}
            {isPrivileged && (item.supplier || item.contactPhone) && (
              <div className="space-y-1">
                <div className="text-xs font-medium text-muted-foreground mb-1 flex items-center gap-1">
                  <Shield className="h-3 w-3" />
                  供应商信息
                  {!canViewPhone && <span className="opacity-60">（部分脱敏）</span>}
                </div>
                <div className="space-y-0.5 text-xs">
                  {canViewManufacturer && item.supplier && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">供应商</span>
                      <span className="font-medium">{item.supplier}</span>
                    </div>
                  )}
                  {item.contactPhone && (
                    <div className="flex justify-between">
                      <span className="text-muted-foreground">联系电话</span>
                      <span className="font-medium flex items-center gap-1">
                        {canViewPhone ? (
                          <><Eye className="h-2.5 w-2.5" />{item.contactPhone}</>
                        ) : (
                          <><EyeOff className="h-2.5 w-2.5" />{maskPhone(item.contactPhone)}</>
                        )}
                      </span>
                    </div>
                  )}
                  {!canViewManufacturer && !item.contactPhone && (
                    <div className="text-xs text-muted-foreground flex items-center gap-1">
                      <EyeOff className="h-3 w-3" />
                      <span>升级会员可查看供应商信息</span>
                    </div>
                  )}
                </div>
              </div>
            )}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
