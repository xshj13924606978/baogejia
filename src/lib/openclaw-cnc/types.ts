/**
 * OpenClaw CNC 功能类型定义
 * 创建时间: 2026-08-12
 */

// 支持的图纸文件格式
export type CNCDrawingFormat = 'step' | 'stp' | 'stl' | 'obj' | 'ply' | 'dxf' | 'png' | 'jpg' | 'jpeg';

// 图纸分析请求
export interface CNCAnalyzeRequest {
  filePath: string;  // 服务器上的临时文件路径
  fileName: string;  // 原始文件名
  density?: number;  // 材料密度（g/cm³），用于估算质量
}

// 包围盒尺寸（mm）
export interface CNCDimensions {
  length: number;  // 长（X）
  width: number;   // 宽（Y）
  height: number;  // 高（Z）
}

// 图纸分析结果
export interface CNCAnalysisResult {
  success: boolean;
  format: string;       // 识别到的文件格式
  fileName: string;
  dimensions?: CNCDimensions;   // 包围盒尺寸
  volume?: number;      // 体积（mm³）
  surfaceArea?: number; // 表面积（mm²）
  mass?: number;        // 估算质量（kg）
  density?: number;     // 使用的密度（g/cm³）
  featureCount?: number; // 识别到的特征数量
  features?: string[];  // 识别到的特征描述
  warnings?: string[];
  error?: string;       // 失败原因
}

// CNC 报价请求
export interface CNCQuoteRequest {
  material: string;            // 材料类型（如：铝合金、不锈钢、碳钢、铜、POM、尼龙）
  length: number;              // 长度（mm）
  width: number;               // 宽度（mm）
  height: number;              // 高度（mm）
  quantity: number;            // 数量
  tolerance?: string;          // 公差等级（如：±0.1mm、±0.05mm、±0.02mm）
  surfaceTreatment?: string;   // 表面处理（如：阳极氧化、镀锌、喷砂、抛光）
  complexity?: 'low' | 'medium' | 'high';  // 加工复杂度
}

// 报价明细项
export interface CNCQuoteBreakdownItem {
  label: string;
  amount: number;
}

// CNC 报价结果
export interface CNCQuoteResult {
  success: boolean;
  material: string;
  materialCost: number;       // 材料成本（元）
  machiningCost: number;      // 加工成本（元）
  surfaceTreatmentCost: number; // 表面处理成本（元）
  setupCost: number;          // 装夹/编程准备成本（元）
  unitPrice: number;          // 单件价格（元）
  totalPrice: number;         // 总价（元）
  deliveryDays: number;       // 预计交付天数
  breakdown: CNCQuoteBreakdownItem[];
  error?: string;
}

// 桥接脚本通用响应
export interface CNCBridgeResponse<T = Record<string, unknown>> {
  success: boolean;
  data?: T;
  error?: string;
  trace?: string;
}
