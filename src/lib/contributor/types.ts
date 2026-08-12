/**
 * 资料贡献者功能类型定义
 * 创建时间: 2026-08-12
 */

// 资料类型
export const CONTRIBUTOR_TYPES = [
  'product',
  'document',
  'case',
  'standard',
  'drawing',
  'quota',
] as const;

export type ContributorType = (typeof CONTRIBUTOR_TYPES)[number];

// 资料类型展示配置
export const CONTRIBUTOR_TYPE_LABELS: Record<ContributorType, string> = {
  product: '产品价格库',
  document: '技术文档库',
  case: '案例库',
  standard: '标准规范库',
  drawing: '图纸图片库',
  quota: '定额库',
};

// 每种资料类型的字段定义
export interface FieldDef {
  name: string;
  label: string;
  required: boolean;
  type: 'text' | 'number' | 'textarea' | 'file' | 'image' | 'link' | 'date' | 'select';
  options?: string[];
  placeholder?: string;
}

export interface TypeFormDef {
  type: ContributorType;
  label: string;
  fields: FieldDef[];
}

// 资料表单字段配置
export const CONTRIBUTOR_FORM_DEFS: Record<ContributorType, TypeFormDef> = {
  product: {
    type: 'product',
    label: '产品价格库',
    fields: [
      { name: 'product_name', label: '产品名称', required: true, type: 'text', placeholder: '请输入产品名称' },
      { name: 'spec_model', label: '规格型号', required: true, type: 'text', placeholder: '请输入规格型号' },
      { name: 'brand', label: '品牌', required: true, type: 'text', placeholder: '请输入品牌' },
      { name: 'price', label: '价格', required: true, type: 'number', placeholder: '请输入价格（元）' },
      { name: 'supplier', label: '供应商', required: true, type: 'text', placeholder: '请输入供应商' },
      { name: 'param_desc', label: '参数描述', required: false, type: 'textarea', placeholder: '请输入参数描述（可选）' },
      { name: 'contact', label: '联系人', required: false, type: 'text', placeholder: '联系人（可选）' },
      { name: 'phone', label: '电话', required: false, type: 'text', placeholder: '联系电话（可选）' },
    ],
  },
  document: {
    type: 'document',
    label: '技术文档库',
    fields: [
      { name: 'doc_title', label: '文档标题', required: true, type: 'text', placeholder: '请输入文档标题' },
      { name: 'doc_type', label: '文档类型', required: true, type: 'text', placeholder: '如：产品说明书、技术手册' },
      { name: 'file', label: '上传文件', required: true, type: 'file', placeholder: '请选择文件上传' },
      { name: 'description', label: '描述', required: false, type: 'textarea', placeholder: '文档描述（可选）' },
      { name: 'keywords', label: '关键词', required: false, type: 'text', placeholder: '关键词，用逗号分隔（可选）' },
    ],
  },
  case: {
    type: 'case',
    label: '案例库',
    fields: [
      { name: 'case_name', label: '案例名称', required: true, type: 'text', placeholder: '请输入案例名称' },
      { name: 'industry', label: '行业类型', required: true, type: 'text', placeholder: '请输入所属行业' },
      { name: 'case_desc', label: '案例描述', required: true, type: 'textarea', placeholder: '请输入案例描述' },
      { name: 'image', label: '图片', required: false, type: 'image', placeholder: '上传案例图片（可选）' },
      { name: 'link', label: '链接', required: false, type: 'link', placeholder: '相关链接（可选）' },
    ],
  },
  standard: {
    type: 'standard',
    label: '标准规范库',
    fields: [
      { name: 'standard_no', label: '标准编号', required: true, type: 'text', placeholder: '如：GB/T 12345-2020' },
      { name: 'standard_name', label: '标准名称', required: true, type: 'text', placeholder: '请输入标准名称' },
      { name: 'publisher', label: '发布单位', required: true, type: 'text', placeholder: '请输入发布单位' },
      { name: 'file', label: '文件', required: false, type: 'file', placeholder: '上传标准文件（可选）' },
      { name: 'implement_date', label: '实施日期', required: false, type: 'date', placeholder: '实施日期（可选）' },
    ],
  },
  drawing: {
    type: 'drawing',
    label: '图纸图片库',
    fields: [
      { name: 'drawing_name', label: '图纸名称', required: true, type: 'text', placeholder: '请输入图纸名称' },
      { name: 'drawing_no', label: '图纸编号', required: true, type: 'text', placeholder: '请输入图纸编号' },
      { name: 'file', label: '上传图纸', required: true, type: 'file', placeholder: '请选择图纸文件上传' },
      { name: 'description', label: '描述', required: false, type: 'textarea', placeholder: '图纸描述（可选）' },
      { name: 'version', label: '版本', required: false, type: 'text', placeholder: '版本号（可选）' },
    ],
  },
  quota: {
    type: 'quota',
    label: '定额库',
    fields: [
      { name: 'quota_no', label: '定额编号', required: true, type: 'text', placeholder: '请输入定额编号' },
      { name: 'quota_name', label: '定额名称', required: true, type: 'text', placeholder: '请输入定额名称' },
      { name: 'unit', label: '单位', required: true, type: 'text', placeholder: '请输入单位' },
      { name: 'unit_price', label: '单价', required: true, type: 'number', placeholder: '请输入单价（元）' },
      { name: 'description', label: '说明', required: false, type: 'textarea', placeholder: '补充说明（可选）' },
    ],
  },
};

// 积分奖励规则（审核通过后发放）
export const CONTRIBUTOR_POINTS_RULES: Record<ContributorType, { points: number; reason: string }> = {
  product: { points: 50, reason: '上传产品价格' },
  document: { points: 80, reason: '上传技术文档' },
  case: { points: 60, reason: '上传案例' },
  standard: { points: 80, reason: '上传标准规范' },
  drawing: { points: 40, reason: '上传图纸图片' },
  quota: { points: 50, reason: '上传定额' },
};

// 注册贡献者奖励积分
export const CONTRIBUTOR_REGISTER_POINTS = 100;

// 资料被管理员采纳额外奖励积分
export const CONTRIBUTOR_ADOPT_POINTS = 100;

// 资料状态
export type UploadStatus = 'pending' | 'approved' | 'rejected';

export const UPLOAD_STATUS_LABELS: Record<UploadStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
};
