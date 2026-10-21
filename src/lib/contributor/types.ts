/**
 * 资料贡献者功能类型定义
 * 创建时间: 2026-08-12
 */

// 资料类型
export type ContributorType = 'product' | 'document' | 'case' | 'standard' | 'drawing' | 'quota';

// 资料类型定义
export interface ContributorTypeDef {
  id: ContributorType;
  label: string;
  hasFile: boolean;
  fileLabel?: string;
}

export const CONTRIBUTOR_TYPES: ContributorTypeDef[] = [
  { id: 'product', label: '产品价格库', hasFile: true, fileLabel: '上传价格表' },
  { id: 'document', label: '技术文档库', hasFile: true, fileLabel: '上传文档' },
  { id: 'case', label: '案例库', hasFile: true, fileLabel: '上传附件' },
  { id: 'standard', label: '标准规范库', hasFile: true, fileLabel: '上传标准文件' },
  { id: 'drawing', label: '图纸图片库', hasFile: true, fileLabel: '上传图纸' },
  { id: 'quota', label: '定额库', hasFile: true, fileLabel: '上传定额表' },
];

// 资料类型展示配置
export const CONTRIBUTOR_TYPE_LABELS: Record<ContributorType, string> = CONTRIBUTOR_TYPES.reduce(
  (acc, t) => {
    acc[t.id] = t.label;
    return acc;
  },
  {} as Record<ContributorType, string>
);

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
    // 注意：字段列表/必填/排序以后台「字段必填配置」(product_field_configs) 为准，
    // 此处仅为接口不可用时的兜底定义，key 与后台规范保持一致。
    fields: [
      { name: 'name', label: '产品名称', required: true, type: 'text', placeholder: '请输入产品名称' },
      { name: 'model', label: '规格型号', required: true, type: 'text', placeholder: '请输入规格型号' },
      { name: 'parameter_description', label: '参数描述', required: true, type: 'textarea', placeholder: '请输入参数描述（如电压、功率等）' },
      { name: 'brand', label: '品牌', required: true, type: 'text', placeholder: '请输入品牌' },
      { name: 'unit', label: '单位', required: true, type: 'text', placeholder: '如：台、套、件' },
      { name: 'supplier', label: '供应商', required: true, type: 'text', placeholder: '请输入供应商' },
      { name: 'contact_person', label: '联系人', required: true, type: 'text', placeholder: '请输入联系人' },
      { name: 'contact_phone', label: '联系电话', required: true, type: 'text', placeholder: '请输入联系电话' },
      { name: 'cost_price', label: '成本价', required: true, type: 'number', placeholder: '请输入成本价（元）' },
      { name: 'min_price', label: '最低售价', required: false, type: 'number', placeholder: '请输入最低售价（元）' },
      { name: 'price', label: '指导价', required: true, type: 'number', placeholder: '请输入指导价（元）' },
      { name: 'category', label: '分类', required: false, type: 'text', placeholder: '请输入产品分类' },
      { name: 'image_url', label: '产品图片', required: false, type: 'text', placeholder: '请输入产品图片链接' },
      { name: 'stock', label: '库存', required: false, type: 'number', placeholder: '请输入库存数量' },
      { name: 'file', label: '上传价格表', required: false, type: 'file', placeholder: '请选择价格表文件上传' },
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
      { name: 'file', label: '上传案例文件', required: true, type: 'file', placeholder: '请选择案例文件上传（支持 PDF/Word/PPT/Excel/图片/视频/压缩包等）' },
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
      { name: 'file', label: '上传定额表', required: false, type: 'file', placeholder: '请选择定额表文件上传' },
    ],
  },
};

// 积分奖励规则（审核通过后发放）
//
// 注意（#[20260827-1030]-8）：以下常量仅为「Fallback 默认值」，仅在数据库不可达、
// 未应用迁移 085、points_rules 缺记录时兜底使用，以保证零停机。
// 业务逻辑（service.ts、invite-rewards/route.ts 等）应统一通过
// ./points-config.ts 中的动态函数读取（自动从 public.points_rules 表获取最新配置）。
import {
  FALLBACK_CONTRIBUTOR_UPLOAD_POINTS,
  FALLBACK_CONTRIBUTOR_REGISTER_POINTS,
  FALLBACK_CONTRIBUTOR_ADOPT_POINTS,
} from './points-config';

export const CONTRIBUTOR_POINTS_RULES: Record<
  ContributorType,
  { points: number; reason: string }
> = {
  product: { points: FALLBACK_CONTRIBUTOR_UPLOAD_POINTS.product, reason: '上传产品价格' },
  document: { points: FALLBACK_CONTRIBUTOR_UPLOAD_POINTS.document, reason: '上传技术文档' },
  case: { points: FALLBACK_CONTRIBUTOR_UPLOAD_POINTS.case, reason: '上传案例' },
  standard: { points: FALLBACK_CONTRIBUTOR_UPLOAD_POINTS.standard, reason: '上传标准规范' },
  drawing: { points: FALLBACK_CONTRIBUTOR_UPLOAD_POINTS.drawing, reason: '上传图纸图片' },
  quota: { points: FALLBACK_CONTRIBUTOR_UPLOAD_POINTS.quota, reason: '上传定额' },
};

// 注册贡献者奖励积分（fallback 默认值；实际读取 points_rules.rule_key='contributor_register'）
export const CONTRIBUTOR_REGISTER_POINTS = FALLBACK_CONTRIBUTOR_REGISTER_POINTS;

// 资料被管理员采纳额外奖励积分（fallback 默认值；实际读取 points_rules.rule_key='contributor_adopt'）
export const CONTRIBUTOR_ADOPT_POINTS = FALLBACK_CONTRIBUTOR_ADOPT_POINTS;

// 资料状态
export type UploadStatus = 'pending' | 'approved' | 'rejected';

export const UPLOAD_STATUS_LABELS: Record<UploadStatus, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '未通过',
};
