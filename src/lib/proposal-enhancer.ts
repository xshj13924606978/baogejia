/**
 * 智能方案增强器
 *
 * 功能：
 * 1. 增强技术方案的专业性、完整性和可实施性
 * 2. 使用 DeepSeek 智能生成技术细节和操作指导
 * 3. 使用 Coze 工具获取市场数据和技术资料
 * 4. 提供多维度的方案优化建议
 *
 * 增强维度：
 * - 技术参数细化
 * - 工艺流程优化
 * - 设备配置优化
 * - 成本分析增强
 * - 实施指导
 * - 运营建议
 * - 风险评估
 * - 合规性检查
 */

import { callDeepSeekChat } from './deepseek-client';
import { cozeToolsService } from './coze-tools';
import { Logger } from './logger';
import {
  matchKnowledgeDocuments,
  type KnowledgeMatchResult,
} from './knowledge/match-service';
// #[20260827-1030]-2 新增类型导入
import type {
  EnhancedProposalResult,
  ProposalSection,
  ProposalQuoteItem,
  SparePartItem,
  ProposalChartData,
  ProposalSupplierInfo,
  DesignCalculation,
  ProcessFlowStep as ProposalProcessFlowStep,
} from '@/types/proposal';
import { buildProcessFlowMermaid, buildFrameworkMermaid } from './visualization/flowchart-generator';
import { generateEquipmentImages } from './visualization/image-service';
// #[20260827-1030]-3 领域知识库驱动（计算引擎 / 设备库 / 成本估算 / 规范 / 工艺模板）
import {
  runEngineeringDesign,
  buildQuoteItem as kbBuildQuoteItem,
  getRelatedStandards,
  getProcessTemplate,
  type EngineeringDesign,
  type ProcessTemplate,
  type StandardEntry,
} from './knowledge';

// ============================================================================
// 方案相关类型定义
// ============================================================================

export interface ProposalContext {
  projectType: string; // 项目类型：生活污水、工业废水等
  capacity: number; // 处理规模（吨/天）
  influentQuality?: {
    // 进水水质
    cod?: number; // COD (mg/L)
    bod5?: number; // BOD5 (mg/L)
    ss?: number; // SS (mg/L)
    nh3n?: number; // NH3-N (mg/L)
    tn?: number; // TN (mg/L)
    tp?: number; // TP (mg/L)
    ph?: number; // pH
  };
  effluentStandards?: {
    // 出水标准
    cod?: number;
    bod5?: number;
    ss?: number;
    nh3n?: number;
    tn?: number;
    tp?: number;
  };
  processType?: string; // 工艺类型：A/O、MBR、SBR等
  location?: string; // 项目地点
  budget?: number; // 预算（万元）
  requirements?: string[]; // 特殊要求
  // #[20260827-1030]-2 供方信息（动态取自系统用户/客户资料库，禁止硬编码）
  supplierInfo?: ProposalSupplierInfo;
  customerInfo?: {
    name?: string;
    contact?: string;
    phone?: string;
    address?: string;
  };
}

export interface TechnicalParameter {
  name: string;
  value: number | string;
  unit?: string;
  description?: string;
  category: 'influent' | 'process' | 'effluent' | 'equipment';
}

export interface ProcessStep {
  step: number;
  name: string;
  description: string;
  equipment?: Array<{
    name: string;
    model?: string;
    quantity: number;
    specs?: string;
  }>;
  parameters?: TechnicalParameter[];
  duration?: number; // 停留时间（小时）
  notes?: string;
}

export interface EquipmentConfig {
  id: string;
  name: string;
  category: string;
  model?: string;
  quantity: number;
  specs?: string;
  power?: number; // 功率 (kW)
  price?: number; // 价格（元）
  remarks?: string;
}

export interface CostAnalysis {
  capitalCost: {
    equipmentCost: number; // 设备费用
    civilWorkCost: number; // 土建费用
    installationCost: number; // 安装费用
    otherCost: number; // 其他费用
    total: number; // 总投资
  };
  operatingCost: {
    powerCost: number; // 电费
    chemicalCost: number; // 药剂费
    laborCost: number; // 人工费
    maintenanceCost: number; // 维护费
    total: number; // 年运营成本
    unitCost: number; // 吨水成本
  };
}

export interface ImplementationGuide {
  phase: string;
  steps: Array<{
    task: string;
    duration: string;
    requirements?: string[];
    notes?: string;
  }>;
}

export interface OperationAdvice {
  startup: string; // 启动指导
  routineOperation: string; // 日常操作
  maintenance: string; // 维护建议
  troubleshooting: string; // 故障排查
  safetyMeasures: string; // 安全措施
}

export interface RiskAssessment {
  risks: Array<{
    category: string;
    description: string;
    probability: 'high' | 'medium' | 'low';
    impact: 'high' | 'medium' | 'low';
    mitigation: string;
  }>;
}

export interface EnhancedProposal {
  originalProposal: string; // 原始方案
  enhancedProposal: string; // 增强后的方案

  // 技术细节
  technicalParameters: TechnicalParameter[];
  processFlow: ProcessStep[];
  equipmentConfig: EquipmentConfig[];

  // 成本分析
  costAnalysis?: CostAnalysis;

  // 实施指导
  implementationGuide: ImplementationGuide;
  operationAdvice: OperationAdvice;

  // 风险评估
  riskAssessment: RiskAssessment;

  // 优化建议
  optimizationSuggestions: Array<{
    category: string;
    description: string;
    benefit: string;
    priority: 'high' | 'medium' | 'low';
  }>;

  // 元数据
  enhancementLevel: 'basic' | 'standard' | 'comprehensive';
  confidence: number;
  usedTools: {
    deepseek: boolean;
    webSearch: boolean;
    embedding: boolean;
  };

  // 知识库参考资料（#20260822-2242 指令 3/3）
  knowledgeReferences?: KnowledgeMatchResult[];
}

export interface EnhancementOptions {
  enableTechnicalParams?: boolean; // 启用技术参数细化
  enableProcessOptimization?: boolean; // 启用工艺流程优化
  enableEquipmentOptimization?: boolean; // 启用设备配置优化
  enableCostAnalysis?: boolean; // 启用成本分析
  enableImplementationGuide?: boolean; // 启用实施指导
  enableOperationAdvice?: boolean; // 启用运营建议
  enableRiskAssessment?: boolean; // 启用风险评估
  enableMarketData?: boolean; // 启用市场数据查询
  enhancementLevel?: 'basic' | 'standard' | 'comprehensive';
}

// #[20260827-1030]-2 完整方案生成选项
export interface CompleteProposalOptions extends EnhancementOptions {
  supplierInfo?: ProposalSupplierInfo; // 供方信息（动态获取）
  includeCharts?: boolean; // 是否生成图表数据
  includeDiagram?: boolean; // 是否生成工艺流程图
}

// ============================================================================
// LLM 输出 JSON 安全解析（#[20260830-1956]）
//
// 背景：AI 常在 JSON 前后附带说明文字，且输出可能被 maxTokens 截断。
//   旧实现一律用 /\[[\s\S]*\]/、/\{[\s\S]*\}/ 这类**贪心正则**截取：
//   ① 正文里出现多余的方括号/大括号时，会把 JSON 之外的说明文字一起框进来
//      → SyntaxError「Expected ',' or '}' after property value」（本次工艺流程解析失败现场）
//   ② 输出被截断时，贪心匹配只能抓到最后一个嵌套 ']'，同样是残缺 JSON
//   ③ 个别元素畸形 → 整段 JSON.parse 抛错 → 该维度内容被整体丢弃
//   ④ 对象类结果直接返回 LLM 原始对象，不做结构校验 → 缺 steps 字段时
//      assembleEnhancedProposal 读 implementationGuide.steps.length 抛 TypeError
//      → 整个 /api/proposal/enhance 请求 500（跑满 120s 却零产出）
//
// 策略：括号配对截取（跳过字符串内的括号）→ 整段解析 → 失败则逐元素解析
//       （畸形/截断元素逐个跳过，保留可解析部分）→ 调用方再做结构校验。
// ============================================================================

/** 去掉 Markdown 代码围栏，避免围栏字符进入截取范围 */
function stripCodeFences(text: string): string {
  return (text || '').replace(/```(?:json)?/gi, '');
}

/**
 * 从 text 中截取首个 JSON 片段（数组或对象）。
 * 按括号配对扫描并跳过字符串内的括号；若输出被截断（找不到闭合括号），
 * 返回「起始括号 → 文本末尾」的片段，交由逐元素解析兜底。
 */
function sliceJsonBlock(text: string, kind: 'array' | 'object'): string | null {
  const open = kind === 'array' ? '[' : '{';
  const close = kind === 'array' ? ']' : '}';
  const src = stripCodeFences(text);
  const start = src.indexOf(open);
  if (start < 0) return null;

  let depth = 0;
  let inString = false;
  let escaped = false;
  for (let i = start; i < src.length; i++) {
    const ch = src[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === open) depth += 1;
    else if (ch === close) {
      depth -= 1;
      if (depth === 0) return src.slice(start, i + 1);
    }
  }
  // 未闭合：输出被截断，返回剩余片段
  return src.slice(start);
}

/** 去掉对象/数组末尾多余的逗号 */
function stripTrailingCommas(json: string): string {
  return json.replace(/,(\s*[}\]])/g, '$1');
}

/** 转义字符串字面量中未转义的换行/回车/制表符（AI 常在描述值里直接换行） */
function escapeRawControlChars(json: string): string {
  let out = '';
  let inString = false;
  let escaped = false;
  for (let i = 0; i < json.length; i++) {
    const ch = json[i];
    if (inString) {
      if (escaped) {
        out += ch;
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        out += ch;
        escaped = true;
        continue;
      }
      if (ch === '"') {
        out += ch;
        inString = false;
        continue;
      }
      if (ch === '\n') {
        out += '\\n';
        continue;
      }
      if (ch === '\r') {
        out += '\\r';
        continue;
      }
      if (ch === '\t') {
        out += '\\t';
        continue;
      }
      out += ch;
      continue;
    }
    if (ch === '"') inString = true;
    out += ch;
  }
  return out;
}

/** 按顶层分隔符切分（数组元素 / 对象属性），跳过字符串与嵌套结构 */
function splitTopLevel(body: string, separator = ','): string[] {
  const parts: string[] = [];
  let depth = 0;
  let inString = false;
  let escaped = false;
  let start = 0;
  for (let i = 0; i < body.length; i++) {
    const ch = body[i];
    if (inString) {
      if (escaped) {
        escaped = false;
        continue;
      }
      if (ch === '\\') {
        escaped = true;
        continue;
      }
      if (ch === '"') inString = false;
      continue;
    }
    if (ch === '"') {
      inString = true;
      continue;
    }
    if (ch === '{' || ch === '[') depth += 1;
    else if (ch === '}' || ch === ']') depth -= 1;
    else if (ch === separator && depth === 0) {
      parts.push(body.slice(start, i));
      start = i + 1;
    }
  }
  parts.push(body.slice(start));
  return parts.map((p) => p.trim()).filter((p) => p.length > 0);
}

/** 逐级降级解析一段 JSON：原始 → 去尾逗号 → 转义裸控制字符 */
function parseWithFallback(json: string): any | null {
  const noComma = stripTrailingCommas(json);
  const variants = [json, noComma, escapeRawControlChars(noComma)];
  for (const variant of variants) {
    try {
      return JSON.parse(variant);
    } catch {
      /* 继续尝试下一级降级方案 */
    }
  }
  return null;
}

/**
 * 宽松解析 LLM 返回的 JSON 数组。
 * 整段解析失败时退化为逐元素解析：畸形元素与截断产生的最后一个不完整元素被跳过，
 * 可解析的元素照常保留（旧实现会整段丢弃，导致该章节内容全空）。
 */
function parseLlmJsonArray(text: string): any[] | null {
  const block = sliceJsonBlock(text, 'array');
  if (!block) return null;

  const whole = parseWithFallback(block);
  if (Array.isArray(whole)) return whole;

  const body = block.slice(1).replace(/[\]\s]*$/, '');
  const result: any[] = [];
  for (const raw of splitTopLevel(body)) {
    const parsed = parseWithFallback(raw.replace(/,$/, ''));
    if (parsed !== null) result.push(parsed);
  }
  return result.length > 0 ? result : null;
}

/** 宽松解析 LLM 返回的 JSON 对象；解析失败返回 null，由调用方走降级默认值 */
function parseLlmJsonObject(text: string): Record<string, any> | null {
  const block = sliceJsonBlock(text, 'object');
  if (!block) return null;
  const parsed = parseWithFallback(block);
  return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : null;
}

/** 取字符串字段：非字符串一律返回空串（避免把对象/数组渲染成 [object Object]） */
function asText(value: unknown): string {
  return typeof value === 'string' ? value.trim() : '';
}

// ============================================================================
// 推诿语句清理（#[20260827-1030]-2）
// 移除 AI 生成的"无法..."、"建议您自行..."等推诿表述，保证输出内容闭环
// ============================================================================

const PUSH_OFF_PATTERNS: RegExp[] = [
  /无法直接[^，。；\n]{0,40}[，。；\n]/g,
  /无法[^，。；\n]{0,24}(提供|生成|实现|创建|导出|绘制)[^，。；\n]{0,30}[，。；\n]/g,
  /建议您?自行[^。\n]{0,40}[。\n]/g,
  /抱歉，?我(暂时)?无法[^。\n]{0,40}[。\n]/g,
  /由于[^，。\n]{0,40}无法[^。\n]{0,40}[。\n]/g,
  /这个功能(目前)?(尚)?未(提供|开放|支持)[^。\n]{0,30}[。\n]/g,
  /请(您)?(自行|线下|另寻)[^。\n]{0,40}[。\n]/g,
];

/**
 * 清理推诿语句，替换为可执行引导；同时合并残留标点。
 */
export function sanitizePushOffStatements(text: string): string {
  let result = (text || '').trim();
  const usedReplacements: Array<{ from: string; to: string }> = [];
  for (const re of PUSH_OFF_PATTERNS) {
    result = result.replace(re, (match) => {
      usedReplacements.push({ from: match, to: '' });
      return '';
    });
  }
  // 清理因删除造成的残留标点/空行
  result = result
    .replace(/[，,]{2,}/g, '，')
    .replace(/[。;；]{2,}/g, '。')
    .replace(/\n{3,}/g, '\n\n')
    .replace(/^\s*[，。；,;]\s*/gm, '')
    .trim();
  return result;
}

// ============================================================================
// 智能方案增强器
// ============================================================================

export class ProposalEnhancer {
  constructor() {
    Logger.info('[ProposalEnhancer] 智能方案增强器初始化完成');
  }

  /**
   * 增强技术方案（主方法）
   */
  async enhanceProposal(
    context: ProposalContext,
    originalProposal: string,
    options: EnhancementOptions = {}
  ): Promise<EnhancedProposal> {
    const {
      enableTechnicalParams = true,
      enableProcessOptimization = true,
      enableEquipmentOptimization = true,
      enableCostAnalysis = true,
      enableImplementationGuide = true,
      enableOperationAdvice = true,
      enableRiskAssessment = true,
      enableMarketData = false,
      enhancementLevel = 'standard',
    } = options;

    Logger.info(`[ProposalEnhancer] 开始增强方案`, {
      项目类型: context.projectType,
      处理规模: `${context.capacity}吨/天`,
      增强级别: enhancementLevel,
    });

    const usedTools = {
      deepseek: false,
      webSearch: false,
      embedding: false,
    };

    // 先并行执行不互相依赖的增强任务
    const [
      technicalParams,
      processFlow,
      equipmentConfig,
      implementationGuide,
      operationAdvice,
      riskAssessment,
      optimizationSuggestions,
      knowledgeReferences,
    ] = await Promise.all([
      // 技术参数细化
      enableTechnicalParams
        ? this.enhanceTechnicalParameters(context, originalProposal)
        : Promise.resolve([]),

      // 工艺流程优化
      enableProcessOptimization
        ? this.enhanceProcessFlow(context, originalProposal)
        : Promise.resolve([]),

      // 设备配置优化
      enableEquipmentOptimization
        ? this.enhanceEquipmentConfig(context, originalProposal, enableMarketData)
        : Promise.resolve([]),

      // 实施指导
      enableImplementationGuide
        ? this.generateImplementationGuide(context)
        : Promise.resolve({ phase: '', steps: [] }),

      // 运营建议
      enableOperationAdvice
        ? this.generateOperationAdvice(context)
        : Promise.resolve({
            startup: '',
            routineOperation: '',
            maintenance: '',
            troubleshooting: '',
            safetyMeasures: '',
          }),

      // 风险评估
      enableRiskAssessment ? this.generateRiskAssessment(context) : Promise.resolve({ risks: [] }),

      // 优化建议
      this.generateOptimizationSuggestions(context, originalProposal),

      // 知识库智能匹配（按增强等级召回参考资料）
      this.matchKnowledgeReferences(context, enhancementLevel),
    ]);

    // 成本分析依赖于设备配置，单独执行
    const costAnalysis = enableCostAnalysis
      ? await this.generateCostAnalysis(context, equipmentConfig)
      : undefined;

    // 标记使用的工具
    if (enableTechnicalParams || enableProcessOptimization || enableEquipmentOptimization) {
      usedTools.deepseek = true;
    }
    if (enableMarketData) {
      usedTools.webSearch = cozeToolsService.getStatus().webSearchEnabled;
    }
    if (knowledgeReferences.length > 0) {
      usedTools.embedding = true;
    }

    // 生成增强后的方案
    const enhancedProposal = this.assembleEnhancedProposal(
      context,
      originalProposal,
      technicalParams,
      processFlow,
      equipmentConfig,
      costAnalysis,
      implementationGuide,
      operationAdvice,
      riskAssessment,
      optimizationSuggestions,
      knowledgeReferences
    );

    Logger.info('[ProposalEnhancer] 方案增强完成', {
      技术参数数量: technicalParams.length,
      工艺步骤数量: processFlow.length,
      设备配置数量: equipmentConfig.length,
      优化建议数量: optimizationSuggestions.length,
    });

    return {
      originalProposal,
      enhancedProposal,
      technicalParameters: technicalParams,
      processFlow,
      equipmentConfig,
      costAnalysis,
      implementationGuide,
      operationAdvice,
      riskAssessment,
      optimizationSuggestions,
      enhancementLevel,
      confidence: 0.85,
      usedTools,
      knowledgeReferences,
    };
  }

  /**
   * 知识库智能匹配：按增强等级召回参考资料（#20260822-2242 指令 3/3）
   * Basic=2 / Standard=5 / Comprehensive=10
   * 检索范围：案例库 + 技术文档库 + 标准规范库
   */
  private async matchKnowledgeReferences(
    context: ProposalContext,
    level: 'basic' | 'standard' | 'comprehensive'
  ): Promise<KnowledgeMatchResult[]> {
    const limit = level === 'comprehensive' ? 10 : level === 'basic' ? 2 : 5;
    try {
      const matchQuery = `${context.projectType}${context.processType ? ' ' + context.processType : ''} 污水处理 ${context.capacity}吨/天 工艺方案`.slice(0, 200);
      const results = await matchKnowledgeDocuments({
        query: matchQuery,
        moduleTypes: ['case', 'document', 'standard'],
        limit,
      });
      if (results.length > 0) {
        Logger.info(`[ProposalEnhancer] 知识库匹配 ${results.length} 条参考资料（${level} 级）`);
      }
      return results;
    } catch (err) {
      Logger.error('[ProposalEnhancer] 知识库匹配失败（跳过）:', err);
      return [];
    }
  }

  /**
   * 增强技术参数（使用 DeepSeek）
   */
  private async enhanceTechnicalParameters(
    context: ProposalContext,
    proposal: string
  ): Promise<TechnicalParameter[]> {
    Logger.info('[ProposalEnhancer] 增强技术参数');

    try {
      if (!process.env.DEEPSEEK_API_KEY) {
        return [];
      }

      const systemPrompt = `你是一个污水处理技术专家。根据项目上下文和原始方案，提取和生成详细的技术参数。

## 输出格式（JSON）：
[
  {
    "name": "参数名称",
    "value": "数值",
    "unit": "单位",
    "description": "参数说明",
    "category": "influent|process|effluent|equipment"
  }
]

## 参数类别说明：
- influent: 进水水质参数（COD、BOD5、SS、NH3-N、TN、TP、pH等）
- process: 工艺运行参数（HRT、SRT、MLSS、DO、回流比等）
- effluent: 出水水质参数（排放标准相关）
- equipment: 设备技术参数（功率、尺寸、材质等）

请只输出 JSON，不要包含其他说明文字。`;

      const userPrompt = `项目类型：${context.projectType}
处理规模：${context.capacity} 吨/天
工艺类型：${context.processType || '未指定'}
进水水质：${JSON.stringify(context.influentQuality, null, 2)}
出水标准：${JSON.stringify(context.effluentStandards, null, 2)}

原始方案：
${proposal}

请生成详细的技术参数（至少20个参数，涵盖进水、工艺、出水、设备等各类参数）。`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        maxTokens: 2048,
      });

      // #[20260830-1956]：宽松解析，畸形/截断元素按个跳过，不再整段丢弃
      const params = parseLlmJsonArray(response.text);
      if (params) {
        return params.filter((p: any) => p?.name && p?.value);
      }

      return [];
    } catch (error) {
      Logger.error('[ProposalEnhancer] 技术参数增强失败:', error);
      return [];
    }
  }

  /**
   * 增强工艺流程（使用 DeepSeek）
   */
  private async enhanceProcessFlow(
    context: ProposalContext,
    proposal: string
  ): Promise<ProcessStep[]> {
    Logger.info('[ProposalEnhancer] 增强工艺流程');

    try {
      if (!process.env.DEEPSEEK_API_KEY) {
        return [];
      }

      const systemPrompt = `你是一个污水处理工艺设计专家。根据项目上下文和原始方案，生成详细的工艺流程。

## 输出格式（JSON）：
[
  {
    "step": 1,
    "name": "工艺单元名称",
    "description": "单元描述（50-100字）",
    "equipment": [
      {
        "name": "设备名称",
        "model": "型号",
        "quantity": 数量,
        "specs": "规格参数"
      }
    ],
    "parameters": [
      {
        "name": "参数名",
        "value": "数值",
        "unit": "单位",
        "description": "说明"
      }
    ],
    "duration": 停留时间（小时）,
    "notes": "注意事项"
  }
]

请只输出 JSON，不要包含其他说明文字。`;

      const userPrompt = `项目类型：${context.projectType}
处理规模：${context.capacity} 吨/天
工艺类型：${context.processType || '智能推荐'}

原始方案：
${proposal}

请生成详细的工艺流程（至少5个工艺单元，包含预处理、生化处理、深度处理等全流程）。`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        // #[20260830-1956]：5+ 工艺单元 × 嵌套设备/参数数组，2048 会截断输出
        // → 旧贪心正则只能抓到残缺 JSON，本次线上报错的直接诱因
        maxTokens: 4096,
      });

      // #[20260830-1956]：宽松解析，截断产生的最后一个不完整工艺单元被跳过
      const steps = parseLlmJsonArray(response.text);
      if (steps) {
        return steps.filter((s: any) => s?.step && s?.name);
      }

      return [];
    } catch (error) {
      Logger.error('[ProposalEnhancer] 工艺流程增强失败:', error);
      return [];
    }
  }

  /**
   * 增强设备配置（使用 DeepSeek + Coze）
   */
  private async enhanceEquipmentConfig(
    context: ProposalContext,
    proposal: string,
    _enableMarketDataenableMarketData: boolean
  ): Promise<EquipmentConfig[]> {
    Logger.info('[ProposalEnhancer] 增强设备配置');

    try {
      if (!process.env.DEEPSEEK_API_KEY) {
        return [];
      }

      const systemPrompt = `你是一个污水处理设备配置专家。根据项目上下文和原始方案，生成完整的设备配置清单。

## 输出格式（JSON）：
[
  {
    "id": "设备唯一标识",
    "name": "设备名称",
    "category": "设备类别（预处理/生化/深度处理/控制/辅助）",
    "model": "型号",
    "quantity": 数量,
    "specs": "参数描述",
    "power": 功率（kW）,
    "price": 预估价格（元）,
    "remarks": "备注说明"
  }
]

设备类别参考：
- 预处理：格栅、调节池、沉砂池、筛网等
- 生化：曝气系统、沉淀池、反应池、膜生物反应器等
- 深度处理：过滤、消毒、膜处理、活性炭吸附等
- 控制：PLC、仪表、阀门、传感器等
- 辅助：泵、风机、加药设备、管道、支架等

**重要要求**：
1. 必须生成完整的设备清单，包括所有主项和分项设备
2. 严禁节选或省略设备，必须全面覆盖整个工艺流程
3. 每个类别都要完整列出所有设备，包括小配件
4. 设备数量要充足，根据项目规模合理配置
5. 设备清单要清晰明了，让人一目了然

请只输出 JSON，不要包含其他说明文字。`;

      const userPrompt = `项目类型：${context.projectType}
处理规模：${context.capacity} 吨/天
工艺类型：${context.processType || '智能推荐'}
预算：${context.budget ? context.budget + ' 万元' : '未指定'}

原始方案：
${proposal}

请生成完整的设备配置清单，包括所有主项和分项设备，确保覆盖整个工艺流程。要求：
1. 设备要完整、详细，包括预处理、生化处理、深度处理、控制系统、辅助设备等所有环节
2. 每个设备都要有明确的型号、规格参数、数量、功率
3. 按类别分组展示，让人一目了然
4. **设备清单要全面完整，绝对不能有遗漏，绝对不能节选**
5. **必须包含所有设备，包括大型设备、小型设备、配件、管道、阀门、仪表等**
6. 根据项目规模，至少包含100项以上的设备（主项+分项）
7. 每个类别下的设备都要完整列出，不能省略
8. 这是商务沟通的核心内容，必须完整、准确、清晰`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        maxTokens: 16384,
      });

      // #[20260830-1956]：宽松解析，畸形/截断设备条目按个跳过
      const equipment = parseLlmJsonArray(response.text);
      if (equipment) {
        return equipment.filter((e: any) => e?.id && e?.name && Number(e?.quantity) > 0);
      }

      return [];
    } catch (error) {
      Logger.error('[ProposalEnhancer] 设备配置增强失败:', error);
      return [];
    }
  }

  /**
   * 生成成本分析
   */
  private async generateCostAnalysis(
    context: ProposalContext,
    equipmentConfig: EquipmentConfig[]
  ): Promise<CostAnalysis> {
    Logger.info('[ProposalEnhancer] 生成成本分析');

    try {
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error('DeepSeek 不可用');
      }

      // 计算设备总费用
      const equipmentCost = equipmentConfig.reduce((sum, e) => sum + (e.price || 0), 0);

      // 基于行业经验估算其他费用
      const civilWorkCost = Math.round(equipmentCost * 0.4); // 土建费用约占40%
      const installationCost = Math.round(equipmentCost * 0.15); // 安装费用约占15%
      const otherCost = Math.round(equipmentCost * 0.1); // 其他费用约占10%
      const totalCapitalCost = equipmentCost + civilWorkCost + installationCost + otherCost;

      // 运营成本估算
      const powerCost = Math.round(context.capacity * 0.5 * 365); // 电费估算
      const chemicalCost = Math.round(context.capacity * 0.3 * 365); // 药剂费估算
      const laborCost = Math.round(context.capacity * 0.2 * 365); // 人工费估算
      const maintenanceCost = Math.round(totalCapitalCost * 0.02); // 维护费约占投资2%
      const totalOperatingCost = powerCost + chemicalCost + laborCost + maintenanceCost;
      const unitCost = Math.round(totalOperatingCost / (context.capacity * 365));

      return {
        capitalCost: {
          equipmentCost,
          civilWorkCost,
          installationCost,
          otherCost,
          total: totalCapitalCost,
        },
        operatingCost: {
          powerCost,
          chemicalCost,
          laborCost,
          maintenanceCost,
          total: totalOperatingCost,
          unitCost,
        },
      };
    } catch (error) {
      Logger.error('[ProposalEnhancer] 成本分析生成失败:', error);
      return {
        capitalCost: {
          equipmentCost: 0,
          civilWorkCost: 0,
          installationCost: 0,
          otherCost: 0,
          total: 0,
        },
        operatingCost: {
          powerCost: 0,
          chemicalCost: 0,
          laborCost: 0,
          maintenanceCost: 0,
          total: 0,
          unitCost: 0,
        },
      };
    }
  }

  /**
   * 生成实施指导
   */
  private async generateImplementationGuide(
    context: ProposalContext
  ): Promise<ImplementationGuide> {
    Logger.info('[ProposalEnhancer] 生成实施指导');

    try {
      if (!process.env.DEEPSEEK_API_KEY) {
        return { phase: '', steps: [] };
      }

      const systemPrompt = `你是一个污水处理项目实施专家。根据项目上下文，生成详细的实施指导。

## 输出格式（JSON）：
{
  "phase": "项目阶段",
  "steps": [
    {
      "task": "任务名称",
      "duration": "工期",
      "requirements": ["要求1", "要求2"],
      "notes": "注意事项"
    }
  ]
}

请只输出 JSON，不要包含其他说明文字。`;

      const userPrompt = `项目类型：${context.projectType}
处理规模：${context.capacity} 吨/天
地点：${context.location || '未指定'}

请生成详细的实施指导（包含前期准备、设备采购、土建施工、设备安装、调试运行等阶段）。`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.5,
        maxTokens: 2048,
      });

      // #[20260830-1956]：结构校验。旧实现直接返回 LLM 原始对象，缺 steps 字段时
      //   assembleEnhancedProposal 读 implementationGuide.steps.length 抛 TypeError
      //   → 整个 /api/proposal/enhance 500（跑满 120s 零产出）
      const parsed = parseLlmJsonObject(response.text);
      if (parsed) {
        const steps = Array.isArray(parsed.steps)
          ? parsed.steps
              .filter((s: any) => s && asText(s.task))
              .map((s: any) => ({
                task: asText(s.task),
                duration: asText(s.duration),
                requirements: Array.isArray(s.requirements)
                  ? s.requirements.filter((r: unknown) => typeof r === 'string')
                  : undefined,
                notes: asText(s.notes) || undefined,
              }))
          : [];
        return { phase: asText(parsed.phase), steps };
      }

      return { phase: '', steps: [] };
    } catch (error) {
      Logger.error('[ProposalEnhancer] 实施指导生成失败:', error);
      return { phase: '', steps: [] };
    }
  }

  /**
   * 生成运营建议
   */
  private async generateOperationAdvice(context: ProposalContext): Promise<OperationAdvice> {
    Logger.info('[ProposalEnhancer] 生成运营建议');

    try {
      if (!process.env.DEEPSEEK_API_KEY) {
        throw new Error('DeepSeek 不可用');
      }

      const systemPrompt = `你是一个污水处理运营专家。根据项目上下文，生成详细的运营建议。

## 输出格式（JSON）：
{
  "startup": "启动指导（100-200字）",
  "routineOperation": "日常操作要点（100-200字）",
  "maintenance": "维护保养建议（100-200字）",
  "troubleshooting": "常见故障排查（100-200字）",
  "safetyMeasures": "安全措施（100-200字）"
}

请只输出 JSON，不要包含其他说明文字。`;

      const userPrompt = `项目类型：${context.projectType}
处理规模：${context.capacity} 吨/天
工艺类型：${context.processType || 'A/O工艺'}

请生成详细的运营建议（包含启动、日常操作、维护、故障排查、安全等方面）。`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        maxTokens: 2048,
      });

      // #[20260830-1956]：结构校验，非字符串字段统一转空串，交由下游 fallback 文案兜底
      const parsed = parseLlmJsonObject(response.text);
      if (parsed) {
        return {
          startup: asText(parsed.startup),
          routineOperation: asText(parsed.routineOperation),
          maintenance: asText(parsed.maintenance),
          troubleshooting: asText(parsed.troubleshooting),
          safetyMeasures: asText(parsed.safetyMeasures),
        };
      }

      throw new Error('解析失败');
    } catch (error) {
      Logger.error('[ProposalEnhancer] 运营建议生成失败:', error);
      return {
        startup: '按设计参数逐步启动，先单机调试，再联动调试。',
        routineOperation: '定期监测进出水水质，调整工艺参数。',
        maintenance: '按设备说明书定期维护保养。',
        troubleshooting: '出现异常立即排查原因，及时处理。',
        safetyMeasures: '严格遵守安全操作规程，佩戴防护装备。',
      };
    }
  }

  /**
   * 生成风险评估
   */
  private async generateRiskAssessment(context: ProposalContext): Promise<RiskAssessment> {
    Logger.info('[ProposalEnhancer] 生成风险评估');

    try {
      if (!process.env.DEEPSEEK_API_KEY) {
        return { risks: [] };
      }

      const systemPrompt = `你是一个污水处理项目风险评估专家。根据项目上下文，生成详细的风险评估。

## 输出格式（JSON）：
{
  "risks": [
    {
      "category": "风险类别",
      "description": "风险描述",
      "probability": "high|medium|low",
      "impact": "high|medium|low",
      "mitigation": "应对措施"
    }
  ]
}

风险类别参考：
- 技术风险
- 质量风险
- 进度风险
- 成本风险
- 环保风险
- 安全风险

请只输出 JSON，不要包含其他说明文字。`;

      const userPrompt = `项目类型：${context.projectType}
处理规模：${context.capacity} 吨/天
工艺类型：${context.processType || 'A/O工艺'}

请生成详细的风险评估（至少5个风险，覆盖不同类别）。`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        maxTokens: 2048,
      });

      // #[20260830-1956]：结构校验，risks 非数组时降级为空（避免下游 .length 崩溃）
      const parsed = parseLlmJsonObject(response.text);
      if (parsed) {
        const risks = Array.isArray(parsed.risks)
          ? parsed.risks.filter((r: any) => r && asText(r.category) && asText(r.description))
          : [];
        return { risks };
      }

      return { risks: [] };
    } catch (error) {
      Logger.error('[ProposalEnhancer] 风险评估生成失败:', error);
      return { risks: [] };
    }
  }

  /**
   * 生成优化建议
   */
  private async generateOptimizationSuggestions(
    context: ProposalContext,
    proposal: string
  ): Promise<
    Array<{
      category: string;
      description: string;
      benefit: string;
      priority: 'high' | 'medium' | 'low';
    }>
  > {
    Logger.info('[ProposalEnhancer] 生成优化建议');

    try {
      if (!process.env.DEEPSEEK_API_KEY) {
        return [];
      }

      const systemPrompt = `你是一个污水处理方案优化专家。根据项目上下文和原始方案，生成优化建议。

## 输出格式（JSON）：
[
  {
    "category": "优化类别",
    "description": "优化描述（50-100字）",
    "benefit": "预期效益（30-50字）",
    "priority": "high|medium|low"
  }
]

优化类别参考：
- 技术优化
- 经济优化
- 运营优化
- 环保优化
- 智能化升级

请只输出 JSON，不要包含其他说明文字。`;

      const userPrompt = `项目类型：${context.projectType}
处理规模：${context.capacity} 吨/天
工艺类型：${context.processType || 'A/O工艺'}
预算：${context.budget ? context.budget + ' 万元' : '未指定'}

原始方案：
${proposal}

请生成优化建议（至少3条，涵盖不同类别，包括技术、经济、运营等方面的优化）。`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        maxTokens: 2048,
      });

      // #[20260830-1956]：宽松解析，畸形/截断条目按个跳过
      const suggestions = parseLlmJsonArray(response.text);
      if (suggestions) {
        return suggestions.filter((s: any) => s?.category && s?.description);
      }

      return [];
    } catch (error) {
      Logger.error('[ProposalEnhancer] 优化建议生成失败:', error);
      return [];
    }
  }

  /**
   * 组装增强后的方案
   */
  private assembleEnhancedProposal(
    context: ProposalContext,
    originalProposal: string,
    technicalParams: TechnicalParameter[],
    processFlow: ProcessStep[],
    equipmentConfig: EquipmentConfig[],
    costAnalysis?: CostAnalysis,
    implementationGuide?: ImplementationGuide,
    operationAdvice?: OperationAdvice,
    riskAssessment?: RiskAssessment,
    optimizationSuggestions?: any[],
    knowledgeReferences?: KnowledgeMatchResult[]
  ): string {
    let enhanced = originalProposal;

    // 添加技术参数部分
    if (technicalParams.length > 0) {
      enhanced += '\n\n## 📊 技术参数\n\n';

      const categories = {
        influuent: '进水水质参数',
        process: '工艺运行参数',
        effluent: '出水水质参数',
        equipment: '设备技术参数',
      };

      Object.entries(categories).forEach(([key, label]) => {
        const params = technicalParams.filter((p) => p.category === key);
        if (params.length > 0) {
          enhanced += `### ${label}\n\n`;
          enhanced += '| 参数名称 | 数值 | 单位 | 说明 |\n';
          enhanced += '|---------|------|------|------|\n';
          params.forEach((p) => {
            enhanced += `| ${p.name} | ${p.value} | ${p.unit || '-'} | ${p.description || '-'} |\n`;
          });
          enhanced += '\n';
        }
      });
    }

    // 添加工艺流程部分
    if (processFlow.length > 0) {
      enhanced += '\n## 🔄 工艺流程\n\n';
      processFlow.forEach((step) => {
        enhanced += `### 步骤 ${step.step}: ${step.name}\n\n`;
        enhanced += `${step.description}\n\n`;

        if (step.duration) {
          enhanced += `**停留时间**: ${step.duration} 小时\n\n`;
        }

        if (step.equipment && step.equipment.length > 0) {
          enhanced += '**设备配置**:\n\n';
          step.equipment.forEach((eq) => {
            enhanced += `- ${eq.name} (数量: ${eq.quantity}`;
            if (eq.model) enhanced += `, 型号: ${eq.model}`;
            if (eq.specs) enhanced += `, 规格: ${eq.specs}`;
            enhanced += ')\n';
          });
          enhanced += '\n';
        }

        if (step.parameters && step.parameters.length > 0) {
          enhanced += '**运行参数**:\n\n';
          enhanced += '| 参数 | 数值 | 单位 | 说明 |\n';
          enhanced += '|------|------|------|------|\n';
          step.parameters.forEach((p) => {
            enhanced += `| ${p.name} | ${p.value} | ${p.unit || '-'} | ${p.description || '-'} |\n`;
          });
          enhanced += '\n';
        }

        if (step.notes) {
          enhanced += `**注意事项**: ${step.notes}\n\n`;
        }
      });
    }

    // 添加设备配置部分
    if (equipmentConfig.length > 0) {
      enhanced += '\n## ⚙️ 设备配置清单\n\n';

      const categories = {} as Record<string, EquipmentConfig[]>;
      equipmentConfig.forEach((e) => {
        if (!categories[e.category]) {
          categories[e.category] = [];
        }
        categories[e.category].push(e);
      });

      Object.entries(categories).forEach(([category, items]) => {
        enhanced += `### ${category}\n\n`;
        enhanced += '| 序号 | 设备名称 | 型号 | 数量 | 规格 | 功率 | 预估价格 | 备注 |\n';
        enhanced += '|------|---------|------|------|------|------|---------|------|\n';
        items.forEach((e, idx) => {
          enhanced += `| ${idx + 1} | ${e.name} | ${e.model || '-'} | ${e.quantity} | ${e.specs || '-'} | ${e.power || '-'} kW | ${e.price || '-'} 元 | ${e.remarks || '-'} |\n`;
        });
        enhanced += '\n';
      });

      const totalQty = equipmentConfig.reduce((sum, e) => sum + e.quantity, 0);
      const totalPrice = equipmentConfig.reduce((sum, e) => sum + (e.price || 0), 0);
      enhanced += `**设备总计**: ${equipmentConfig.length} 种，${totalQty} 台/套\n`;
      enhanced += `**设备总费用**: ${(totalPrice / 10000).toFixed(2)} 万元\n\n`;
    }

    // 添加成本分析部分
    if (costAnalysis) {
      enhanced += '\n## 💰 成本分析\n\n';

      enhanced += '### 投资成本\n\n';
      enhanced += '| 项目 | 金额（万元） | 占比 |\n';
      enhanced += '|------|-------------|------|\n';
      const { capitalCost } = costAnalysis;
      const total = capitalCost.total;
      enhanced += `| 设备费用 | ${(capitalCost.equipmentCost / 10000).toFixed(2)} | ${((capitalCost.equipmentCost / total) * 100).toFixed(1)}% |\n`;
      enhanced += `| 土建费用 | ${(capitalCost.civilWorkCost / 10000).toFixed(2)} | ${((capitalCost.civilWorkCost / total) * 100).toFixed(1)}% |\n`;
      enhanced += `| 安装费用 | ${(capitalCost.installationCost / 10000).toFixed(2)} | ${((capitalCost.installationCost / total) * 100).toFixed(1)}% |\n`;
      enhanced += `| 其他费用 | ${(capitalCost.otherCost / 10000).toFixed(2)} | ${((capitalCost.otherCost / total) * 100).toFixed(1)}% |\n`;
      enhanced += `| **总投资** | **${(total / 10000).toFixed(2)}** | **100%** |\n\n`;

      enhanced += '### 运营成本\n\n';
      enhanced += '| 项目 | 年费用（万元） | 吨水成本（元/吨） |\n';
      enhanced += '|------|---------------|----------------|\n';
      const { operatingCost } = costAnalysis;
      enhanced += `| 电费 | ${(operatingCost.powerCost / 10000).toFixed(2)} | ${(operatingCost.powerCost / (context.capacity * 365)).toFixed(2)} |\n`;
      enhanced += `| 药剂费 | ${(operatingCost.chemicalCost / 10000).toFixed(2)} | ${(operatingCost.chemicalCost / (context.capacity * 365)).toFixed(2)} |\n`;
      enhanced += `| 人工费 | ${(operatingCost.laborCost / 10000).toFixed(2)} | ${(operatingCost.laborCost / (context.capacity * 365)).toFixed(2)} |\n`;
      enhanced += `| 维护费 | ${(operatingCost.maintenanceCost / 10000).toFixed(2)} | ${(operatingCost.maintenanceCost / (context.capacity * 365)).toFixed(2)} |\n`;
      enhanced += `| **年总成本** | **${(operatingCost.total / 10000).toFixed(2)}** | **${operatingCost.unitCost.toFixed(2)}** |\n\n`;
    }

    // 添加实施指导部分
    // #[20260830-1956]：数组守卫，任一维度结构异常只跳过该章节，不中断整份方案
    if (Array.isArray(implementationGuide?.steps) && implementationGuide.steps.length > 0) {
      enhanced += '\n## 📋 实施指导\n\n';
      enhanced += `### ${implementationGuide.phase}\n\n`;
      implementationGuide.steps.forEach((step) => {
        enhanced += `#### ${step.task}\n\n`;
        enhanced += `**工期**: ${step.duration}\n\n`;
        if (step.requirements && step.requirements.length > 0) {
          enhanced += '**要求**:\n\n';
          step.requirements.forEach((req) => {
            enhanced += `- ${req}\n`;
          });
          enhanced += '\n';
        }
        if (step.notes) {
          enhanced += `**注意事项**: ${step.notes}\n\n`;
        }
      });
    }

    // 添加运营建议部分
    if (operationAdvice && operationAdvice.startup) {
      enhanced += '\n## 🔧 运营建议\n\n';
      enhanced += `### 启动指导\n\n${operationAdvice.startup}\n\n`;
      enhanced += `### 日常操作\n\n${operationAdvice.routineOperation}\n\n`;
      enhanced += `### 维护保养\n\n${operationAdvice.maintenance}\n\n`;
      enhanced += `### 故障排查\n\n${operationAdvice.troubleshooting}\n\n`;
      enhanced += `### 安全措施\n\n${operationAdvice.safetyMeasures}\n\n`;
    }

    // 添加风险评估部分
    if (Array.isArray(riskAssessment?.risks) && riskAssessment.risks.length > 0) {
      enhanced += '\n## ⚠️ 风险评估\n\n';
      enhanced += '| 风险类别 | 风险描述 | 发生概率 | 影响程度 | 应对措施 |\n';
      enhanced += '|---------|---------|---------|---------|---------|\n';
      riskAssessment.risks.forEach((risk) => {
        const probEmoji =
          risk.probability === 'high' ? '🔴' : risk.probability === 'medium' ? '🟡' : '🟢';
        const impactEmoji = risk.impact === 'high' ? '🔴' : risk.impact === 'medium' ? '🟡' : '🟢';
        enhanced += `| ${risk.category} | ${risk.description} | ${probEmoji} ${risk.probability} | ${impactEmoji} ${risk.impact} | ${risk.mitigation} |\n`;
      });
      enhanced += '\n';
    }

    // 添加优化建议部分
    if (optimizationSuggestions && optimizationSuggestions.length > 0) {
      enhanced += '\n## 💡 优化建议\n\n';
      optimizationSuggestions.forEach((s, idx) => {
        const priorityEmoji = s.priority === 'high' ? '🔴' : s.priority === 'medium' ? '🟡' : '🟢';
        enhanced += `${idx + 1}. ${priorityEmoji} **${s.category}**: ${s.description}\n\n`;
        enhanced += `   💎 **预期效益**: ${s.benefit}\n\n`;
      });
    }

    // 知识库参考资料（#20260822-2242 指令 3/3）
    if (knowledgeReferences && knowledgeReferences.length > 0) {
      enhanced += '\n## 📚 参考资料\n\n';
      const typeLabels: Record<string, string> = {
        document: '技术文档',
        case: '案例',
        standard: '标准规范',
        drawing: '图纸图片',
        quota: '定额库',
      };
      knowledgeReferences.forEach((ref, idx) => {
        const typeLabel = typeLabels[ref.type] || ref.type;
        enhanced += `${idx + 1}. 《${ref.title}》（${typeLabel}，相关度 ${ref.relevance_score}%）\n`;
        const summary = ref.summary || ref.content_preview;
        if (summary) enhanced += `   ${summary.slice(0, 120)}\n`;
        enhanced += '\n';
      });
    }

    return enhanced;
  }

  // ==========================================================================
  // 完整 10 章节技术方案生成（#[20260827-1030]-2）
  // ==========================================================================

  /**
   * 生成完整 10 章节技术方案 + 报价 + 可视化数据
   */
  async generateCompleteProposal(
    context: ProposalContext,
    originalProposal: string,
    options: CompleteProposalOptions = {}
  ): Promise<EnhancedProposalResult> {
    const {
      supplierInfo,
      includeCharts = true,
      includeDiagram = true,
      ...enhanceOptions
    } = options;

    const effectiveSupplier: ProposalSupplierInfo =
      supplierInfo || context.supplierInfo || this.buildFallbackSupplier(context);

    // 1. 调用现有增强器获取全部增强数据
    const enhanced = await this.enhanceProposal(context, originalProposal, enhanceOptions);

    // 2. 清洗所有 LLM 文本中的推诿语句
    const cleanEnhanced = this.cleanEnhancedProposal(enhanced);

    // 3. 构建 10 章节
    const sections = this.buildCompleteSections(context, originalProposal, cleanEnhanced, effectiveSupplier);

    // 4. 完整 Markdown
    const markdown = this.assembleCompleteMarkdown(context, sections, effectiveSupplier, cleanEnhanced);

    // 5. 可视化数据（工艺流程图 + 图表 + AI 配图）
    const mermaidSource = includeDiagram
      ? buildProcessFlowMermaid(this.toFlowSteps(cleanEnhanced.processFlow))
      : '';

    const chartData = this.buildChartData(cleanEnhanced);

    const images = generateEquipmentImages(
      cleanEnhanced.equipmentConfig.slice(0, 6).map((e) => ({
        name: e.name,
        model: e.model,
        specs: e.specs,
      }))
    );

    // 6. 报价与条款
    const quoteItems = this.buildQuoteItems(cleanEnhanced);
    const spareParts = this.buildSpareParts(cleanEnhanced.equipmentConfig);
    const designCalculations = this.buildDesignCalculations(context, cleanEnhanced);
    const paymentTerms = this.buildPaymentTerms(context);
    const serviceTerms = this.buildServiceTerms();
    const warrantyTerms = this.buildWarrantyTerms();

    const totalAmount =
      cleanEnhanced.costAnalysis?.capitalCost?.total ??
      quoteItems.reduce((sum, it) => sum + (it.totalPrice || 0), 0);

    return {
      proposalId: `FA-${Date.now().toString(36).toUpperCase()}`,
      title: this.buildProposalTitle(context),
      projectName: this.buildProjectName(context),
      projectType: context.projectType,
      capacity: context.capacity || 0,
      supplierInfo: effectiveSupplier,
      sections,
      markdown,
      mermaidSource,
      chartData,
      images,
      quoteItems,
      spareParts,
      designCalculations,
      paymentTerms,
      serviceTerms,
      warrantyTerms,
      totalAmount,
      confidence: cleanEnhanced.confidence,
      generatedAt: new Date().toISOString(),
    };
  }

  /** 清洗增强结果中的推诿语句 */
  private cleanEnhancedProposal(enhanced: EnhancedProposal): EnhancedProposal {
    const cleanText = (t?: string) => sanitizePushOffStatements(t || '');
    return {
      ...enhanced,
      enhancedProposal: cleanText(enhanced.enhancedProposal),
      implementationGuide: enhanced.implementationGuide,
      operationAdvice: {
        startup: cleanText(enhanced.operationAdvice.startup),
        routineOperation: cleanText(enhanced.operationAdvice.routineOperation),
        maintenance: cleanText(enhanced.operationAdvice.maintenance),
        troubleshooting: cleanText(enhanced.operationAdvice.troubleshooting),
        safetyMeasures: cleanText(enhanced.operationAdvice.safetyMeasures),
      },
      riskAssessment: {
        risks: (enhanced.riskAssessment.risks || []).map((r) => ({
          ...r,
          description: cleanText(r.description),
          mitigation: cleanText(r.mitigation),
        })),
      },
      optimizationSuggestions: (enhanced.optimizationSuggestions || []).map((s) => ({
        ...s,
        description: cleanText(s.description),
        benefit: cleanText(s.benefit),
      })),
    };
  }

  /** 工艺步骤转换为流程图数据 */
  private toFlowSteps(steps: ProcessStep[]): ProposalProcessFlowStep[] {
    return (steps || [])
      .sort((a, b) => a.step - b.step)
      .map((s) => ({
        step: s.step,
        name: s.name,
        description: s.description,
        keyParams:
          s.parameters
            ?.filter((p) => p.value !== undefined && p.value !== null)
            .slice(0, 3)
            .map((p) => `${p.name}${p.value}${p.unit || ''}`)
            .join('，') || s.notes,
      }));
  }

  // --------------------------------------------------------------------------
  // 章节构建
  // --------------------------------------------------------------------------

  private buildCompleteSections(
    context: ProposalContext,
    originalProposal: string,
    enhanced: EnhancedProposal,
    supplier: ProposalSupplierInfo
  ): ProposalSection[] {
    const sections: ProposalSection[] = [];

    sections.push(this.buildChapterOverview(context, originalProposal));
    sections.push(this.buildChapterConditions(context));
    sections.push(this.buildChapterProcess(context, enhanced));
    sections.push(this.buildChapterEquipment(enhanced));
    sections.push(this.buildChapterElectrical(enhanced));
    sections.push(this.buildChapterInstallation(enhanced));
    sections.push(this.buildChapterCommissioning(context, enhanced));
    sections.push(this.buildChapterOperation(enhanced));
    sections.push(this.buildChapterQuote(context, enhanced, supplier));
    sections.push(this.buildChapterAppendix(context, enhanced));

    return sections;
  }

  /** 第一章 项目概述 */
  private buildChapterOverview(context: ProposalContext, originalProposal: string): ProposalSection {
    const type = context.projectType || '污水处理';
    const capacity = context.capacity || 0;
    const location = context.location || '项目现场';
    const standards = this.getDesignStandards(context);

    const content = [
      `## 1.1 工程背景`,
      ``,
      `本工程为${location}${type}处理工程，处理规模为 **${capacity} m³/d**。项目旨在通过成熟可靠的处理工艺，对${type}进行达标处理，实现**稳定达标排放、资源化回用、降低运行成本**的总体目标。`,
      ``,
      `工程范围涵盖：预处理系统、主体处理单元、深度处理系统、污泥处理系统、电气与自动化控制系统、配套土建及管路系统，以及系统的安装、调试、试运行与操作培训。`,
      ``,
      `## 1.2 设计依据`,
      ``,
      `本方案依据以下标准、规范及文件编制：`,
      ``,
      standards.map((s) => `- ${s}`).join('\n'),
      ``,
      `## 1.3 设计规模`,
      ``,
      `- **设计处理规模**：${capacity} m³/d（${(capacity / 24).toFixed(1)} m³/h，按 24h 连续运行计）`,
      `- **变化系数**：日变化系数 Kd=1.2，时变化系数 Kh=1.4`,
      `- **运行时间**：24 h/d 连续运行`,
      ``,
      `## 1.4 设计目标`,
      ``,
      `1. 处理出水水质稳定达到国家及地方现行排放标准要求；`,
      `2. 系统实现全自动运行、少人值守，降低运行成本；`,
      `3. 选用节能设备与工艺，吨水处理电耗及药耗经济合理；`,
      `4. 系统具备完善的应急保障措施，保证运行安全性；`,
      `5. 工程实施满足工期要求，施工与运行互不干扰。`,
    ].join('\n');

    return {
      id: '01',
      title: '项目概述',
      summary: `工程背景、设计依据、设计规模与设计目标`,
      content,
    };
  }

  /** 第二章 项目条件分析 */
  private buildChapterConditions(context: ProposalContext): ProposalSection {
    const influent = context.influentQuality || {};
    const effluent = context.effluentStandards || {};
    const hasInfluent = Object.keys(influent).length > 0;
    const hasEffluent = Object.keys(effluent).length > 0;

    const paramLabels: Record<string, string> = {
      cod: 'CODcr (mg/L)',
      bod5: 'BOD5 (mg/L)',
      ss: 'SS (mg/L)',
      nh3n: 'NH3-N (mg/L)',
      tn: 'TN (mg/L)',
      tp: 'TP (mg/L)',
      ph: 'pH',
      ph_high: 'pH上限',
      ph_low: 'pH下限',
    };

    const lines: string[] = ['## 2.1 水质特性分析', ''];
    if (hasInfluent) {
      lines.push('### 2.1.1 进水水质');
      lines.push('');
      lines.push('| 水质指标 | 设计取值 |');
      lines.push('|---------|---------|');
      Object.entries(influent).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        lines.push(`| ${paramLabels[k] || k} | ${v} |`);
      });
      lines.push('');
    } else {
      lines.push('> 进水水质参数未提供时，系统按同类${type}典型水质取值，并预留 15% 设计余量，确保系统适应水质波动。');
      lines.push('');
    }

    lines.push('### 2.1.2 泥浆特性分析（适用泥浆水/高悬浮物废水）');
    lines.push('');
    lines.push('泥浆类废水具有以下典型特性：');
    lines.push('');
    lines.push('- **高悬浮物（SS）**：泥浆废水 SS 含量高，需强化预处理（沉淀、浓缩）降低后续负荷；');
    lines.push('- **高浊度**：胶体颗粒细小且带负电，需投加絮凝剂（PAM/PAC）破坏胶体稳定；');
    lines.push('- **pH 波动**：部分泥浆水呈碱性或含药剂残留，需设 pH 调节单元；');
    lines.push('- **泥沙沉积**：管道及构筑物易积泥，需考虑防堵与冲洗设计；');
    lines.push('- **泥量占比高**：污泥产量大，需配套脱水减容与合规处置。');
    lines.push('');

    if (hasEffluent) {
      lines.push('### 2.1.3 出水标准');
      lines.push('');
      lines.push('| 水质指标 | 排放限值 |');
      lines.push('|---------|---------|');
      Object.entries(effluent).forEach(([k, v]) => {
        if (v === undefined || v === null) return;
        lines.push(`| ${paramLabels[k] || k} | ${v} |`);
      });
      lines.push('');
    }

    lines.push('## 2.2 现场条件分析');
    lines.push('');
    lines.push(`- **工程地点**：${context.location || '待业主确认'}`);
    lines.push('- **场地条件**：设备间拟采用集装箱式/钢构厂房布置，占地紧凑，按"功能分区、管线最短"原则优化；');
    lines.push('- **气候条件**：设备选型考虑当地气温与冻融影响，室外管路做保温处理；');
    lines.push('- **电源条件**：系统采用三相 380V/50Hz 电源，总装机容量按设备清单核算；');
    lines.push('');

    lines.push('## 2.3 用户需求分析');
    lines.push('');
    const reqs = context.requirements?.length ? context.requirements : [
      '处理出水达标排放或回用',
      '系统运行稳定、自动化程度高、维护简便',
      '总投资与运行成本经济合理',
      '施工工期满足项目总体进度',
    ];
    reqs.forEach((r, i) => lines.push(`${i + 1}. ${r}`));
    lines.push('');

    return {
      id: '02',
      title: '项目条件分析',
      summary: `水质/泥浆特性、现场条件与用户需求`,
      content: lines.join('\n'),
    };
  }

  /** 第三章 工艺方案设计 */
  private buildChapterProcess(context: ProposalContext, enhanced: EnhancedProposal): ProposalSection {
    const type = context.projectType || '污水处理';
    const capacity = context.capacity || 0;
    const processType = context.processType || (enhanced.technicalParameters.find((p) => p.category === 'process')?.description) || '以实际设计为准';
    const steps = this.toFlowSteps(enhanced.processFlow);
    const processParams = enhanced.technicalParameters.filter((p) => p.category === 'process');

    const lines: string[] = [
      `## 3.1 工艺路线对比与选择`,
      ``,
      `针对${type}的处理要求，结合进水水质、出水标准、占地条件及投资运行成本，对以下三种主流工艺路线进行综合比选：`,
      ``,
      `| 比选项目 | 工艺方案一：混凝沉淀+过滤 | 工艺方案二：A/O（缺氧/好氧）生化 | 工艺方案三：MBR 膜生物反应器 |`,
      `|---------|----------------------|--------------------------|--------------------------|`,
      `| 出水水质 | 去除 SS 及部分 COD，达标常规指标 | 同步脱氮除磷，出水良好 | 出水最优，SS≈0，可回用 |`,
      `| 运行稳定性 | 高，抗冲击负荷强 | 较高，需关注污泥膨胀 | 高，膜系统自动控制 |`,
      `| 占地 | 小 | 较大 | 最小（集约化） |`,
      `| 投资成本 | 低 | 中 | 较高 |`,
      `| 运行成本 | 低 | 中 | 中高（膜清洗与更换） |`,
      `| 自动化程度 | 中 | 中 | 高 |`,
      ``,
      `**综合结论**：本工程推荐采用工艺路线为：**预处理 → 主处理单元（A/O 生化或混凝沉淀，按水质确定）→ 深度处理 → 消毒 → 出水**${processType ? `，主工艺确定为 ${processType}` : ''}。该路线在保证出水达标的前提下，兼顾投资与运行成本的经济性，且系统运行灵活、便于分期扩容。`,
      ``,
      `## 3.2 详细工艺流程`,
      ``,
    ];

    if (steps.length > 0) {
      lines.push('| 序号 | 工艺单元 | 功能说明 | 关键参数 |');
      lines.push('|------|---------|---------|---------|');
      steps.forEach((s) => {
        lines.push(`| ${s.step} | ${s.name} | ${s.description} | ${s.keyParams || '-'} |`);
      });
      lines.push('');
    }

    lines.push('```mermaid');
    lines.push(buildProcessFlowMermaid(steps));
    lines.push('```');
    lines.push('');

    lines.push(`## 3.3 关键工艺参数`);
    lines.push('');
    if (processParams.length > 0) {
      lines.push('| 参数名称 | 设计取值 | 单位 | 说明 |');
      lines.push('|---------|---------|------|------|');
      processParams.forEach((p) => {
        lines.push(`| ${p.name} | ${p.value} | ${p.unit || '-'} | ${p.description || '-'} |`);
      });
      lines.push('');
    } else {
      lines.push(`系统各单元停留时间、表面负荷、回流比等关键参数按《室外排水设计标准》（GB 50014）取值，并在调试阶段根据实际水质优化。`);
      lines.push('');
    }

    // 物料平衡计算
    lines.push(`## 3.4 物料平衡计算`);
    lines.push('');
    const Q = capacity;
    if (Q > 0) {
      const codIn = context.influentQuality?.cod ?? 0;
      const codOut = context.effluentStandards?.cod ?? 0;
      const ssIn = context.influentQuality?.ss ?? 0;
      const ssOut = context.effluentStandards?.ss ?? 0;
      const nh3nIn = context.influentQuality?.nh3n ?? 0;
      const nh3nOut = context.effluentStandards?.nh3n ?? 0;
      lines.push(`以设计规模 Q=${Q} m³/d 为基准：`);
      lines.push('');
      lines.push('| 污染物 | 进水负荷 (kg/d) | 出水负荷 (kg/d) | 去除量 (kg/d) | 去除率 |');
      lines.push('|--------|----------------|----------------|--------------|--------|');
      [
        { name: 'CODcr', ci: codIn, co: codOut },
        { name: 'SS', ci: ssIn, co: ssOut },
        { name: 'NH3-N', ci: nh3nIn, co: nh3nOut },
      ].forEach((item) => {
        if (item.ci > 0) {
          const loadIn = (item.ci * Q) / 1000;
          const loadOut = (item.co * Q) / 1000;
          const removed = loadIn - loadOut;
          const rate = item.ci > 0 ? (((item.ci - item.co) / item.ci) * 100).toFixed(1) : '0';
          lines.push(`| ${item.name} | ${loadIn.toFixed(1)} | ${loadOut.toFixed(1)} | ${removed.toFixed(1)} | ${rate}% |`);
        }
      });
      lines.push('');
      lines.push('> 注：污染物负荷按设计水质计算，实际运行中根据监测数据复核。');
    } else {
      lines.push('处理规模未提供时，物料平衡按同类工程经验值推算，正式设计阶段按实测水质校核。');
    }

    // 3.5 设计要点与运维要点（#[20260827-1030]-3 由工艺模板提供）
    const tmpl = getProcessTemplate(processType);
    lines.push(`## 3.5 设计要点与运维要点（参考工艺模板：${tmpl.name}）`);
    lines.push('');
    lines.push('**设计要点**：');
    for (const p of tmpl.designPoints) lines.push(`- ${p}`);
    lines.push('');
    lines.push('**运维要点**：');
    for (const p of tmpl.opPoints) lines.push(`- ${p}`);
    lines.push('');
    if (tmpl.expectedRemoval && Object.keys(tmpl.expectedRemoval).length > 0) {
      lines.push('**预期处理效果**：');
      lines.push('');
      lines.push('| 指标 | 预期值 |');
      lines.push('| --- | --- |');
      for (const [k, v] of Object.entries(tmpl.expectedRemoval)) lines.push(`| ${k} | ${v} |`);
      lines.push('');
    }

    return {
      id: '03',
      title: '工艺方案设计',
      summary: `工艺路线比选、详细流程、关键参数与物料平衡`,
      content: lines.join('\n'),
    };
  }

  /** 第四章 设备配置方案 */
  private buildChapterEquipment(enhanced: EnhancedProposal): ProposalSection {
    const equip = enhanced.equipmentConfig || [];

    const lines: string[] = [
      `## 4.1 设备选型依据`,
      ``,
      `1. **工艺匹配**：设备参数满足工艺单元设计工况（流量、扬程、停留时间、负荷等）；`,
      `2. **节能高效**：优先选用一级能效电机、变频调速设备，降低吨水能耗；`,
      `3. **防腐耐用**：接触介质部件采用耐腐蚀材质（304 不锈钢、玻璃钢、PP 等）；`,
      `4. **易维护**：选型考虑检修空间与备件通用性，降低维护成本；`,
      `5. **标准化**：主要设备采用标准化产品，便于更换与升级。`,
      ``,
      `## 4.2 主要设备清单`,
      ``,
    ];

    if (equip.length > 0) {
      lines.push('| 序号 | 设备名称 | 规格型号 | 数量 | 功率(kW) | 备注 |');
      lines.push('|------|---------|---------|------|---------|------|');
      equip.forEach((e, i) => {
        lines.push(`| ${i + 1} | ${e.name} | ${e.model || '-'} | ${e.quantity} | ${e.power ?? '-'} | ${e.remarks || '-'} |`);
      });
      lines.push('');
    } else {
      lines.push('设备配置详见投标设备清单，正式阶段提供选型计算书。');
      lines.push('');
    }

    lines.push(`## 4.3 关键设备技术说明`);
    lines.push('');
    equip.filter((e) => e.power !== undefined && e.power !== null).slice(0, 6).forEach((e, i) => {
      lines.push(`**${i + 1}. ${e.name}**（${e.model || '按选型配置'}）`);
      lines.push('');
      lines.push(`- 数量：${e.quantity} 台/套；单机功率：${e.power} kW${e.specs ? `；技术规格：${e.specs}` : ''}`);
      lines.push(`- 配置冗余：按"一用一备"或"多台并联"原则设置，保证单台检修时系统仍可正常运行；`);
      lines.push(`- 质保与售后：整机质保 12 个月，易损件另备；`); 
      lines.push('');
    });

    if (equip.length > 0) {
      const totalPower = equip.reduce((s, e) => s + (e.power ?? 0) * e.quantity, 0);
      lines.push(`**系统总装机功率约 ${totalPower} kW**，运行负荷系数约 0.6~0.75，实际运行功率以调试实测为准。`);
      lines.push('');
    }

    return {
      id: '04',
      title: '设备配置方案',
      summary: `设备选型依据、技术参数与设备清单`,
      content: lines.join('\n'),
    };
  }

  /** 第五章 电气与自动化控制方案 */
  private buildChapterElectrical(enhanced: EnhancedProposal): ProposalSection {
    const equip = enhanced.equipmentConfig || [];
    const totalPower = equip.reduce((s, e) => s + (e.power ?? 0) * e.quantity, 0);

    return {
      id: '05',
      title: '电气与自动化控制方案',
      summary: `控制系统架构、仪表配置与控制逻辑`,
      content: [
        `## 5.1 控制系统架构`,
        ``,
        `系统采用 **PLC + 触摸屏 + 远程物联网** 三级控制架构：`,
        ``,
        `- **现场级**：各工艺单元设置就地控制箱，支持手动/自动切换；`,
        `- **站控级**：PLC 实现全工艺流程自动控制，触摸屏（HMI）提供流程画面、参数设定、历史曲线与报警记录；`,
        `- **远程级**：通过 4G/5G 物联网网关接入云平台，支持手机端/PC 端远程监视与操控。`,
        ``,
        `## 5.2 电气系统设计`,
        ``,
        `- 供电电源：380V/50Hz 三相五线制，总装机容量约 **${totalPower || '按设备清单核算'} kW**；`,
        `- 配电系统：设总配电柜、各工艺单元配电回路，配置短路、过载、缺相保护；`,
        `- 主要动力设备采用软启动或变频控制（水泵、风机等），降低启动冲击并节能；`,
        `- 所有室外及潮湿区域设备防护等级不低于 IP55，电缆采用阻燃型。`,
        ``,
        `## 5.3 仪表配置`,
        ``,
        `| 测量位置 | 仪表类型 | 作用 |`,
        `|---------|---------|------|`,
        `| 进水口 | 电磁流量计 | 计量处理水量，累计流量 |`,
        `| 调节池 | 液位计 | 控制提升泵启停与联动 |`,
        `| 生化池 | DO 在线仪 | 根据溶解氧自动调节曝气量 |`,
        `| 加药系统 | pH/流量信号 | 联动加药泵按比例投加 |`,
        `| 出水口 | 在线监测（COD/SS 等） | 出水水质监控与达标判定 |`,
        ``,
        `## 5.4 控制逻辑`,
        ``,
        `1. **自动运行**：调节池液位达到高液位自动启动提升泵，低液位自动停机，防止空转；`,
        `2. **曝气联动**：DO 低于设定值增大曝气量，高于设定值减小，实现精确曝气节能；`,
        `3. **加药控制**：按进水流量比例投加，并依据出水指标反馈修正；`,
        `4. **报警保护**：设备故障、液位异常、水质超标自动报警，关键设备故障自动切换备用；`,
        `5. **运行记录**：自动生成运行日志与能耗统计，支持历史数据追溯。`,
      ].join('\n'),
    };
  }

  /** 第六章 安装与施工方案 */
  private buildChapterInstallation(enhanced: EnhancedProposal): ProposalSection {
    const guide = enhanced.implementationGuide;

    const lines: string[] = [
      `## 6.1 施工准备`,
      ``,
      `1. **技术准备**：图纸会审、施工方案交底、材料与设备进场检验；`,
      `2. **现场准备**：场地平整、临时水电接入、临建搭设、施工围挡与警示标识；`,
      `3. **组织准备**：组建项目组，明确施工、安全、质量、资料等岗位职责；`,
      `4. **材料准备**：按施工进度计划分批采购，进场材料报验合格后使用。`,
      ``,
      `## 6.2 安装施工流程`,
      ``,
    ];

    if (Array.isArray(guide?.steps) && guide.steps.length > 0) {
      lines.push('| 阶段 | 工作内容 | 工期 | 要求 |');
      lines.push('|------|---------|------|------|');
      guide.steps.forEach((s) => {
        const step = s as { task: string; duration: string; requirements?: string[]; notes?: string };
        lines.push(`| ${guide.phase || '-'} | ${step.task} | ${step.duration || '-'} | ${step.requirements?.join('；') || step.notes || '-'} |`);
      });
      lines.push('');
    } else {
      lines.push('施工按"土建基础 → 设备安装 → 管道连接 → 电气自控 → 单机调试 → 联动调试"的顺序组织实施，各工序流水穿插、合理搭接。');
      lines.push('');
    }

    lines.push(`## 6.3 施工安全与文明施工措施`);
    lines.push('');
    lines.push(enhanced.operationAdvice.safetyMeasures || '施工期间严格执行安全生产责任制，落实安全交底、持证上岗、临边防护、临时用电管理等制度；现场做到工完料净场地清，噪声、扬尘、废弃物控制符合当地文明施工要求。');
    lines.push('');

    return {
      id: '06',
      title: '安装与施工方案',
      summary: `施工准备、安装流程与安全文明措施`,
      content: lines.join('\n'),
    };
  }

  /** 第七章 调试与验收 */
  private buildChapterCommissioning(context: ProposalContext, enhanced: EnhancedProposal): ProposalSection {
    const type = context.projectType || '污水处理';
    return {
      id: '07',
      title: '调试与验收',
      summary: `调试程序与验收标准`,
      content: [
        `## 7.1 调试程序`,
        ``,
        `调试按"单机调试 → 联动调试 → 清水联动 → 带负荷调试 → 满负荷试运行"五个阶段组织实施：`,
        ``,
        `| 阶段 | 调试内容 | 周期 |`,
        `|------|---------|------|`,
        `| 单机调试 | 各设备空载/负载运行，校核转向、电流、温升、振动 | 3~5 天 |`,
        `| 联动调试 | 按工艺顺序联动，检验信号连锁与联锁保护 | 2~3 天 |`,
        `| 清水联动 | 系统注水循环，检验管路密封、泵组流量扬程 | 3~5 天 |`,
        `| 带负荷调试 | 接入${type}，逐步提高负荷，接种培养生化系统 | 7~14 天 |`,
        `| 满负荷试运行 | 按设计水量连续稳定运行，出水水质逐日检测 | 7~14 天 |`,
        ``,
        `## 7.2 调试要点`,
        ``,
        `- 生化系统接种污泥浓度不低于 3~4 g/L，驯化期间控制进水负荷由低到高；`,
        `- 加药系统根据进水水质动态调整投加量，控制出水指标稳定；`,
        `- 膜/过滤系统按厂家指导进行初始化与产水通量校核；`,
        `- 调试期间每日监测出水 COD、SS、NH3-N 等指标，形成调试记录。`,
        ``,
        `## 7.3 验收标准`,
        ``,
        `1. **出水水质**：连续 7 天出水指标满足设计排放标准，达标率 100%；`,
        `2. **设备性能**：各设备运行平稳、无异常振动与渗漏，运行电流不超过额定值；`,
        `3. **自动化**：控制逻辑正确、报警保护灵敏可靠、远程监控功能正常；`,
        `4. **竣工资料**：提供竣工图、设备资料、调试报告、操作手册、验收记录等全套资料。`,
        ``,
        `验收合格后进入 **12 个月质保期**，质保期内供方提供免费维修服务与运行支持。`,
      ].join('\n'),
    };
  }

  /** 第八章 运行维护指南 */
  private buildChapterOperation(enhanced: EnhancedProposal): ProposalSection {
    return {
      id: '08',
      title: '运行维护指南',
      summary: `操作规程、维护保养与故障排查`,
      content: [
        `## 8.1 操作规程`,
        ``,
        enhanced.operationAdvice.routineOperation || '系统采用自动运行模式，值班人员每日巡检记录运行参数（进出水量、液位、压力、电流、出水水质），异常时及时处理并上报。',
        ``,
        `## 8.2 维护保养计划`,
        ``,
        enhanced.operationAdvice.maintenance || '按"日巡查、周保养、月检修、年大修"计划执行：每日检查设备运行状态；每周清洁仪表探头、检查加药管路；每月更换滤芯/清洗膜组件、润滑轴承；每年对设备进行整体检修与性能复校。',
        ``,
        `## 8.3 故障排查指南`,
        ``,
        enhanced.operationAdvice.troubleshooting || '常见故障：出水超标（核查加药量、膜/滤池状态、生化系统 DO）；泵不启动（检查电源、液位信号、热保护）；流量下降（检查堵塞、泵汽蚀、阀门开度）；异常噪音（检查轴承、叶轮异物）。处理遵循"先电气后机械、先外部后内部"原则。',
        ``,
        `## 8.4 安全运行要点`,
        ``,
        enhanced.operationAdvice.safetyMeasures || '运行人员经培训后持证上岗；检修时执行断电挂牌制度；有限空间作业先通风检测；药剂储存区防泄漏、防腐蚀；建立健全运行台账与应急预案。',
      ].join('\n'),
    };
  }

  /** 第九章 报价单 */
  private buildChapterQuote(
    context: ProposalContext,
    enhanced: EnhancedProposal,
    supplier: ProposalSupplierInfo
  ): ProposalSection {
    const quoteItems = this.buildQuoteItems(enhanced);
    const spareParts = this.buildSpareParts(enhanced.equipmentConfig);
    const totalAmount =
      enhanced.costAnalysis?.capitalCost?.total ?? quoteItems.reduce((s, it) => s + it.totalPrice, 0);

    const lines: string[] = [
      `## 9.1 报价说明`,
      ``,
      `**供方单位**：${supplier.companyName || '（待确认）'}`,
      supplier.address ? `**单位地址**：${supplier.address}` : '',
      supplier.contactPerson ? `**联系人**：${supplier.contactPerson}` : '',
      supplier.phone ? `**联系电话**：${supplier.phone}` : '',
      supplier.email ? `**电子邮箱**：${supplier.email}` : '',
      supplier.taxNumber ? `**纳税人识别号**：${supplier.taxNumber}` : '',
      ``,
      `> 本报价包含设备购置、安装调试、培训及质保期内服务费用（不含土建工程及外部管线）。最终价格以双方签订合同为准。`,
      ``,
      `## 9.2 分项报价明细`,
      ``,
      `| 序号 | 名称 | 规格型号 | 品牌/产地 | 数量 | 单位 | 单价(元) | 小计(元) | 质保期 | 技术参数 |`,
      `|------|------|---------|----------|------|------|---------|---------|--------|---------|`,
    ];

    quoteItems.forEach((it, i) => {
      lines.push(
        `| ${i + 1} | ${it.name} | ${it.model || '-'} | ${it.brand} | ${it.quantity} | ${it.unit} | ${it.unitPrice.toLocaleString('zh-CN')} | ${it.totalPrice.toLocaleString('zh-CN')} | ${it.warranty} | ${it.techParams || '-'} |`
      );
    });

    lines.push('');
    lines.push(`**报价合计：人民币 ${totalAmount.toLocaleString('zh-CN')} 元**（¥ ${this.numToChinese(totalAmount)}）`);
    lines.push('');
    lines.push(`## 9.3 首年推荐备品备件清单`);
    lines.push('');
    lines.push('| 序号 | 名称 | 规格型号 | 品牌 | 数量 | 单价(元) | 小计(元) | 备注 |');
    lines.push('|------|------|---------|------|------|---------|---------|------|');
    spareParts.forEach((p, i) => {
      lines.push(`| ${i + 1} | ${p.name} | ${p.model || '-'} | ${p.brand} | ${p.quantity} | ${p.unitPrice.toLocaleString('zh-CN')} | ${p.totalPrice.toLocaleString('zh-CN')} | ${p.remark || '-'} |`);
    });
    lines.push('');
    lines.push('> 备品备件价格按主机价格比例估算，实际采购价格以当期市场价为准。');
    lines.push('');
    lines.push(`## 9.4 付款方式`);
    lines.push('');
    this.buildPaymentTerms(context).forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    lines.push('');
    lines.push(`## 9.5 质保与技术服务`);
    lines.push('');
    this.buildWarrantyTerms().forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    lines.push('');
    this.buildServiceTerms().forEach((t, i) => lines.push(`${i + 1}. ${t}`));
    lines.push('');

    return {
      id: '09',
      title: '报价单',
      summary: `分项报价、备品备件、付款方式与技术服务条款`,
      content: lines.join('\n'),
    };
  }

  /** 第十章 附件 */
  private buildChapterAppendix(context: ProposalContext, enhanced: EnhancedProposal): ProposalSection {
    const calcs = this.buildDesignCalculations(context, enhanced);

    const lines: string[] = [
      `## 10.1 设计计算书`,
      ``,
    ];

    if (calcs.length === 0) {
      lines.push('> 本阶段为方案设计，正式设计阶段提供完整计算书。');
      lines.push('');
    } else {
      calcs.forEach((c) => {
        lines.push(`### ${c.name}`);
        lines.push('');
        lines.push(`**计算目的**：${c.purpose}`);
        lines.push('');
        lines.push('**计算过程**：');
        lines.push('');
        c.steps.forEach((s, i) => lines.push(`${i + 1}. ${s}`));
        lines.push('');
        lines.push(`**计算结果**：${c.result}`);
        lines.push('');
        lines.push(`**结论**：${c.conclusion}`);
        lines.push('');
      });
    }

    lines.push(`## 10.2 图纸清单`);
    lines.push('');
    lines.push('| 序号 | 图纸名称 | 说明 |');
    lines.push('|------|---------|------|');
    [
      '工艺流程图',
      '平面布置图',
      '高程（水力）系统图',
      '设备安装大样图',
      '电气系统图',
      '自控系统图',
      '管路系统图',
      '基础及预埋件图',
    ].forEach((d, i) => lines.push(`| ${i + 1} | ${d} | 正式设计阶段提供施工图 |`));
    lines.push('');

    lines.push(`## 10.3 业绩与案例`);
    lines.push('');
    lines.push('供方在同类处理工程中具有丰富实施经验，可按业主要求提供近三年同类工程业绩清单、客户评价及现场考察安排。');
    lines.push('');

    return {
      id: '10',
      title: '附件',
      summary: `设计计算书、图纸清单与业绩案例`,
      content: lines.join('\n'),
    };
  }

  // --------------------------------------------------------------------------
  // 报价 / 备件 / 计算书 / 条款构建
  // --------------------------------------------------------------------------

  /** 构建报价明细（品牌为通用选型描述，不硬编码具体品牌名） */
  private buildQuoteItems(enhanced: EnhancedProposal): ProposalQuoteItem[] {
    return (enhanced.equipmentConfig || []).map((e, i) => {
      // #[20260827-1030]-3 优先从设备参数库查参考价（避免 AI 价格幻觉）
      const kbQuote = kbBuildQuoteItem(e.name || '', e.quantity || 1, { powerKw: e.power });
      const kbPrice = kbQuote?.unitPrice ?? 0;
      const aiPrice = e.price && e.price > 0 ? Math.round(e.price / Math.max(1, e.quantity)) : 0;
      const unitPrice = kbPrice > 0 ? kbPrice : aiPrice;
      return {
        id: `QT-${String(i + 1).padStart(3, '0')}`,
        name: e.name,
        model: e.model || (kbQuote?.model ?? '按设计选型'),
        brand: kbQuote?.brand ?? '国产优质品牌',
        techParams: e.specs || (e.power ? `功率 ${e.power} kW` : '按设计参数'),
        unit: '台/套',
        quantity: e.quantity,
        unitPrice,
        totalPrice: unitPrice * e.quantity,
        warranty: kbQuote ? `${kbQuote.warrantyMonths} 个月` : '12 个月',
        category: e.category || '设备',
        remark: kbQuote ? `${kbQuote.source}${e.remarks ? `；备注：${e.remarks}` : ''}` : e.remarks,
      };
    });
  }

  /** 构建首年推荐备品备件清单（按主机价格比例估算，明确标注估算属性） */
  private buildSpareParts(equipment: EquipmentConfig[]): SparePartItem[] {
    const parts: SparePartItem[] = [];
    const seen = new Set<string>();
    let idx = 0;

    equipment.forEach((e) => {
      const unitPrice = e.price && e.price > 0 ? e.price / Math.max(1, e.quantity) : 0;
      const name = e.name || '';
      const push = (pname: string, model: string, ratio: number, unit: string, quantity: number, remark: string) => {
        if (seen.has(pname)) return;
        seen.add(pname);
        idx += 1;
        const price = unitPrice > 0 ? Math.round((unitPrice * ratio) / 10) * 10 : 0;
        parts.push({
          name: pname,
          model,
          brand: '原厂/同规格',
          unit,
          quantity,
          unitPrice: price,
          totalPrice: price * quantity,
          remark,
        });
      };

      if (name.includes('泵')) {
        push('机械密封', '按泵型号', 0.04, '套', Math.max(1, Math.min(2, e.quantity)), '含静环/动环/弹簧');
      } else if (name.includes('风机')) {
        push('空气滤清器滤芯', '按风机型号', 0.03, '只', Math.max(2, e.quantity), '每季度更换');
      } else if (name.includes('膜') || name.includes('MBR')) {
        push('膜组件（备用）', e.model || '按膜规格', 0.06, '片/支', 2, '按通量衰减更换');
      } else if (name.includes('滤')) {
        push('滤芯/滤袋', e.model || '按过滤规格', 0.05, '只', Math.max(2, e.quantity), '压差超标时更换');
      } else if (name.includes('搅拌') || name.includes('刮泥')) {
        push('机械密封及密封圈', '按设备型号', 0.03, '套', 1, '检修备件');
      } else if (name.includes('阀')) {
        push('电磁阀/电动阀（备用）', e.model || '按阀规格', 0.05, '只', 1, '控制回路备用');
      }
    });

    // 通用备件
    parts.push({
      name: '常用易损件包',
      model: 'O型圈/垫片/紧固件',
      brand: '标准件',
      unit: '套',
      quantity: 1,
      unitPrice: 0,
      totalPrice: 0,
      remark: '随主机配备，价格按实际清单',
    });

    return parts;
  }

  /** 构建设计计算书（#[20260827-1030]-3 由知识库计算引擎驱动，含完整公式推导） */
  private buildDesignCalculations(context: ProposalContext, enhanced: EnhancedProposal): DesignCalculation[] {
    const calcs: DesignCalculation[] = [];
    const Q = context.capacity || 0;
    if (Q <= 0) return calcs;

    // 调用知识库计算引擎（替换原 guessMembraneFlux/calcPumpHead/calcPipeHydraulics 粗糙估算）
    const design = runEngineeringDesign({
      flowM3d: Q,
      ssMgL: context.influentQuality?.ss ?? 5000,
      codMgL: context.influentQuality?.cod ?? 800,
      processType: context.processType,
    });
    const fmt = (steps: { formula: string; substitution: string; result: string }[]): string[] =>
      steps.map((s) => `${s.formula} ｜ ${s.substitution} → ${s.result}`);

    // 1. 每日泥饼量
    calcs.push({
      name: '每日干泥量与泥饼量计算',
      purpose: '按处理水量与悬浮物浓度估算系统每日产泥量',
      steps: fmt(design.dailySludge.steps),
      result: `泥饼 ${design.dailySludge.value} ${design.dailySludge.unit}`,
      conclusion: design.dailySludge.summary,
    });

    // 2. 压滤机过滤面积
    calcs.push({
      name: '压滤机过滤面积计算',
      purpose: '按单批次干泥量与过滤周期确定压滤机所需过滤面积',
      steps: fmt(design.filterArea.steps),
      result: `设计过滤面积 ${design.filterArea.value} ${design.filterArea.unit}`,
      conclusion: design.filterArea.summary,
    });

    // 3. 提升泵扬程
    calcs.push({
      name: '提升泵扬程计算',
      purpose: '依据静扬程、沿程损失与局部损失计算选型扬程（含 15% 富裕量）',
      steps: fmt(design.pumpHead.steps),
      result: `设计扬程 ${design.pumpHead.value} ${design.pumpHead.unit}`,
      conclusion: design.pumpHead.summary,
    });

    // 4. 主输水管管径
    calcs.push({
      name: '主输水管管径计算',
      purpose: '按经济流速 1.0 m/s 校核主管管径',
      steps: fmt(design.pipeDiameter.steps),
      result: `设计管径 DN${design.pipeDiameter.value}`,
      conclusion: design.pipeDiameter.summary,
    });

    // 5. 提升泵轴功率
    calcs.push({
      name: '提升泵轴功率计算',
      purpose: '按流量与扬程计算轴功率（含 15% 裕量取整）',
      steps: fmt(design.pumpPower.steps),
      result: `选配电机 ${design.pumpPower.value} ${design.pumpPower.unit}`,
      conclusion: design.pumpPower.summary,
    });

    // 6. 生化工艺专有（HRT + 曝气）
    if (context.processType && /(AO|MBR|SBR|A2O|A²\/O|生化|脱氮|除磷)/i.test(context.processType)) {
      calcs.push({
        name: '生化池水力停留时间校核',
        purpose: '校核生化池容积是否满足工艺 HRT 要求',
        steps: fmt(design.hrt.steps),
        result: `HRT = ${design.hrt.value} ${design.hrt.unit}`,
        conclusion: design.hrt.summary,
      });
      calcs.push({
        name: '鼓风机曝气量计算',
        purpose: '按处理水量估算曝气需氧量',
        steps: fmt(design.aeration.steps),
        result: `曝气量 ${design.aeration.value} ${design.aeration.unit}`,
        conclusion: design.aeration.summary,
      });
    }

    // 7. 药剂投加
    calcs.push({
      name: 'PAC 投加量计算',
      purpose: '按投加浓度计算每日 PAC 用量',
      steps: fmt(design.pacDosage.steps),
      result: `PAC ${design.pacDosage.value} ${design.pacDosage.unit}`,
      conclusion: design.pacDosage.summary,
    });
    calcs.push({
      name: 'PAM 投加量计算',
      purpose: '按投加浓度计算每日助凝剂用量',
      steps: fmt(design.pamDosage.steps),
      result: `PAM ${design.pamDosage.value} ${design.pamDosage.unit}`,
      conclusion: design.pamDosage.summary,
    });

    return calcs;
  }

  /** 判断膜通量取值（按工艺类型） */
  private guessMembraneFlux(context: ProposalContext): number {
    const p = (context.processType || '').toUpperCase();
    if (p.includes('MBR') || p.includes('膜')) return 18; // L/(m²·h)
    if (p.includes('沉淀') || p.includes('混凝')) return 12;
    if (p.includes('砂滤') || p.includes('过滤')) return 10;
    return 15;
  }

  /** 泵扬程估算（基于规模） */
  private calcPumpHead(context: ProposalContext): number {
    const Q = context.capacity || 0;
    // 扬程随规模增大略有增加；基础静扬程 + 管路损失
    return Math.max(12, Math.round((8 + Math.min(10, Q / 1000)) * 10) / 10);
  }

  /** 管道水力计算（按规模选管径） */
  private calcPipeHydraulics(Q: number): { q: number; dn: number; d: number; area: number; velocity: number } | null {
    if (Q <= 0) return null;
    const q = Q / 86400; // m³/s
    const dn = Q <= 50 ? 50 : Q <= 100 ? 75 : Q <= 200 ? 100 : Q <= 500 ? 150 : 200;
    const d = (dn - 2) / 1000; // 内径近似 m
    const area = (Math.PI * d * d) / 4;
    const velocity = q / area;
    return { q, dn, d, area, velocity };
  }

  /** 付款方式（分阶段细化，含支付节点条件） */
  private buildPaymentTerms(context: ProposalContext): string[] {
    return [
      '合同签订后 3 个工作日内支付合同总价的 **30%** 作为预付款（用于设备排产与材料采购）；',
      '主要设备到场并开箱验收合格后支付合同总价的 **40%**；',
      '系统安装调试完成、出水水质连续 7 天达标并通过验收后支付合同总价的 **25%**；',
      '质保期满（验收合格后 12 个月）且无质量问题后支付剩余 **5%** 质保金。',
    ];
  }

  /** 技术服务条款 */
  private buildServiceTerms(): string[] {
    return [
      '免费提供全套技术资料（图纸、说明书、操作手册）及操作培训（现场培训不少于 8 课时）；',
      '质保期内免费维修，质保期外提供终身有偿技术服务；',
      '接到故障报修后 2 小时内响应，48 小时内到达现场处理（偏远地区另行协商）；',
      '提供远程运维支持：电话、视频指导及物联网平台远程诊断；',
      '质保期内每年提供不少于 1 次免费回访巡检，并出具系统运行评估报告。',
    ];
  }

  /** 质保条款 */
  private buildWarrantyTerms(): string[] {
    return [
      '整机质保期为竣工验收合格之日起 12 个月；',
      '质保期内因设计、制造、安装质量问题导致的故障，由供方免费维修或更换；',
      '易损件（膜组件、滤芯、密封件、皮带等）不纳入整机质保，按备品备件另行供应；',
      '因操作不当、不可抗力或未经许可的改造导致的损坏不在质保范围内。',
    ];
  }

  // --------------------------------------------------------------------------
  // 工具方法
  // --------------------------------------------------------------------------

  private buildProposalTitle(context: ProposalContext): string {
    const type = context.projectType || '污水处理';
    return `${type}处理工程技术与报价方案`;
  }

  private buildProjectName(context: ProposalContext): string {
    const type = context.projectType || '污水处理';
    return context.location ? `${context.location}${type}处理工程` : `${type}处理工程`;
  }

  private buildFallbackSupplier(context: ProposalContext): ProposalSupplierInfo {
    // 无供方资料时使用中性占位，不硬编码虚假企业信息
    return {
      companyName: '（供方名称以合同签署单位为准）',
      contactPerson: context.customerInfo?.contact,
      phone: context.customerInfo?.phone,
      address: context.customerInfo?.address,
    };
  }

  private buildChartData(enhanced: EnhancedProposal): ProposalChartData {
    const cost = enhanced.costAnalysis;
    const quoteBreakdown = cost
      ? [
          { name: '设备购置', value: cost.capitalCost.equipmentCost || 0 },
          { name: '土建工程', value: cost.capitalCost.civilWorkCost || 0 },
          { name: '安装调试', value: cost.capitalCost.installationCost || 0 },
          { name: '其他费用', value: cost.capitalCost.otherCost || 0 },
        ].filter((d) => d.value > 0)
      : [];

    const equipmentCompare = (enhanced.equipmentConfig || []).slice(0, 8).map((e) => ({
      name: e.name,
      specs: e.model || '',
      params: {
        功率kW: e.power ?? 0,
        数量: e.quantity ?? 0,
      },
    }));

    return {
      quoteBreakdown,
      equipmentCompare,
      totalAmount: cost?.capitalCost?.total ?? 0,
    };
  }

  private getDesignStandards(context?: ProposalContext): string[] {
    // #[20260827-1030]-3 从规范库查询相关条目（按项目类型/工艺匹配）
    const related = getRelatedStandards(context?.projectType ?? '污水处理', context?.processType);
    const baseList = related.length > 0
      ? related.map((s) => `《${s.name}》${s.code}`)
      : [
          '《室外排水设计标准》GB 50014-2021',
          '《城镇污水处理厂污染物排放标准》GB 18918-2002',
          '《污水综合排放标准》GB 8978-1996',
          '《建筑给水排水设计标准》GB 50015-2019',
          '《室外给水设计标准》GB 50013-2018',
          '《供配电系统设计规范》GB 50052-2009',
          '《低压配电设计规范》GB 50054-2011',
        ];
    // 工艺特定补充
    if (context?.processType && /(压滤|板框|厢式|脱水)/.test(context.processType)) {
      baseList.push('《厢式压滤机和板框压滤机》JB/T 4333-2013');
    }
    baseList.push('业主提供的设计任务书及现场踏勘资料');
    return baseList;
  }

  /** 数字转中文大写（人民币金额，按四位分组算法，正确处理零位） */
  private numToChinese(num: number): string {
    if (!num || num <= 0) return '零元整';
    const digits = ['零', '壹', '贰', '叁', '肆', '伍', '陆', '柒', '捌', '玖'];
    const units = ['', '拾', '佰', '仟'];
    const bigUnits = ['', '万', '亿'];

    const s = String(Math.floor(num));
    const len = s.length;

    // 按 4 位一组拆分（低位在前）
    const groups: string[] = [];
    for (let i = len; i > 0; i -= 4) {
      groups.push(s.slice(Math.max(0, i - 4), i));
    }

    const readGroup = (g: string): string => {
      let out = '';
      let zeroPending = false;
      for (let i = 0; i < g.length; i++) {
        const d = parseInt(g[i], 10);
        const pos = g.length - i - 1;
        if (d === 0) {
          if (out) zeroPending = true;
        } else {
          if (zeroPending) out += '零';
          zeroPending = false;
          out += digits[d] + units[pos];
        }
      }
      return out;
    };

    let result = '';
    for (let gi = groups.length - 1; gi >= 0; gi--) {
      const g = groups[gi];
      const read = readGroup(g);
      if (!read) continue;
      if (result) {
        const leadingZeroNeeded = /^0/.test(g) && /[1-9]/.test(g.slice(1));
        if (leadingZeroNeeded && !result.endsWith('零')) result += '零';
      }
      result += read + bigUnits[gi];
    }

    result = result.replace(/零+$/, '');
    return (result || '零') + '元整';
  }

  /** 组装完整 Markdown（含封面信息） */
  private assembleCompleteMarkdown(
    context: ProposalContext,
    sections: ProposalSection[],
    supplier: ProposalSupplierInfo,
    enhanced: EnhancedProposal
  ): string {
    const lines: string[] = [
      `# ${this.buildProposalTitle(context)}`,
      ``,
      `> **项目名称**：${this.buildProjectName(context)}`,
      `> **编制单位**：${supplier.companyName || '（待确认）'}`,
      `> **编制日期**：${new Date().toLocaleDateString('zh-CN')}`,
      `> **文档版本**：v1.0（系统智能生成，含设计计算与可视化数据）`,
      ``,
      `---`,
      ``,
      `## 目录`,
      ``,
    ];
    sections.forEach((s) => lines.push(`${s.id}　${s.title}`));
    lines.push('');
    lines.push('---');
    lines.push('');
    sections.forEach((s) => {
      lines.push(`# 第 ${s.id} 章　${s.title}`);
      lines.push('');
      lines.push(s.content);
      lines.push('');
      lines.push('---');
      lines.push('');
    });
    return sanitizePushOffStatements(lines.join('\n'));
  }
}

// ============================================================================
// 导出单例实例
// ============================================================================

export const proposalEnhancer = new ProposalEnhancer();
