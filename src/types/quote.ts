/**
 * 报价单通用类型定义
 */

// 供应方信息
export interface SupplierInfo {
  companyName: string;
  logoUrl?: string;
  contactPerson: string;
  phone: string;
  email: string;
  address: string;
  bankName: string;
  bankAccount: string;
  taxNumber: string;
}

// 项目概况键值对
export interface ProjectField {
  label: string;
  value: string;
  editable?: boolean;
}

// 产品信息
export interface Product {
  id?: string;
  name: string;
  model?: string;
  specifications?: string;
  brand?: string;
  unit?: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  category?: string; // 用于分组
  system?: string; // 用于分组
}

// 表格列配置
export interface TableColumnConfig {
  key: string;
  label: string;
  visible: boolean;
  width?: string;
  align?: 'left' | 'center' | 'right';
  required?: boolean;
}

// 分组类型
export type GroupType = 'category' | 'brand' | 'system' | 'none';

// 分组信息
export interface GroupInfo {
  type: GroupType;
  name: string;
  products: Product[];
}

// 费用配置
export interface FeeConfig {
  // 税费
  taxRate: number; // 0, 6, 9, 13 等
  taxAmount?: number; // 计算得出

  // 运费
  shippingFee: number;

  // 安装调试费
  installationFee: number;

  // 其他费用
  otherFee: number;
  otherFeeDescription?: string;
}

// 费用汇总
export interface FeeSummary {
  subtotal: number; // 小计 = Σ(单价 × 数量)
  taxAmount: number; // 税金 = 小计 × 税率
  shippingFee: number; // 运费
  installationFee: number; // 安装调试费
  otherFee: number; // 其他费用
  totalAmount: number; // 总计 = 小计 + 税金 + 运费 + 安装费 + 其他费
}

// 商务条款
export interface Terms {
  payment?: string;
  warranty?: string;
  delivery?: string;
  validity?: string;
}

// 报价单数据（新结构）
export interface QuoteData {
  quoteNumber: string;
  supplierInfo?: SupplierInfo;

  // 项目概况
  projectFields: ProjectField[];

  // 产品清单
  products: Product[];
  tableConfig?: {
    columns: TableColumnConfig[];
    groupType: GroupType;
  };

  // 费用配置
  feeConfig: FeeConfig;
  feeSummary: FeeSummary;

  // 商务条款
  terms?: Terms;

  // 元数据
  createdAt?: string;
  updatedAt?: string;
}

// 默认表格列配置
export const DEFAULT_TABLE_COLUMNS: TableColumnConfig[] = [
  { key: 'index', label: '序号', visible: true, align: 'center', width: '80px', required: true },
  { key: 'name', label: '产品名称', visible: true, align: 'left', required: true },
  { key: 'specifications', label: '规格型号', visible: true, align: 'left' },
  { key: 'brand', label: '品牌', visible: true, align: 'center' },
  { key: 'unit', label: '单位', visible: true, align: 'center', width: '80px' },
  { key: 'quantity', label: '数量', visible: true, align: 'center', width: '100px', required: true },
  { key: 'unitPrice', label: '单价', visible: true, align: 'right', width: '120px', required: true },
  { key: 'totalPrice', label: '总价', visible: true, align: 'right', width: '120px', required: true },
  { key: 'marketPrice', label: '市场参考价', visible: true, align: 'right', width: '140px' },
  { key: 'actions', label: '操作', visible: true, align: 'center', width: '100px' },
];

// 默认项目概况字段
export const DEFAULT_PROJECT_FIELDS: ProjectField[] = [
  { label: '项目名称', value: '' },
  { label: '客户名称', value: '' },
  { label: '联系人', value: '' },
  { label: '联系电话', value: '' },
  { label: '交货地址', value: '' },
  { label: '报价日期', value: new Date().toLocaleDateString('zh-CN') },
  { label: '项目编号', value: '' },
];

// 默认费用配置
export const DEFAULT_FEE_CONFIG: FeeConfig = {
  taxRate: 13,
  shippingFee: 0,
  installationFee: 0,
  otherFee: 0,
};

// 常用税率
export const COMMON_TAX_RATES = [
  { value: 0, label: '0%' },
  { value: 6, label: '6%' },
  { value: 9, label: '9%' },
  { value: 13, label: '13%' },
];
