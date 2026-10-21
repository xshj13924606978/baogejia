/**
 * 产品字段配置（后台统一配置）客户端助手
 * 字段列表 / 必填 / 判重配置仅来源于后台 product_field_configs，单点配置、全局生效。
 * 创建时间: 2026-08-20
 */
import { CONTRIBUTOR_FORM_DEFS, type FieldDef } from './types';

/** 后台字段配置项 */
export interface ProductFieldConfig {
  id: number;
  field_key: string;
  field_label: string;
  field_type: string;
  is_required: boolean;
  is_duplicate_check: boolean;
  is_visible: boolean;
  display_order: number;
}

/** 价格表映射弹窗使用的系统字段 */
export interface ProductSystemField {
  key: string;
  label: string;
  required: boolean;
}

/** 旧字段 key → 规范 key 兼容映射（历史数据/旧列名） */
export const PRODUCT_FIELD_KEY_ALIASES: Record<string, string> = {
  product_name: 'name',
  spec_model: 'model',
  param_desc: 'parameter_description',
  specifications: 'parameter_description',
  description: 'parameter_description',
  contact: 'contact_person',
  phone: 'contact_phone',
  price: 'price',
};

/** 后台 field_type → 表单控件类型 */
const FIELD_TYPE_TO_FORM: Record<string, FieldDef['type']> = {
  text: 'text',
  number: 'number',
  textarea: 'textarea',
  image: 'image',
  file: 'file',
  date: 'date',
};

/** 从后台加载产品字段配置（公开接口，无需登录；失败返回 null） */
export async function fetchProductFieldConfigs(): Promise<ProductFieldConfig[] | null> {
  try {
    const res = await fetch('/api/tables/products/field-configs', { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    const list: ProductFieldConfig[] = Array.isArray(json?.data) ? json.data : null;
    if (!list || list.length === 0) return null;
    return [...list].sort((a, b) => (a.display_order ?? 0) - (b.display_order ?? 0));
  } catch {
    return null;
  }
}

/**
 * 由后台字段配置构建单品表单字段（只渲染可见字段，末尾追加「上传价格表」文件字段）。
 * configs 为 null（接口不可用）时回退到内置兜底定义。
 */
export function buildProductFormFields(configs: ProductFieldConfig[] | null): FieldDef[] {
  const fields: FieldDef[] = [];

  if (configs && configs.length > 0) {
    for (const c of configs) {
      if (!c.is_visible) continue;
      fields.push({
        name: c.field_key,
        label: c.field_label,
        required: !!c.is_required,
        type: FIELD_TYPE_TO_FORM[c.field_type] || 'text',
        placeholder: '',
      });
    }
  } else {
    for (const f of CONTRIBUTOR_FORM_DEFS.product.fields) {
      if (f.name === 'file') continue;
      fields.push({ ...f });
    }
  }

  // 上传价格表文件字段固定追加（非产品属性字段，不属于后台配置）
  fields.push({ name: 'file', label: '上传价格表', required: false, type: 'file', placeholder: '请选择价格表文件上传' });
  return fields;
}

/** 由后台字段配置构建价格表映射弹窗的系统字段列表 */
export function buildProductSystemFields(configs: ProductFieldConfig[] | null): ProductSystemField[] {
  if (configs && configs.length > 0) {
    return configs
      .filter((c) => c.is_visible)
      .map((c) => ({ key: c.field_key, label: c.field_label, required: !!c.is_required }));
  }
  return CONTRIBUTOR_FORM_DEFS.product.fields
    .filter((f) => f.name !== 'file')
    .map((f) => ({ key: f.name, label: f.label, required: f.required }));
}
