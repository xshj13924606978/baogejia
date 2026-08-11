/**
 * 数据清洗与验证模块
 * 清洗八爪鱼 RPA 采集的原始数据，映射到 products 表字段
 */

export interface RawCollectionData {
  product_name?: string;
  model?: string;
  brand?: string;
  price?: string | number;
  supplier?: string;
  contact_person?: string;
  contact_phone?: string;
  parameter_description?: string;
  category?: string;
  // 兼容已有字段名
  name?: string;
  cost_price?: string | number;
  min_price?: string | number;
  guide_price?: string | number;
}

export interface ValidatedProduct {
  name: string;
  model: string;
  brand: string;
  cost_price: number;
  min_price: number;
  guide_price: number;
  supplier: string;
  contact_person: string;
  contact_phone: string;
  parameter_description: string;
  category: string;
}

/**
 * 清洗并验证采集数据
 */
export function validateProductData(raw: RawCollectionData): ValidatedProduct | null {
  const name = raw.name || raw.product_name || '';

  // 过滤无效数据：名称为空
  if (!name || name.trim() === '') {
    return null;
  }

  const costPrice = parseFloat(String(raw.cost_price || raw.price || 0));
  // 过滤价格为 0 或 NaN 的数据
  if (isNaN(costPrice) || costPrice <= 0) {
    return null;
  }

  return {
    name: name.trim(),
    model: (raw.model || '').trim(),
    brand: (raw.brand || '').trim(),
    cost_price: roundDecimal(costPrice),
    min_price: roundDecimal(costPrice * 1.15),
    guide_price: roundDecimal(costPrice * 1.25),
    supplier: (raw.supplier || '').trim(),
    contact_person: (raw.contact_person || '').trim(),
    contact_phone: formatPhone(raw.contact_phone || ''),
    parameter_description: (raw.parameter_description || '').trim(),
    category: (raw.category || '').trim(),
  };
}

/**
 * 保留 2 位小数
 */
function roundDecimal(value: number): number {
  return Math.round(value * 100) / 100;
}

/**
 * 格式化电话号码：去除空格和非法字符
 */
function formatPhone(phone: string): string {
  return phone.replace(/\s/g, '').replace(/[^0-9+\-/]/g, '');
}

/**
 * 批量清洗数据
 */
export function validateBatch(rawList: RawCollectionData[]): ValidatedProduct[] {
  const result: ValidatedProduct[] = [];
  for (const raw of rawList) {
    const validated = validateProductData(raw);
    if (validated) {
      result.push(validated);
    }
  }
  return result;
}
