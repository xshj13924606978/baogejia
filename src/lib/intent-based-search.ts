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

// specs key → parameter_description 中的中文标签（通用映射，支持所有产品品类）
const SPEC_FIELD_MAP: Record<string, string> = {
  flowRate: '排气量',
  pressure: '工作压力',
  power: '功率',
  voltage: '电压',
  controlType: '',
  volume: '',
  flow: '流量',
  head: '扬程',
  airVolume: '风量',
  windPressure: '风压',
  speed: '转速',
  current: '电流',
  frequency: '频率',
  noise: '噪音',
  weight: '重量',
  temperature: '温度',
  capacity: '容量',
};

// ═══════════════════════ 通用工具函数 ═══════════════════════

// 容差：精确3% / 相近10%（硬编码，不依赖环境变量加载时序）
const EXACT_TOLERANCE = 0.03;
const CLOSE_TOLERANCE = 0.10;
// 精确匹配结果少于该数量时，才扩大到相近范围
const EXACT_MIN_COUNT = 3;

/**
 * 通用数值匹配：精确(<3%) / 相近(3-10%) / 不匹配(>10%)
 */
export function matchNumericParam(
  userValue: number,
  productValue: number
): { matched: boolean; type: 'exact' | 'close' | 'none'; errorPercent: number } {
  if (userValue <= 0) return { matched: false, type: 'none', errorPercent: 100 };
  const diff = Math.abs(userValue - productValue) / userValue;
  if (diff < EXACT_TOLERANCE) return { matched: true, type: 'exact', errorPercent: Math.round(diff * 100) };
  if (diff < CLOSE_TOLERANCE) return { matched: true, type: 'close', errorPercent: Math.round(diff * 100) };
  return { matched: false, type: 'none', errorPercent: Math.round(diff * 100) };
}

/**
 * 从 parameter_description 中通用提取指定参数名的数值
 * 支持「排气量：0.8」「工作压力:0.8 MPa」等多种分隔符格式
 */
export function extractNumericFromText(text: string, paramLabel: string): number | null {
  if (!text || !paramLabel) return null;
  const escaped = paramLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(
    `${escaped}\\s*[：:：]\\s*(\\d+(?:\\.\\d+)?)`,
    'i'
  );
  const match = text.match(pattern);
  return match ? parseFloat(match[1]) : null;
}

/**
 * 从 parameter_description 中提取所有「键：值」参数对
 * 返回 Map<string, string>，如 {"功率" => "5.5KW", "工作压力" => "0.8MPa"}
 */
export function extractAllParamsFromText(text: string): Map<string, string> {
  const params = new Map<string, string>();
  if (!text) return params;
  const kvRegex = /([^，,、\n]+?)\s*[：:：]\s*([^，,、\n]+)/g;
  let match;
  while ((match = kvRegex.exec(text)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (key && value) params.set(key, value);
  }
  return params;
}

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

    // 3. 参数过滤（从 parameter_description 中通用匹配）
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
        } else {
          // 通用逻辑：通过 SPEC_FIELD_MAP 查找中文标签，无映射时用 key 本身
          const label = SPEC_FIELD_MAP[key];
          const numValue = String(value).replace(/[^0-9.]/g, '');
          if (numValue) {
            const searchLabel = label || key;
            query = query.ilike('parameter_description', `%${searchLabel}%`);
            strategies.push(`${searchLabel}≈${value}`);
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

    // 6. 两阶段参数过滤：先精确(±3%)，不足3款时扩大到相近(±10%)
    if (specs && results.length > 0) {
      const useGeneric = process.env.ENABLE_GENERIC_MATCHING !== 'false';
      if (useGeneric) {
        results = this.filterBySpecsTwoPass(results, specs);
      } else {
        results = this.filterBySpecsLegacy(results, specs);
      }
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
   * 评估单个产品对 specs 的最差匹配类型
   * 返回所有参数中匹配最差的结果（决定产品整体匹配类型）
   */
  private evaluateProductMatch(product: IntentProduct, specs: Record<string, string>): {
    matchType: 'exact' | 'close' | 'none';
    details: string;
  } {
    const paramText = product.parameterDescription;
    let worstType: 'exact' | 'close' | 'none' = 'exact';
    const detailParts: string[] = [];

    for (const [key, value] of Object.entries(specs)) {
      if (!value) continue;
      const numValue = parseFloat(String(value).replace(/[^0-9.]/g, ''));
      if (isNaN(numValue) || numValue <= 0) continue;

      let extractedValue: number | null = null;
      let specLabel = '';

      if (key === 'volume') {
        const modelNum = parseFloat((product.model || '').replace(/[^0-9.]/g, ''));
        if (!isNaN(modelNum) && modelNum > 0) extractedValue = modelNum;
        specLabel = '容量';
      } else if (key === 'controlType') {
        if (!paramText.includes(value)) return { matchType: 'none', details: `${key}=${value} 不匹配` };
        continue;
      } else {
        const label = SPEC_FIELD_MAP[key];
        specLabel = label || key;
        if (label) {
          extractedValue = extractNumericFromText(paramText, label);
        }
        if (extractedValue === null) {
          extractedValue = extractNumericFromText(paramText, key);
          if (extractedValue !== null) specLabel = key;
        }
      }

      if (extractedValue !== null) {
        const result = matchNumericParam(numValue, extractedValue);
        const sign = extractedValue < numValue ? '-' : '+';
        console.log(`[IntentBasedSearch] 数值匹配: ${specLabel} 需求=${numValue} 实际=${extractedValue} 类型=${result.type} 误差=${sign}${result.errorPercent}%`);

        if (result.type === 'none') {
          worstType = 'none';
          detailParts.push(`${specLabel}:${extractedValue}(${sign}${result.errorPercent}%)`);
        } else if (result.type === 'close' && worstType !== 'none') {
          worstType = 'close';
          detailParts.push(`${specLabel}:${extractedValue}(${sign}${result.errorPercent}%)`);
        }
        // exact 不影响 worstType
      }
    }

    return { matchType: worstType, details: detailParts.join(', ') };
  }

  /**
   * 两阶段参数过滤（新逻辑）：
   * 第1阶段：精确匹配(±3%) → exactProducts
   * 第2阶段：如果精确匹配不足3款，扩大到相近匹配(±10%) → closeProducts
   * 返回精确在前、相近在后的合并列表，每款产品标记 matchType
   */
  private filterBySpecsTwoPass(products: IntentProduct[], specs: Record<string, string>): IntentProduct[] {
    const exactProducts: IntentProduct[] = [];
    const closeProducts: IntentProduct[] = [];
    const exactIds = new Set<string>();

    // 第1阶段：精确匹配
    for (const product of products) {
      const { matchType, details } = this.evaluateProductMatch(product, specs);
      if (matchType === 'exact') {
        product.matchType = 'exact';
        if (details) product.matchDetails = details;
        exactProducts.push(product);
        exactIds.add(`${product.name}|${product.model}`);
      }
    }

    console.log(`[IntentBasedSearch] 第1阶段精确匹配: ${exactProducts.length} 款 (阈值≥${EXACT_MIN_COUNT})`);

    // 第2阶段：精确不足时，补充相近匹配
    if (exactProducts.length < EXACT_MIN_COUNT) {
      for (const product of products) {
        const key = `${product.name}|${product.model}`;
        if (exactIds.has(key)) continue;

        const { matchType, details } = this.evaluateProductMatch(product, specs);
        if (matchType === 'close') {
          product.matchType = 'close';
          if (details) product.matchDetails = details;
          closeProducts.push(product);
        }
      }
      console.log(`[IntentBasedSearch] 第2阶段相近匹配: ${closeProducts.length} 款 (精确不足${EXACT_MIN_COUNT}款)`);
    } else {
      console.log(`[IntentBasedSearch] 精确匹配已有${exactProducts.length}款，跳过相近匹配`);
    }

    // 合并：精确在前，相近在后
    const combined = [...exactProducts, ...closeProducts];
    console.log(`[IntentBasedSearch] 最终结果: 精确${exactProducts.length}款 + 相近${closeProducts.length}款 = ${combined.length}款`);
    return combined;
  }

  /**
   * 旧参数过滤逻辑（降级方案）
   */
  private filterBySpecsLegacy(products: IntentProduct[], specs: Record<string, string>): IntentProduct[] {
    return products.filter(product => {
      const paramText = product.parameterDescription;

      for (const [key, value] of Object.entries(specs)) {
        if (!value) continue;
        const numValue = parseFloat(String(value).replace(/[^0-9.]/g, ''));
        if (isNaN(numValue) || numValue <= 0) continue;

        let extractedValue: number | null = null;
        let specLabel = '';
        if (key === 'volume') {
          const modelNum = parseFloat((product.model || '').replace(/[^0-9.]/g, ''));
          if (!isNaN(modelNum) && modelNum > 0) extractedValue = modelNum;
        } else if (key === 'controlType') {
          if (!paramText.includes(value)) return false;
          continue;
        } else {
          const label = SPEC_FIELD_MAP[key];
          specLabel = label || key;
          if (label) {
            extractedValue = extractNumericFromText(paramText, label);
          }
        }

        if (extractedValue !== null) {
          const ratio = extractedValue / numValue;
          if (ratio < 0.9 || ratio > 1.1) {
            console.log(`[IntentBasedSearch] [旧逻辑] 过滤掉 ${product.name} ${product.model}: ${specLabel}=${extractedValue} 超出±10%容差`);
            return false;
          }
        }
      }

      return true;
    });
  }
}

export const intentBasedSearch = IntentBasedSearch.getInstance();
