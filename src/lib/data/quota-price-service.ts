/**
 * 定额库服务（#[20260827-1030]-7）
 *
 * 定额库 = 国家/行业规范定额价格，是全系统价格查询的次优先级来源（2️⃣）。
 * 数据表：public.quota_prices（quota_code 定额编号，如 "GYD-101-2024"）
 */
import { getSupabaseClient } from '@/lib/supabase';
import { normalizeProductName } from './product-price-service';

export interface QuotaPriceRow {
  id: number;
  quota_code: string;
  product_name: string;
  model?: string | null;
  category?: string | null;
  spec?: string | null;
  price: number;
  unit: string;
  quota_year?: number | null;
  standard_name?: string | null;
  standard_code?: string | null;
  is_active: boolean;
  remark?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface QuotaPriceInput {
  quota_code: string;
  product_name: string;
  model?: string;
  category?: string;
  spec?: string;
  price: number;
  unit?: string;
  quota_year?: number;
  standard_name?: string;
  standard_code?: string;
  remark?: string;
}

/**
 * 按名称模糊匹配定额库
 * 匹配规则：优先名称完全一致 → 互相包含；同分时优先最新年份定额
 */
export async function searchQuotaPrice(
  productName: string,
  spec?: string
): Promise<QuotaPriceRow | null> {
  try {
    const db = getSupabaseClient();
    const keyword = normalizeProductName(productName).slice(0, 12);
    if (!keyword) return null;

    const { data, error } = await db
      .from('quota_prices')
      .select('*')
      .eq('is_active', true)
      .ilike('product_name', `%${keyword}%`)
      .order('quota_year', { ascending: false })
      .limit(30);
    if (error || !data || data.length === 0) return null;

    const rows = data as QuotaPriceRow[];
    const normTarget = normalizeProductName(productName);

    let best: QuotaPriceRow | null = null;
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
      if (score > bestScore) {
        bestScore = score;
        best = row;
      }
    }
    return best;
  } catch (e) {
    console.warn('[quota-price-service] 查询定额库失败:', e);
    return null;
  }
}

/** 列出定额库条目 */
export async function listQuotaPrices(opts?: {
  keyword?: string;
  category?: string;
  limit?: number;
}): Promise<QuotaPriceRow[]> {
  try {
    const db = getSupabaseClient();
    let query = db.from('quota_prices').select('*').eq('is_active', true).order('updated_at', { ascending: false }).limit(opts?.limit ?? 100);
    if (opts?.category) query = query.eq('category', opts.category);
    if (opts?.keyword) query = query.ilike('product_name', `%${opts.keyword}%`);
    const { data } = await query;
    return (data as QuotaPriceRow[]) || [];
  } catch (e) {
    console.warn('[quota-price-service] 列出定额库失败:', e);
    return [];
  }
}

/** 新增定额条目 */
export async function createQuotaPrice(input: QuotaPriceInput): Promise<QuotaPriceRow | null> {
  try {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('quota_prices')
      .insert({
        quota_code: input.quota_code,
        product_name: input.product_name,
        model: input.model ?? null,
        category: input.category ?? null,
        spec: input.spec ?? null,
        price: input.price,
        unit: input.unit ?? '台',
        quota_year: input.quota_year ?? null,
        standard_name: input.standard_name ?? null,
        standard_code: input.standard_code ?? null,
        remark: input.remark ?? null,
      })
      .select()
      .single();
    if (error) throw error;
    return data as QuotaPriceRow;
  } catch (e) {
    console.warn('[quota-price-service] 新增定额条目失败:', e);
    return null;
  }
}

/** 更新定额条目 */
export async function updateQuotaPrice(
  id: number,
  patch: Partial<QuotaPriceInput>
): Promise<QuotaPriceRow | null> {
  try {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('quota_prices')
      .update({ ...patch, updated_at: new Date().toISOString() })
      .eq('id', id)
      .select()
      .single();
    if (error) throw error;
    return data as QuotaPriceRow;
  } catch (e) {
    console.warn('[quota-price-service] 更新定额条目失败:', e);
    return null;
  }
}

/** 删除（软删除）定额条目 */
export async function deleteQuotaPrice(id: number): Promise<boolean> {
  try {
    const db = getSupabaseClient();
    const { error } = await db.from('quota_prices').update({ is_active: false }).eq('id', id);
    return !error;
  } catch {
    return false;
  }
}
