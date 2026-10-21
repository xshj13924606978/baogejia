/**
 * 产品价格库服务（#[20260827-1030]-7）
 *
 * 产品价格库 = 用户自建/历史成交价，是全系统价格查询的最高优先级来源（1️⃣）。
 * 数据表：public.product_prices
 */
import { getSupabaseClient } from '@/lib/supabase';

export interface ProductPriceRow {
  id: number;
  product_name: string;
  model?: string | null;
  category?: string | null;
  brand?: string | null;
  spec?: string | null;
  price: number;
  unit: string;
  price_date?: string | null;
  source?: string | null;
  user_id?: string | null;
  is_active: boolean;
  remark?: string | null;
  metadata?: Record<string, any> | null;
  created_at?: string;
  updated_at?: string;
}

export interface ProductPriceInput {
  product_name: string;
  model?: string;
  category?: string;
  brand?: string;
  spec?: string;
  price: number;
  unit?: string;
  price_date?: string;
  source?: string;
  remark?: string;
}

/** 名称归一化：去括号内容/空白/斜杠，转小写，便于模糊匹配 */
export function normalizeProductName(name: string): string {
  return (name || '')
    .replace(/[（(【\[].*?[）)】\]]/g, '')
    .replace(/[／/、\s\-_]/g, '')
    .toLowerCase();
}

/**
 * 按名称模糊匹配产品价格库（最高优先级来源）
 * 匹配规则：优先名称完全一致 → 名称互相包含；同分时优先本用户记录、最新成交日期
 */
export async function searchProductPrice(
  productName: string,
  spec?: string,
  userId?: string
): Promise<ProductPriceRow | null> {
  try {
    const db = getSupabaseClient();
    const keyword = normalizeProductName(productName).slice(0, 12);
    if (!keyword) return null;

    // 先做数据库粗筛（名称包含关键字），再在内存精确打分
    let query = db
      .from('product_prices')
      .select('*')
      .eq('is_active', true)
      .ilike('product_name', `%${keyword}%`)
      .order('price_date', { ascending: false })
      .limit(30);

    const { data, error } = await query;
    if (error || !data || data.length === 0) return null;

    const rows = data as ProductPriceRow[];
    const normTarget = normalizeProductName(productName);

    let best: ProductPriceRow | null = null;
    let bestScore = -1;
    for (const row of rows) {
      const normRow = normalizeProductName(row.product_name);
      let score = 0;
      if (normRow === normTarget) score += 100;
      else if (normRow.includes(normTarget) || normTarget.includes(normRow)) score += 50;
      else continue;

      if (spec) {
        const normSpec = normalizeProductName(spec);
        if (normSpec && (row.spec || '').toLowerCase().includes(normSpec)) score += 20;
      }
      // 本用户记录优先
      if (userId && row.user_id === userId) score += 10;

      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }
    return best;
  } catch (e) {
    console.warn('[product-price-service] 查询产品价格库失败:', e);
    return null;
  }
}

/** 列出产品价格（可按用户/关键字/分类过滤） */
export async function listProductPrices(opts?: {
  userId?: string;
  keyword?: string;
  category?: string;
  limit?: number;
}): Promise<ProductPriceRow[]> {
  try {
    const db = getSupabaseClient();
    let query = db.from('product_prices').select('*').eq('is_active', true).order('updated_at', { ascending: false }).limit(opts?.limit ?? 100);
    if (opts?.userId) query = query.eq('user_id', opts.userId);
    if (opts?.category) query = query.eq('category', opts.category);
    if (opts?.keyword) query = query.ilike('product_name', `%${opts.keyword}%`);
    const { data } = await query;
    return (data as ProductPriceRow[]) || [];
  } catch (e) {
    console.warn('[product-price-service] 列出产品价格失败:', e);
    return [];
  }
}

/** 新增产品价格 */
export async function createProductPrice(
  input: ProductPriceInput,
  userId?: string
): Promise<ProductPriceRow | null> {
  try {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('product_prices')
      .insert({
        product_name: input.product_name,
        model: input.model ?? null,
        category: input.category ?? null,
        brand: input.brand ?? null,
        spec: input.spec ?? null,
        price: input.price,
        unit: input.unit ?? '台',
        price_date: input.price_date ?? new Date().toISOString().slice(0, 10),
        source: input.source ?? '用户录入',
        user_id: userId ?? null,
        remark: input.remark ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as ProductPriceRow;
  } catch (e) {
    console.warn('[product-price-service] 新增产品价格失败:', e);
    return null;
  }
}

/** 更新产品价格 */
export async function updateProductPrice(
  id: number,
  patch: Partial<ProductPriceInput>
): Promise<ProductPriceRow | null> {
  try {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('product_prices')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as ProductPriceRow;
  } catch (e) {
    console.warn('[product-price-service] 更新产品价格失败:', e);
    return null;
  }
}

/** 删除（软删除）产品价格 */
export async function deleteProductPrice(id: number): Promise<boolean> {
  try {
    const db = getSupabaseClient();
    const { error } = await db.from('product_prices').update({ is_active: false }).eq('id', id);
    return !error;
  } catch {
    return false;
  }
}
