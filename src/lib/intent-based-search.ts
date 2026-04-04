/**
 * 基于意图的 Supabase 产品搜索
 *
 * 将 IntentUnderstanding 的结构化 Intent 转化为 Supabase 多条件查询，
 * 支持产品类型/参数/品牌/预算/属性过滤，无向量搜索依赖。
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { Intent } from './intent-understanding';
import type { IntentProduct } from './intent-understanding';

// ═══════════════════════ 接口 ═══════════════════════

export interface IntentSearchResult {
  products: IntentProduct[];
  searchStrategy: string;
  confidence: number;
  totalScanned: number;
}

// ═══════════════════════ 属性映射 ═══════════════════════

// 模糊属性 → 数据库查询条件的映射
const ATTRIBUTE_FILTERS: Record<string, {
  ilikeField?: string;
  ilikePattern?: string;
  orderField?: string;
  orderDir?: 'asc' | 'desc';
  lteField?: string;
  gteField?: string;
}> = {
  '便宜': { orderField: 'min_price', orderDir: 'asc' },
  '经济': { orderField: 'min_price', orderDir: 'asc' },
  '实惠': { orderField: 'min_price', orderDir: 'asc' },
  '预算有限': { orderField: 'min_price', orderDir: 'asc' },
  '高端': { orderField: 'price', orderDir: 'desc' },
  '节能': { ilikeField: 'parameter_description', ilikePattern: '%变频%' },
  '省电': { ilikeField: 'parameter_description', ilikePattern: '%变频%' },
  '高效': { ilikeField: 'parameter_description', ilikePattern: '%变频%' },
  '进口': { orderField: 'price', orderDir: 'desc' },
  '大功率': { ilikeField: 'parameter_description', ilikePattern: '%功率%' },
  '静音': { ilikeField: 'parameter_description', ilikePattern: '%变频%' },
  '小型': { ilikeField: 'parameter_description', ilikePattern: '%小型%' },
  '稳定': { ilikeField: 'parameter_description', ilikePattern: '%工频%' },
};

// 参数字段 → parameter_description 中的中文标签
const SPEC_FIELD_MAP: Record<string, string> = {
  flowRate: '排气量',
  pressure: '工作压力',
  power: '功率',
  voltage: '电压',
  controlType: '',
  volume: '',
};

// ═══════════════════════ 工具函数 ═══════════════════════

function extractPrice(price: any): number {
  if (price == null || price === '') return 0;
  if (typeof price === 'number') return price > 0 ? price : 0;
  const str = String(price).trim();
  if (!str || str.startsWith('{')) return 0;
  const num = parseFloat(str);
  return !isNaN(num) && num > 0 ? num : 0;
}

function toIntentProduct(p: any): IntentProduct {
  return {
    name: p.name || '',
    model: p.model || '',
    price: extractPrice(p.price),
    brand: p.brand || '',
    parameterDescription: p.parameter_description || '',
    minPrice: extractPrice(p.min_price),
    costPrice: extractPrice(p.cost_price),
    source: 'database',
  };
}

// ═══════════════════════ 搜索类 ═══════════════════════

export class IntentBasedSearch {
  private static instance: IntentBasedSearch;

  static getInstance(): IntentBasedSearch {
    if (!IntentBasedSearch.instance) {
      IntentBasedSearch.instance = new IntentBasedSearch();
    }
    return IntentBasedSearch.instance;
  }

  /**
   * 根据意图搜索产品
   */
  async search(intent: Intent): Promise<IntentSearchResult> {
    const supabase = getSupabaseClient();
    const { productType, brand, specs, budget, attributes } = intent.entities;

    if (!productType) {
      return { products: [], searchStrategy: '无产品类型', confidence: 0, totalScanned: 0 };
    }

    console.log('[IntentBasedSearch] 开始搜索:', { productType, brand, specs, budget, attributes });

    let query = supabase
      .from('products')
      .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category');

    const strategies: string[] = [];

    // 1. 产品类型过滤
    query = query.ilike('name', `%${productType}%`);
    strategies.push(`产品类型=${productType}`);

    // 2. 品牌过滤
    if (brand) {
      query = query.ilike('brand', `%${brand}%`);
      strategies.push(`品牌=${brand}`);
    }

    // 3. 参数过滤（从 parameter_description 中匹配）
    if (specs) {
      for (const [key, value] of Object.entries(specs)) {
        if (!value) continue;
        if (key === 'volume') {
          // 容量产品（化粪池等），在 model 字段匹配
          const volValue = String(value).replace(/[^0-9.]/g, '');
          if (volValue) {
            query = query.or(`model.ilike.%${volValue}%`);
            strategies.push(`容量≈${value}`);
          }
        } else if (key === 'controlType') {
          query = query.ilike('parameter_description', `%${value}%`);
          strategies.push(`控制方式=${value}`);
        } else if (SPEC_FIELD_MAP[key]) {
          const label = SPEC_FIELD_MAP[key];
          const numValue = String(value).replace(/[^0-9.]/g, '');
          if (label && numValue) {
            query = query.ilike('parameter_description', `%${label}%`);
            strategies.push(`${label}≈${value}`);
          }
        }
      }
    }

    // 4. 预算过滤
    if (budget) {
      if (budget.max) {
        query = query.lte('price', budget.max);
        strategies.push(`预算≤${budget.max}`);
      }
      if (budget.min) {
        query = query.gte('price', budget.min);
        strategies.push(`预算≥${budget.min}`);
      }
    }

    // 5. 属性过滤
    let orderField: string | null = null;
    let orderDir: 'asc' | 'desc' = 'asc';
    if (attributes && attributes.length > 0) {
      for (const attr of attributes) {
        const filter = ATTRIBUTE_FILTERS[attr];
        if (!filter) continue;
        if (filter.ilikeField && filter.ilikePattern) {
          query = query.ilike(filter.ilikeField, filter.ilikePattern);
          strategies.push(`属性=${attr}`);
        }
        if (filter.orderField) {
          orderField = filter.orderField;
          orderDir = filter.orderDir || 'asc';
        }
      }
    }

    query = query.limit(20);

    const { data: products, error } = await query;

    if (error) {
      console.error('[IntentBasedSearch] Supabase 查询失败:', error);
      return { products: [], searchStrategy: strategies.join('+'), confidence: 0, totalScanned: 0 };
    }

    let results = (products || []).map(toIntentProduct);

    // 6. 参数精确过滤（从 parameter_description 提取数值，±20% 容差）
    if (specs && results.length > 0) {
      results = this.filterBySpecs(results, specs);
    }

    // 7. 排序
    if (orderField) {
      results.sort((a, b) => {
        const aVal = a.minPrice || a.price;
        const bVal = b.minPrice || b.price;
        return orderDir === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    // 8. 去重 + 限制数量
    const seen = new Set<string>();
    const unique = results.filter(p => {
      const key = `${p.name}|${p.model}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    }).slice(0, 10);

    const confidence = unique.length > 0
      ? (productType && brand ? 0.95 : productType ? 0.85 : 0.7)
      : 0;

    console.log(`[IntentBasedSearch] 找到 ${unique.length} 个产品, 策略: ${strategies.join('+')}`);
    // 打印每个产品的关键参数，便于排查数据正确性
    unique.forEach((p, i) => {
      console.log(`[IntentBasedSearch]   #${i + 1} ${p.name} | ${p.model} | 价格=${p.price} | 最低价=${p.minPrice} | 参数=${p.parameterDescription?.substring(0, 80)}`);
    });
    return {
      products: unique,
      searchStrategy: strategies.join('+'),
      confidence,
      totalScanned: products?.length || 0,
    };
  }

  /**
   * 按 specs 参数值精确过滤（±20% 容差）
   */
  private filterBySpecs(products: IntentProduct[], specs: Record<string, string>): IntentProduct[] {
    return products.filter(product => {
      const paramText = product.parameterDescription;

      for (const [key, value] of Object.entries(specs)) {
        if (!value) continue;
        const numValue = parseFloat(String(value).replace(/[^0-9.]/g, ''));
        if (isNaN(numValue) || numValue <= 0) continue;

        // 从 parameter_description 中提取对应参数值
        let extractedValue: number | null = null;
        let specLabel = '';
        if (key === 'volume') {
          // 容量产品，检查 model 字段
          const modelNum = parseFloat((product.model || '').replace(/[^0-9.]/g, ''));
          if (!isNaN(modelNum) && modelNum > 0) extractedValue = modelNum;
        } else if (key === 'controlType') {
          // 控制方式精确匹配
          if (!paramText.includes(value)) return false;
          continue;
        } else {
          const label = SPEC_FIELD_MAP[key];
          specLabel = label || key;
          if (label) {
            const match = paramText.match(
              new RegExp(`${label.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')}\\s*[：:：]\\s*(\\d+(?:\\.\\d+)?)`, 'i')
            );
            if (match) extractedValue = parseFloat(match[1]);
          }
        }

        if (extractedValue !== null) {
          // 容差 ±25%（比之前的 ±20% 更宽，覆盖更多相近产品）
          const ratio = extractedValue / numValue;
          if (ratio < 0.75 || ratio > 1.25) {
            console.log(`[IntentBasedSearch] 过滤掉 ${product.name} ${product.model}: ${specLabel}=${extractedValue} 超出范围 [${numValue * 0.75}, ${numValue * 1.25}]`);
            return false;
          }
        }
      }

      return true;
    });
  }
}

export const intentBasedSearch = IntentBasedSearch.getInstance();
