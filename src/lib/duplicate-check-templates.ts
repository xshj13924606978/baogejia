/**
 * 判重规则模板配置
 * 提供常用的判重规则模板，用户可以一键应用
 */

export interface DuplicateCheckTemplate {
  id: string;
  name: string;
  description: string;
  fields: string[];
  icon?: string;
}

/**
 * 判重规则模板列表
 */
export const duplicateCheckTemplates: DuplicateCheckTemplate[] = [
  {
    id: 'simple',
    name: '简单判重',
    description: '仅名称相同即重复',
    fields: ['name'],
    icon: '🎯',
  },
  {
    id: 'name_model',
    name: '名称+型号判重',
    description: '名称和型号相同即重复（默认）',
    fields: ['name', 'model'],
    icon: '📦',
  },
  {
    id: 'standard',
    name: '标准判重',
    description: '名称+型号+品牌相同即重复（推荐）',
    fields: ['name', 'model', 'brand'],
    icon: '✅',
  },
  {
    id: 'strict',
    name: '严格判重',
    description: '所有字段都相同才算重复',
    fields: ['name', 'model', 'brand', 'parameter_description'],
    icon: '🔒',
  },
  {
    id: 'custom1',
    name: '名称+品牌判重',
    description: '名称和品牌相同即重复',
    fields: ['name', 'brand'],
    icon: '🏷️',
  },
  {
    id: 'custom2',
    name: '型号+品牌判重',
    description: '型号和品牌相同即重复',
    fields: ['model', 'brand'],
    icon: '🔖',
  },
];

/**
 * 根据ID获取模板
 */
export function getTemplateById(id: string): DuplicateCheckTemplate | undefined {
  return duplicateCheckTemplates.find(template => template.id === id);
}

/**
 * 获取默认模板
 */
export function getDefaultTemplate(): DuplicateCheckTemplate {
  return duplicateCheckTemplates.find(template => template.id === 'standard') || duplicateCheckTemplates[0];
}

/**
 * 验证字段是否有效
 */
export function validateFields(fields: string[], availableFields: string[]): boolean {
  return fields.every(field => availableFields.includes(field));
}

/**
 * 字段显示名称映射
 */
export const fieldLabelMap: Record<string, string> = {
  name: '产品名称',
  model: '规格型号',
  brand: '品牌',
  category: '分类',
  price: '指导价',
  supplier: '供应商',
  parameter_description: '参数描述',
  unit: '单位',
  cost_price: '成本价',
  min_price: '最低售价',
  stock: '库存',
  description: '描述',
  image_url: '图片',
  contact_person: '联系人',
  contact_phone: '联系电话',
};

/**
 * 格式化字段列表为可读文本
 */
export function formatFieldList(fields: string[]): string {
  return fields
    .map(field => fieldLabelMap[field] || field)
    .join('、');
}

/**
 * 生成判重规则描述
 */
export function generateRuleDescription(fields: string[]): string {
  if (fields.length === 0) {
    return '未配置判重规则';
  }

  const fieldLabels = fields.map(field => fieldLabelMap[field] || field);
  const count = fields.length;

  if (count === 1) {
    return `当${fieldLabels[0]}相同时，视为重复产品`;
  } else if (count === 2) {
    return `当${fieldLabels[0]}和${fieldLabels[1]}都相同时，视为重复产品`;
  } else {
    const lastField = fieldLabels[count - 1];
    const otherFields = fieldLabels.slice(0, -1).join('、');
    return `当${otherFields}和${lastField}都相同时，视为重复产品`;
  }
}
