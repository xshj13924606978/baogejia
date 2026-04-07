/**
 * 基于意图的 Supabase 产品搜索 — 四层渐进匹配
 *
 * 架构：LLM 意图解析 + 代码精确筛选
 *
 * 筛选流程：
 *   SQL 层：产品类型 + 品牌 → 获取候选集（宽松）
 *   代码层：四层渐进匹配
 *     第1层：精确匹配 — 所有条件 AND，数值 ±5%
 *     第2层：部分匹配 — 保留枚举，逐一去掉数值条件
 *     第3层：模糊匹配 — 所有数值条件扩大到 ±10%
 *     第4层：推荐匹配 — 同类型按价格排序取前5款
 *
 * 核心原则：
 *   - 精确优先，渐进放宽
 *   - 用户指定的参数必须满足（严格）
 *   - 用户没说的参数不参与筛选
 *   - 所有满足条件的产品全部展示
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';
import type { Intent, IntentProduct } from './intent-understanding';

// ═══════════════════════ 接口 ═══════════════════════

export interface IntentSearchResult {
  products: IntentProduct[];
  searchStrategy: string;
  confidence: number;
  totalScanned: number;
  matchLevel: 'exact' | 'partial' | 'fuzzy' | 'recommend' | 'none';
}

// ═══════════════════════ 参数分类 ═══════════════════════

const ENUM_PARAMS = new Set(['voltage', 'controlType', 'tankType']);

const NUMERIC_PARAMS = new Set([
  'flowRate', 'pressure', 'power', 'flow', 'head',
  'airVolume', 'windPressure', 'speed', 'current',
  'frequency', 'noise', 'weight', 'temperature',
]);

const VOLUME_PARAM = 'volume';

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

// ═══════════════════════ 容差配置 ═══════════════════════

const EXACT_TOLERANCE = 0.05;
const RELAXED_TOLERANCE = 0.10;

// ═══════════════════════ 属性映射 ═══════════════════════

const ATTRIBUTE_FILTERS: Record<string, {
  ilikeField?: string;
  ilikePattern?: string;
  orderField?: string;
  orderDir?: 'asc' | 'desc';
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

// ═══════════════════════ 工具函数 ═══════════════════════

export function matchNumericParam(
  userValue: number,
  productValue: number
): { matched: boolean; type: 'exact' | 'relaxed' | 'none'; errorPercent: number } {
  if (userValue <= 0) return { matched: false, type: 'none', errorPercent: 100 };
  const diff = Math.abs(userValue - productValue) / userValue;
  if (diff < EXACT_TOLERANCE) return { matched: true, type: 'exact', errorPercent: Math.round(diff * 100) };
  if (diff < RELAXED_TOLERANCE) return { matched: true, type: 'relaxed', errorPercent: Math.round(diff * 100) };
  return { matched: false, type: 'none', errorPercent: Math.round(diff * 100) };
}

export function extractNumericFromText(text: string, paramLabel: string): number | null {
  if (!text || !paramLabel) return null;
  const escaped = paramLabel.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  const pattern = new RegExp(`${escaped}\\s*[：:：]\\s*(\\d+(?:\\.\\d+)?)`, 'i');
  const match = text.match(pattern);
  return match ? parseFloat(match[1]) : null;
}

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

// ═══════════════════════ 条件分类 ═══════════════════════

interface EnumCondition { key: string; value: string }
interface NumericCondition { key: string; label: string; value: number }
interface GenericCondition { key: string; rawValue: string; numValue: number; unit: string }
interface VolumeCondition { value: number }

/** 分类参数条件（枚举、数值映射、通用、容量） */
function classifySpecs(specs: Record<string, string>) {
  const enums: EnumCondition[] = [];
  const numerics: NumericCondition[] = [];
  const generics: GenericCondition[] = [];
  let volume: VolumeCondition | null = null;

  for (const [key, value] of Object.entries(specs)) {
    if (!value) continue;

    if (key === VOLUME_PARAM) {
      const numVal = parseFloat(String(value).replace(/[^0-9.]/g, ''));
      if (!isNaN(numVal) && numVal > 0) volume = { value: numVal };
    } else if (ENUM_PARAMS.has(key)) {
      enums.push({ key, value: String(value) });
    } else if (NUMERIC_PARAMS.has(key)) {
      const label = SPEC_FIELD_MAP[key];
      const numVal = parseFloat(String(value).replace(/[^0-9.]/g, ''));
      if (!isNaN(numVal) && numVal > 0 && label) {
        numerics.push({ key, label, value: numVal });
      } else if (!isNaN(numVal) && numVal > 0) {
        const rawStr = String(value).replace(/\s/g, '');
        const unitMatch = rawStr.match(/^[\d.]+(.+)$/);
        const unit = unitMatch ? unitMatch[1].toLowerCase() : '';
        generics.push({ key, rawValue: String(value), numValue: numVal, unit });
      }
    } else {
      const numVal = parseFloat(String(value).replace(/[^0-9.]/g, ''));
      if (!isNaN(numVal) && numVal > 0) {
        const rawStr = String(value).replace(/\s/g, '');
        const unitMatch = rawStr.match(/^[\d.]+(.+)$/);
        const unit = unitMatch ? unitMatch[1].toLowerCase() : '';
        generics.push({ key, rawValue: String(value), numValue: numVal, unit });
      }
    }
  }

  return { enums, numerics, generics, volume };
}

// ═══════════════════════ 匹配函数 ═══════════════════════

/** 应用枚举条件（AND） */
function applyEnumConditions(products: IntentProduct[], enums: EnumCondition[]): IntentProduct[] {
  let result = products;
  for (const cond of enums) {
    result = result.filter(p => (p.parameterDescription || '').includes(cond.value));
  }
  return result;
}

/** 应用容量条件 */
function applyVolumeCondition(products: IntentProduct[], vol: VolumeCondition, tolerance: number): IntentProduct[] {
  return products.filter(p => {
    const modelNum = parseFloat((p.model || '').replace(/[^0-9.]/g, ''));
    if (isNaN(modelNum) || modelNum <= 0) return false;
    const min = vol.value * (1 - tolerance);
    const max = vol.value * (1 + tolerance);
    return modelNum >= min && modelNum <= max;
  });
}

/** 应用数值条件（AND，用 SPEC_FIELD_MAP 标签） */
function applyNumericConditions(products: IntentProduct[], numerics: NumericCondition[], tolerance: number): IntentProduct[] {
  let result = products;
  for (const cond of numerics) {
    result = result.filter(p => {
      const extracted = extractNumericFromText(p.parameterDescription || '', cond.label);
      if (extracted === null) return false;
      const min = cond.value * (1 - tolerance);
      const max = cond.value * (1 + tolerance);
      return extracted >= min && extracted <= max;
    });
  }
  return result;
}

/** 应用通用数值条件（AND，单位匹配） */
function applyGenericConditions(products: IntentProduct[], generics: GenericCondition[], tolerance: number): IntentProduct[] {
  let result = products;
  for (const cond of generics) {
    result = result.filter(product => {
      // 第1优先：从 key:value 格式的参数描述中匹配
      let allParams = extractAllParamsFromText(product.parameterDescription || '');

      // 第2优先：从 model 字段和逗号分隔的参数描述中提取候选值
      if (allParams.size === 0) {
        allParams = new Map();
        const rawParts = [product.model || '', product.parameterDescription || '']
          .join('，')
          .split(/[，,、\n]/)
          .map(s => s.trim())
          .filter(Boolean);
        rawParts.forEach((part, i) => allParams.set(`_raw_${i}`, part));
      }

      // 带单位精确匹配
      if (cond.unit) {
        for (const [, pValue] of allParams) {
          if (!pValue.toLowerCase().includes(cond.unit)) continue;
          const pNum = parseFloat(pValue.replace(/[^0-9.]/g, ''));
          if (!isNaN(pNum) && pNum > 0) {
            const min = cond.numValue * (1 - tolerance);
            const max = cond.numValue * (1 + tolerance);
            if (pNum >= min && pNum <= max) return true;
          }
        }
      }
      // 无单位或单位未匹配：对所有数值候选做容差匹配
      for (const [, pValue] of allParams) {
        const pNum = parseFloat(pValue.replace(/[^0-9.]/g, ''));
        if (!isNaN(pNum) && pNum > 0) {
          const min = cond.numValue * (1 - tolerance);
          const max = cond.numValue * (1 + tolerance);
          if (pNum >= min && pNum <= max) return true;
        }
      }
      return false;
    });
  }
  return result;
}

/** 应用所有数值类条件（数值 + 通用 + 容量） */
function applyAllNumericConditions(
  products: IntentProduct[],
  numerics: NumericCondition[],
  generics: GenericCondition[],
  volume: VolumeCondition | null,
  tolerance: number
): IntentProduct[] {
  let result = applyNumericConditions(products, numerics, tolerance);
  result = applyGenericConditions(result, generics, tolerance);
  if (volume) result = applyVolumeCondition(result, volume, tolerance);
  return result;
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

  async search(intent: Intent): Promise<IntentSearchResult> {
    const supabase = getSupabaseClient();
    const { productType, brand, specs, budget, attributes } = intent.entities;

    if (!productType) {
      return { products: [], searchStrategy: '无产品类型', confidence: 0, totalScanned: 0, matchLevel: 'none' };
    }

    console.log('[IntentBasedSearch] 开始搜索:', { productType, brand, specs, budget, attributes });

    // ═══ SQL 层：宽松获取候选集 ═══
    let query = supabase
      .from('products')
      .select('id, name, model, price, min_price, cost_price, parameter_description, brand, category');

    const strategies: string[] = [];

    query = query.ilike('name', `%${productType}%`);
    strategies.push(`产品类型=${productType}`);

    if (brand) {
      query = query.ilike('brand', `%${brand}%`);
      strategies.push(`品牌=${brand}`);
    }

    if (budget) {
      if (budget.max) { query = query.lte('price', budget.max); strategies.push(`预算≤${budget.max}`); }
      if (budget.min) { query = query.gte('price', budget.min); strategies.push(`预算≥${budget.min}`); }
    }

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

    query = query.limit(200);

    const { data: products, error } = await query;

    if (error) {
      console.error('[IntentBasedSearch] Supabase 查询失败:', error);
      return { products: [], searchStrategy: strategies.join('+'), confidence: 0, totalScanned: 0, matchLevel: 'none' };
    }

    let candidates = (products || []).map(toIntentProduct);
    console.log(`[IntentBasedSearch] SQL 候选集: ${candidates.length} 款`);

    // ═══ 代码层：四层渐进匹配 ═══
    const { matchLevel, matched, missingInfo } = this.fourLayerMatch(candidates, specs);

    // 排序
    if (orderField) {
      matched.sort((a, b) => {
        const aVal = a.minPrice || a.price;
        const bVal = b.minPrice || b.price;
        return orderDir === 'asc' ? aVal - bVal : bVal - aVal;
      });
    }

    // 去重
    const seen = new Set<string>();
    const unique = matched.filter(p => {
      const key = `${p.name}|${p.model}|${p.parameterDescription}`;
      if (seen.has(key)) return false;
      seen.add(key);
      return true;
    });

    const confidence = unique.length > 0
      ? (matchLevel === 'exact' ? 0.95 : matchLevel === 'partial' ? 0.85 : matchLevel === 'fuzzy' ? 0.75 : 0.6)
      : 0;

    console.log(`[IntentBasedSearch] 最终结果: ${unique.length} 款, matchLevel=${matchLevel}, 策略: ${strategies.join('+')}`);
    if (missingInfo) console.log(`[IntentBasedSearch] ${missingInfo}`);
    unique.forEach((p, i) => {
      console.log(`[IntentBasedSearch]   #${i + 1} ${p.name} | ${p.model} | 价格=${p.price} | 参数=${p.parameterDescription?.substring(0, 60)}`);
    });

    return {
      products: unique,
      searchStrategy: strategies.join('+'),
      confidence,
      totalScanned: products?.length || 0,
      matchLevel,
    };
  }

  /**
   * 四层渐进匹配核心逻辑
   *
   * 第1层 精确匹配：所有条件 AND，数值 ±5%
   * 第2层 部分匹配：保留枚举，逐一去掉数值条件
   * 第3层 模糊匹配：所有数值条件扩大到 ±10%
   * 第4层 推荐匹配：按价格排序取前5款
   */
  private fourLayerMatch(
    products: IntentProduct[],
    specs: Record<string, string> | undefined
  ): { matchLevel: 'exact' | 'partial' | 'fuzzy' | 'recommend' | 'none'; matched: IntentProduct[]; missingInfo?: string } {
    // 无 specs → 直接推荐
    if (!specs || Object.keys(specs).length === 0) {
      if (products.length === 0) return { matchLevel: 'none', matched: [] };
      const recommended = products
        .filter(p => (p.minPrice || p.price) > 0)
        .sort((a, b) => (a.minPrice || a.price) - (b.minPrice || b.price))
        .slice(0, 5);
      recommended.forEach(p => { p.matchType = 'recommend'; });
      return { matchLevel: 'recommend', matched: recommended, missingInfo: '无规格参数，返回同类型推荐产品' };
    }

    const { enums, numerics, generics, volume } = classifySpecs(specs);

    console.log(`[FourLayer] 条件分类: 枚举${enums.length}项(${enums.map(e => e.key).join(',')}) + 数值${numerics.length}项(${numerics.map(n => n.key).join(',')}) + 通用${generics.length}项(${generics.map(g => g.key).join(',')}) + 容量${volume ? 1 : 0}项`);

    // 先应用枚举条件（始终保留）
    const enumFiltered = applyEnumConditions(products, enums);

    // ═══ 第1层：精确匹配 — 所有条件 AND，±5% ═══
    const layer1 = applyAllNumericConditions(enumFiltered, numerics, generics, volume, EXACT_TOLERANCE);
    if (layer1.length > 0) {
      layer1.forEach(p => { p.matchType = 'exact'; });
      return { matchLevel: 'exact', matched: layer1 };
    }
    console.log('[FourLayer] 第1层(精确±5%) → 0款');

    // ═══ 第2层：部分匹配 — 逐一去掉数值条件 ═══
    // 合并所有数值条件到一个列表（方便逐一去掉）
    type AnyNumeric = { key: string; rawValue: string; isNumeric: boolean; label?: string; value?: number; numValue?: number; unit?: string };
    const allNumeric: AnyNumeric[] = [
      ...numerics.map(n => ({ key: n.key, rawValue: String(n.value), isNumeric: true, label: n.label, value: n.value })),
      ...generics.map(g => ({ key: g.key, rawValue: g.rawValue, isNumeric: false, numValue: g.numValue, unit: g.unit })),
    ];
    if (volume) {
      allNumeric.push({ key: 'volume', rawValue: String(volume.value), isNumeric: true, value: volume.value });
    }

    // 从最后一个条件开始逐一去掉
    for (let dropIdx = allNumeric.length - 1; dropIdx >= 0; dropIdx--) {
      const dropped = allNumeric[dropIdx];
      const remaining = allNumeric.filter((_, i) => i !== dropIdx);

      // 重建条件（排除 volume，单独处理）
      const remNumerics = remaining.filter(c => c.isNumeric && c.label).map(c => ({ key: c.key, label: c.label!, value: c.value! }));
      const remGenerics = remaining.filter(c => !c.isNumeric).map(c => ({ key: c.key, rawValue: c.rawValue, numValue: c.numValue!, unit: c.unit || '' }));
      const remVolume = remaining.find(c => c.key === 'volume') ? { value: (remaining.find(c => c.key === 'volume')!.value! as number) } : null;

      const layer2 = applyAllNumericConditions(enumFiltered, remNumerics, remGenerics, remVolume, EXACT_TOLERANCE);
      if (layer2.length > 0) {
        const missingLabel = dropped.rawValue;
        layer2.forEach(p => {
          p.matchType = 'partial';
          p.missingConditions = missingLabel;
        });
        return { matchLevel: 'partial', matched: layer2, missingInfo: `部分匹配：缺少 ${dropped.key}=${dropped.rawValue} 条件` };
      }
    }
    console.log('[FourLayer] 第2层(部分匹配) → 0款');

    // ═══ 第3层：模糊匹配 — 所有数值条件 ±10% ═══
    const layer3 = applyAllNumericConditions(enumFiltered, numerics, generics, volume, RELAXED_TOLERANCE);
    if (layer3.length > 0) {
      layer3.forEach(p => { p.matchType = 'fuzzy'; });
      return { matchLevel: 'fuzzy', matched: layer3, missingInfo: '模糊匹配：参数容差扩大到±10%' };
    }
    console.log('[FourLayer] 第3层(模糊±10%) → 0款');

    // ═══ 第4层：推荐匹配 — 只保留枚举条件，按价格排序取前5款 ═══
    const layer4Base = enumFiltered.length > 0 ? enumFiltered : products;
    const layer4 = layer4Base
      .filter(p => (p.minPrice || p.price) > 0)
      .sort((a, b) => (a.minPrice || a.price) - (b.minPrice || b.price))
      .slice(0, 5);
    layer4.forEach(p => { p.matchType = 'recommend'; });
    return { matchLevel: 'recommend', matched: layer4, missingInfo: '未找到匹配产品，返回同类型推荐' };
  }
}

export const intentBasedSearch = IntentBasedSearch.getInstance();
