/**
 * 方案增强 - 共享类型定义（#[20260827-1030]-2）
 *
 * 供前端 ProposalViewer、后端 proposal-enhancer / enhance API 共用。
 */

// ============================================================================
// 供方信息（动态取自 suppliers 表 / 登录用户，禁止硬编码）
// ============================================================================

export interface ProposalSupplierInfo {
  companyName: string;
  address?: string;
  contactPerson?: string;
  phone?: string;
  email?: string;
  taxNumber?: string;
  bankName?: string;
  bankAccount?: string;
  website?: string;
}

// ============================================================================
// 报价明细
// ============================================================================

export interface ProposalQuoteItem {
  id: string;
  name: string; // 设备/项目名称
  model: string; // 规格型号
  brand: string; // 品牌/产地
  techParams: string; // 技术参数
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  warranty: string; // 质保期
  category: string; // 分类：设备/土建/安装/其他
  remark?: string;
}

export interface SparePartItem {
  name: string;
  model: string;
  brand: string;
  unit: string;
  quantity: number;
  unitPrice: number;
  totalPrice: number;
  remark?: string;
}

// ============================================================================
// 工艺流程 / 可视化
// ============================================================================

export interface ProcessFlowStep {
  step: number;
  name: string;
  description: string;
  keyParams?: string; // 关键工艺参数
}

export interface ProposalChartDatum {
  name: string;
  value: number;
}

export interface EquipmentCompareDatum {
  name: string; // 设备名称
  specs: string; // 规格
  params: Record<string, number>; // 可对比数值参数（功率、台数等）
}

export interface ProposalChartData {
  quoteBreakdown: ProposalChartDatum[]; // 报价占比（按分类）
  equipmentCompare: EquipmentCompareDatum[]; // 设备参数对比
  totalAmount: number;
}

export interface ProposalImageRef {
  id: string;
  title: string;
  prompt: string;
  url: string; // Pollinations.ai 图片 URL
  fallback: string; // 结构化占位图（SVG data URI，含设备名称与关键参数）
}

// ============================================================================
// 章节结构（10 章）
// ============================================================================

export interface ProposalSection {
  id: string; // '01' ~ '10'
  title: string;
  summary: string; // 章节摘要
  content: string; // 章节正文（Markdown）
}

export interface DesignCalculation {
  name: string; // 计算项目
  purpose: string; // 计算目的
  steps: string[]; // 计算步骤（含公式与取值）
  result: string; // 计算结果
  conclusion: string; // 结论
}

// ============================================================================
// 增强后的完整方案结果
// ============================================================================

export interface EnhancedProposalResult {
  proposalId: string;
  title: string;
  projectName: string;
  projectType: string;
  capacity: number; // 处理规模 吨/天
  supplierInfo: ProposalSupplierInfo;
  sections: ProposalSection[]; // 10 章节
  markdown: string; // 完整方案 Markdown
  mermaidSource: string; // 工艺流程图 Mermaid 源码
  chartData: ProposalChartData; // 图表数据
  images: ProposalImageRef[]; // AI 配图（含降级占位图）
  quoteItems: ProposalQuoteItem[]; // 报价明细
  spareParts: SparePartItem[]; // 首年推荐备品备件
  designCalculations: DesignCalculation[]; // 设计计算书
  paymentTerms: string[]; // 付款节点
  serviceTerms: string[]; // 技术服务条款
  warrantyTerms: string[]; // 质保条款
  totalAmount: number;
  confidence: number;
  generatedAt: string;
}

// ============================================================================
// 导出
// ============================================================================

export type ProposalExportFormat = 'markdown' | 'pdf' | 'word' | 'excel' | 'ppt';

/** 客户端导出时携带的渲染资产（由 ProposalViewer 渲染后提供） */
export interface ProposalExportAssets {
  charts?: {
    quoteBreakdown?: string; // base64 PNG dataURL
    equipmentCompare?: string; // base64 PNG dataURL
  };
  diagram?: {
    svg?: string; // 工艺流程图 SVG
    png?: string; // base64 PNG dataURL
  };
  images?: Record<string, string>; // 设备图片 id -> base64 PNG dataURL
}

/** 增强请求参数（#[20260827-1030]-2） */
export interface EnhanceProposalRequest {
  context: {
    projectType: string;
    capacity: number;
    influentQuality?: Record<string, number>;
    effluentStandards?: Record<string, number>;
    processType?: string;
    location?: string;
    budget?: number;
    requirements?: string[];
    supplierInfo?: Partial<ProposalSupplierInfo>; // 客户端可覆盖/补充供方信息
  };
  originalProposal: string;
  options?: {
    enhancementLevel?: 'basic' | 'standard' | 'comprehensive';
    includeCharts?: boolean;
    includeDiagram?: boolean;
  };
  format?: ProposalExportFormat;
  assets?: ProposalExportAssets;
}
