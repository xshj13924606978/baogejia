/**
 * 产品字段全局合并（唯一数据源）
 * #[20260824-2015] 修复：
 *  1) is_required 合并规则改为「以 system_fields 为主，product_field_configs 仅在显式 true 时覆盖」，
 *     避免 pfc.is_required=false 覆盖 system_fields.is_required=true 导致「指导价」等必填字段消失；
 *  2) 统一「新增/编辑产品表单」「价格库字段必填配置」「导入/提交必填校验」三处必填字段来源，
 *     全局动态关联、实时更新，杜绝硬编码与虚假数据。
 */

import type { SupabaseClient } from '@supabase/supabase-js';
import { getProductSchemaMetadata } from '@/lib/product-schema-metadata';

export interface MergedProductField {
  id: string | null;
  field_key: string;
  field_type: string;
  label_zh: string;
  is_visible: boolean;
  is_editable: boolean;
  is_required: boolean;
  group_name: string | null;
  sort_order: number;
  config: Record<string, any> | null;
  validation_rules: Record<string, any> | null;
  depends_on: string | null;
  options_config: any;
}

// 数字字段名集合（用于从 products 真实列推断 field_type）
const NUMBER_FIELDS = new Set([
  'price',
  'cost_price',
  'min_price',
  'stock',
  'bid_amount',
  'quote_count',
  'rating',
  'response_time',
]);

/**
 * 合并 system_fields + product_field_configs + products 真实列，返回产品字段列表。
 *
 * 合并规则（is_required）：以 system_fields 为主，product_field_configs 仅在显式 true 时覆盖：
 *   is_required = sf.is_required || pfc.is_required
 * pfc.is_required=false 不会覆盖 system_fields 的必填，避免「指导价」等必填字段丢失。
 *
 * product_field_configs 独有字段（system_fields 中没有的）按 products 表真实列动态追加，
 * 未出现在 products 表列中的配置项会被忽略，保证不产生虚假字段。
 */
export async function getMergedProductFields(db: SupabaseClient): Promise<MergedProductField[]> {
  // 页面配置是必填字段契约的必需前置依赖：查询失败或缺失都必须抛出，
  // 不得降级为 []（否则产生不完整的必填字段契约）。
  const pageRes = await db
    .from('system_pages')
    .select('id')
    .eq('page_key', 'product_list')
    .eq('is_enabled', true)
    .single();
  if (pageRes.error) {
    throw new Error('查询产品页面配置失败');
  }
  const pageId = pageRes.data?.id;
  if (!pageId) {
    throw new Error('未找到启用的产品页面配置');
  }

  const [fieldsRes, pfcRes, productCols] = await Promise.all([
    db
      .from('system_fields')
      .select(
        'id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config, validation_rules, depends_on, options_config',
      )
      .eq('page_id', pageId)
      .order('sort_order', { ascending: true }),
    db
      .from('product_field_configs')
      .select('field_key, field_label, is_required, is_visible, display_order'),
    // #[E1 caller closure] 用 public.products_columns 元数据视图替代 exec_sql/info_schema 任意 SQL 通道。
    // 查询失败会抛出 ProductSchemaMetadataError → 向上 fail-closed（不再静默忽略或返回 []）。
    getProductSchemaMetadata(db),
  ]);

  // system_fields / product_field_configs 任一查询失败 → 抛错（区分合法空结果与 query error）。
  if (fieldsRes.error) {
    throw new Error('查询系统字段失败');
  }
  if (pfcRes.error) {
    throw new Error('查询产品字段配置失败');
  }

  const pfcMap = new Map<string, any>();
  for (const p of pfcRes.data || []) {
    pfcMap.set(p.field_key, p);
  }

  const mergedFields: MergedProductField[] = (fieldsRes.data || []).map((f: any) => {
    const pfc = pfcMap.get(f.field_key);
    if (!pfc) return f as MergedProductField;
    return {
      ...f,
      // 以 system_fields 为主，pfc 仅在显式 true 时覆盖（is_required = sf || pfc）
      is_required: !!f.is_required || !!pfc.is_required,
      is_visible: pfc.is_visible !== undefined ? !!pfc.is_visible : f.is_visible,
    };
  });

  if (productCols.length > 0) {
    for (const [key, pfc] of pfcMap) {
      if (mergedFields.find((f) => f.field_key === key)) continue;
      if (!productCols.find((c) => c.column_name === key)) continue; // 不是 products 真实列，忽略
      const field_type = NUMBER_FIELDS.has(key) ? 'number' : key === 'image_url' ? 'image' : 'text';
      mergedFields.push({
        id: null,
        field_key: key,
        field_type,
        label_zh: pfc.field_label || key,
        is_visible: !!pfc.is_visible,
        is_editable: true,
        is_required: !!pfc.is_required,
        group_name: null,
        sort_order: (pfc.display_order ?? 1000) + 1000, // 排在 system_fields 之后
        config: null,
        validation_rules: null,
        depends_on: null,
        options_config: null,
      });
    }
    mergedFields.sort((a, b) => (a.sort_order ?? 999) - (b.sort_order ?? 999));
  }

  return mergedFields;
}

/**
 * 获取产品必填字段集合（与前端表单红 * 同一合并规则：sf 为主，pfc 显式 true 覆盖）。
 * 供 POST 创建、导入等后端必填校验使用，保证前后端校验一致。
 */
export async function getProductRequiredFieldKeys(db: SupabaseClient): Promise<string[]> {
  const fields = await getMergedProductFields(db);
  return fields.filter((f) => f.is_required).map((f) => f.field_key);
}
