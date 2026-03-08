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
import { cozeTools } from './coze-tools';
import { Logger } from './logger';

// ============================================================================
// 方案相关类型定义
// ============================================================================

export interface ProposalContext {
  projectType: string;           // 项目类型：生活污水、工业废水等
  capacity: number;               // 处理规模（吨/天）
  influentQuality?: {             // 进水水质
    cod?: number;                 // COD (mg/L)
    bod5?: number;                // BOD5 (mg/L)
    ss?: number;                  // SS (mg/L)
    nh3n?: number;                // NH3-N (mg/L)
    tn?: number;                  // TN (mg/L)
    tp?: number;                  // TP (mg/L)
    ph?: number;                  // pH
  };
  effluentStandards?: {           // 出水标准
    cod?: number;
    bod5?: number;
    ss?: number;
    nh3n?: number;
    tn?: number;
    tp?: number;
  };
  processType?: string;           // 工艺类型：A/O、MBR、SBR等
  location?: string;              // 项目地点
  budget?: number;                // 预算（万元）
  requirements?: string[];        // 特殊要求
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
  duration?: number;              // 停留时间（小时）
  notes?: string;
}

export interface EquipmentConfig {
  id: string;
  name: string;
  category: string;
  model?: string;
  quantity: number;
  specs?: string;
  power?: number;                 // 功率 (kW)
  price?: number;                 // 价格（元）
  remarks?: string;
}

export interface CostAnalysis {
  capitalCost: {
    equipmentCost: number;        // 设备费用
    civilWorkCost: number;        // 土建费用
    installationCost: number;     // 安装费用
    otherCost: number;            // 其他费用
    total: number;                // 总投资
  };
  operatingCost: {
    powerCost: number;            // 电费
    chemicalCost: number;         // 药剂费
    laborCost: number;            // 人工费
    maintenanceCost: number;      // 维护费
    total: number;                // 年运营成本
    unitCost: number;             // 吨水成本
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
  startup: string;                // 启动指导
  routineOperation: string;       // 日常操作
  maintenance: string;            // 维护建议
  troubleshooting: string;        // 故障排查
  safetyMeasures: string;         // 安全措施
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
  originalProposal: string;       // 原始方案
  enhancedProposal: string;       // 增强后的方案
  
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
}

export interface EnhancementOptions {
  enableTechnicalParams?: boolean;    // 启用技术参数细化
  enableProcessOptimization?: boolean; // 启用工艺流程优化
  enableEquipmentOptimization?: boolean; // 启用设备配置优化
  enableCostAnalysis?: boolean;       // 启用成本分析
  enableImplementationGuide?: boolean; // 启用实施指导
  enableOperationAdvice?: boolean;    // 启用运营建议
  enableRiskAssessment?: boolean;     // 启用风险评估
  enableMarketData?: boolean;         // 启用市场数据查询
  enhancementLevel?: 'basic' | 'standard' | 'comprehensive';
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
      enableRiskAssessment
        ? this.generateRiskAssessment(context)
        : Promise.resolve({ risks: [] }),
      
      // 优化建议
      this.generateOptimizationSuggestions(context, originalProposal),
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
      usedTools.webSearch = cozeTools.getStatus().webSearch;
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
      optimizationSuggestions
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
    };
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

原始方案摘要（前500字）：
${proposal.substring(0, 500)}

请生成详细的技术参数（至少20个参数）。`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        maxTokens: 2048,
      });

      const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.text.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const params = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return params.filter((p: any) => p.name && p.value);
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

原始方案摘要（前500字）：
${proposal.substring(0, 500)}

请生成详细的工艺流程（至少5个工艺单元，包含预处理、生化处理、深度处理等）。`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        maxTokens: 2048,
      });

      const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.text.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const steps = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return steps.filter((s: any) => s.step && s.name);
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
    enableMarketData: boolean
  ): Promise<EquipmentConfig[]> {
    Logger.info('[ProposalEnhancer] 增强设备配置');

    try {
      if (!process.env.DEEPSEEK_API_KEY) {
        return [];
      }

      const systemPrompt = `你是一个污水处理设备配置专家。根据项目上下文和原始方案，生成详细的设备配置清单。

## 输出格式（JSON）：
[
  {
    "id": "设备唯一标识",
    "name": "设备名称",
    "category": "设备类别（预处理/生化/深度处理/控制/辅助）",
    "model": "型号",
    "quantity": 数量,
    "specs": "技术规格参数",
    "power": 功率（kW）,
    "price": 预估价格（元）,
    "remarks": "备注说明"
  }
]

设备类别参考：
- 预处理：格栅、调节池、沉砂池等
- 生化：曝气系统、沉淀池、反应池等
- 深度处理：过滤、消毒、膜处理等
- 控制：PLC、仪表、阀门等
- 辅助：泵、风机、加药设备等

请只输出 JSON，不要包含其他说明文字。`;

      const userPrompt = `项目类型：${context.projectType}
处理规模：${context.capacity} 吨/天
工艺类型：${context.processType || '智能推荐'}
预算：${context.budget ? context.budget + ' 万元' : '未指定'}

原始方案摘要（前500字）：
${proposal.substring(0, 500)}

请生成详细的设备配置清单（至少20项设备，覆盖全流程）。`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.6,
        maxTokens: 3072,
      });

      const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.text.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const equipment = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return equipment.filter((e: any) => e.id && e.name && e.quantity > 0);
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
      const civilWorkCost = Math.round(equipmentCost * 0.4);  // 土建费用约占40%
      const installationCost = Math.round(equipmentCost * 0.15); // 安装费用约占15%
      const otherCost = Math.round(equipmentCost * 0.1);     // 其他费用约占10%
      const totalCapitalCost = equipmentCost + civilWorkCost + installationCost + otherCost;

      // 运营成本估算
      const powerCost = Math.round(context.capacity * 0.5 * 365);  // 电费估算
      const chemicalCost = Math.round(context.capacity * 0.3 * 365); // 药剂费估算
      const laborCost = Math.round(context.capacity * 0.2 * 365);   // 人工费估算
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
        capitalCost: { equipmentCost: 0, civilWorkCost: 0, installationCost: 0, otherCost: 0, total: 0 },
        operatingCost: { powerCost: 0, chemicalCost: 0, laborCost: 0, maintenanceCost: 0, total: 0, unitCost: 0 },
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

      const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.text.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
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
  private async generateOperationAdvice(
    context: ProposalContext
  ): Promise<OperationAdvice> {
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

      const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.text.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
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
  private async generateRiskAssessment(
    context: ProposalContext
  ): Promise<RiskAssessment> {
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

      const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.text.match(/\{[\s\S]*\}/);
      
      if (jsonMatch) {
        return JSON.parse(jsonMatch[1] || jsonMatch[0]);
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
  ): Promise<Array<{
    category: string;
    description: string;
    benefit: string;
    priority: 'high' | 'medium' | 'low';
  }>> {
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

原始方案摘要（前300字）：
${proposal.substring(0, 300)}

请生成优化建议（至少3条，涵盖不同类别）。`;

      const response = await callDeepSeekChat({
        messages: [
          { role: 'system', content: systemPrompt },
          { role: 'user', content: userPrompt },
        ],
        temperature: 0.7,
        maxTokens: 2048,
      });

      const jsonMatch = response.text.match(/```json\s*([\s\S]*?)\s*```/) ||
                       response.text.match(/\[[\s\S]*\]/);
      
      if (jsonMatch) {
        const suggestions = JSON.parse(jsonMatch[1] || jsonMatch[0]);
        return suggestions.filter((s: any) => s.category && s.description);
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
    optimizationSuggestions?: any[]
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
        const params = technicalParams.filter(p => p.category === key);
        if (params.length > 0) {
          enhanced += `### ${label}\n\n`;
          enhanced += '| 参数名称 | 数值 | 单位 | 说明 |\n';
          enhanced += '|---------|------|------|------|\n';
          params.forEach(p => {
            enhanced += `| ${p.name} | ${p.value} | ${p.unit || '-'} | ${p.description || '-'} |\n`;
          });
          enhanced += '\n';
        }
      });
    }

    // 添加工艺流程部分
    if (processFlow.length > 0) {
      enhanced += '\n## 🔄 工艺流程\n\n';
      processFlow.forEach(step => {
        enhanced += `### 步骤 ${step.step}: ${step.name}\n\n`;
        enhanced += `${step.description}\n\n`;
        
        if (step.duration) {
          enhanced += `**停留时间**: ${step.duration} 小时\n\n`;
        }

        if (step.equipment && step.equipment.length > 0) {
          enhanced += '**设备配置**:\n\n';
          step.equipment.forEach(eq => {
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
          step.parameters.forEach(p => {
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
      equipmentConfig.forEach(e => {
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
    if (implementationGuide && implementationGuide.steps.length > 0) {
      enhanced += '\n## 📋 实施指导\n\n';
      enhanced += `### ${implementationGuide.phase}\n\n`;
      implementationGuide.steps.forEach(step => {
        enhanced += `#### ${step.task}\n\n`;
        enhanced += `**工期**: ${step.duration}\n\n`;
        if (step.requirements && step.requirements.length > 0) {
          enhanced += '**要求**:\n\n';
          step.requirements.forEach(req => {
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
    if (riskAssessment && riskAssessment.risks.length > 0) {
      enhanced += '\n## ⚠️ 风险评估\n\n';
      enhanced += '| 风险类别 | 风险描述 | 发生概率 | 影响程度 | 应对措施 |\n';
      enhanced += '|---------|---------|---------|---------|---------|\n';
      riskAssessment.risks.forEach(risk => {
        const probEmoji = risk.probability === 'high' ? '🔴' : risk.probability === 'medium' ? '🟡' : '🟢';
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

    return enhanced;
  }
}

// ============================================================================
// 导出单例实例
// ============================================================================

export const proposalEnhancer = new ProposalEnhancer();
