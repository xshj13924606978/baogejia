/**
 * 智能AI服务选择器
 *
 * 核心功能：
 * 1. 根据任务类型自动选择最合适的AI服务（DeepSeek / Coze）
 * 2. 支持服务降级和故障转移
 * 3. 提供统一的调用接口
 *
 * 架构设计：
 * - DeepSeek：对话理解、技术方案生成、报价单生成
 * - Coze：联网搜索（市场价格）、向量模型（相似产品）、生图模型（产品图）
 *
 * 自动选择策略：
 * 1. 对话类任务 → DeepSeek
 * 2. 联网搜索 → Coze Web Search
 * 3. 向量搜索 → Coze Embedding
 * 4. 生图 → Coze Image Generation
 * 5. 混合任务 → 组合使用
 */

import { streamDeepSeekChat } from './deepseek-client';
import { cozeToolsService } from './coze-tools';
import { tokenHubClient, isTokenHubConfigured, getProviderPriority } from './tokenhub-client';
import { Logger } from './logger';

// ============================================================================
// 任务类型定义
// ============================================================================

export type TaskType =
  | 'chat' // 对话理解
  | 'technical-proposal' // 技术方案生成
  | 'quote-generation' // 报价单生成
  | 'market-price' // 市场价格查询（联网搜索）
  | 'similar-products' // 相似产品推荐（向量搜索）
  | 'product-image' // 产品图生成（生图）
  | 'quote-enhancement' // 报价增强（混合任务）
  | 'price-optimization'; // 价格优化建议（DeepSeek）

export type ServiceType = 'tokenhub' | 'deepseek' | 'coze' | 'gemini' | 'both' | 'auto' | 'none';

export interface ServiceSelection {
  service: ServiceType;
  reason: string;
  confidence: number;
}

// ============================================================================
// 智能服务选择器
// ============================================================================

export class AIServiceSelector {
  private static instance: AIServiceSelector;

  private constructor() {
    Logger.info('[AIServiceSelector] 智能服务选择器初始化完成');
  }

  static getInstance(): AIServiceSelector {
    if (!AIServiceSelector.instance) {
      AIServiceSelector.instance = new AIServiceSelector();
    }
    return AIServiceSelector.instance;
  }

  /**
   * 根据任务类型选择服务
   */
  selectService(taskType: TaskType): ServiceSelection {
    Logger.info(`[AIServiceSelector] 任务类型: ${taskType}`);

    // 获取服务状态
    const cozeStatus = cozeToolsService.getStatus();
    const deepseekAvailable = !!process.env.DEEPSEEK_API_KEY;
    const tokenhubAvailable = isTokenHubConfigured();
    // TokenHub 优先开关：AI_PROVIDER_PRIORITY=tokenhub（默认）时作为主路由
    const tokenhubPrimary = tokenhubAvailable && getProviderPriority() === 'tokenhub';

    // 根据任务类型选择
    switch (taskType) {
      case 'chat':
      case 'technical-proposal':
      case 'quote-generation':
      case 'price-optimization':
        // 对话类任务优先使用 TokenHub（统一网关），未配置/关闭时降级 DeepSeek / Coze
        if (tokenhubPrimary) {
          return {
            service: 'tokenhub',
            reason: 'TokenHub 统一网关已启用，对话任务走统一网关（可通过模型参数切换模型）',
            confidence: 0.96,
          };
        }
        return {
          service: deepseekAvailable ? 'deepseek' : 'coze',
          reason: '对话理解、技术方案、报价生成任务适合DeepSeek的强大语义理解能力',
          confidence: deepseekAvailable ? 0.95 : 0.7,
        };

      case 'market-price':
        // 市场价格查询需要联网搜索：优先 TokenHub 联网搜索，其次 Coze Web Search，最后 DeepSeek
        if (tokenhubAvailable && process.env.TOKENHUB_SEARCH_ENABLED !== 'false') {
          return {
            service: 'tokenhub',
            reason: '市场价格查询需要联网搜索能力，使用 TokenHub 统一网关联网搜索（带引用来源）',
            confidence: 0.95,
          };
        }
        if (!cozeStatus.enabled || !cozeStatus.webSearchEnabled) {
          Logger.warn('[AIServiceSelector] Coze Web Search 未启用，尝试降级到 DeepSeek');
          if (deepseekAvailable) {
            return {
              service: 'deepseek',
              reason: 'TokenHub/Coze Web Search 未启用，降级到 DeepSeek（可能缺少实时市场价格数据）',
              confidence: 0.6,
            };
          } else {
            return {
              service: 'none',
              reason: 'TokenHub/Coze Web Search 和 DeepSeek 均不可用，无法查询市场价格',
              confidence: 0,
            };
          }
        }
        return {
          service: 'coze',
          reason: '市场价格查询需要联网搜索能力，使用 Coze Web Search',
          confidence: 0.95,
        };

      case 'similar-products':
        // 相似产品推荐需要向量搜索，使用 Coze
        if (!cozeStatus.enabled || !cozeStatus.embeddingEnabled) {
          Logger.warn('[AIServiceSelector] Coze Embedding 未启用，降级到 DeepSeek');
          if (deepseekAvailable) {
            return {
              service: 'deepseek',
              reason: 'Coze Embedding 未启用，降级到 DeepSeek（使用关键词匹配代替）',
              confidence: 0.5,
            };
          } else {
            return {
              service: 'none',
              reason: 'Coze Embedding 和 DeepSeek 均不可用，无法推荐相似产品',
              confidence: 0,
            };
          }
        }
        return {
          service: 'coze',
          reason: '相似产品推荐需要向量搜索能力，使用 Coze Embedding',
          confidence: 0.95,
        };

      case 'product-image':
        // 产品图生成需要生图能力，使用 Coze
        if (!cozeStatus.enabled || !cozeStatus.imageGenerationEnabled) {
          return {
            service: 'none',
            reason: 'Coze Image Generation 未启用，无法生成产品图',
            confidence: 0,
          };
        }
        return {
          service: 'coze',
          reason: '产品图生成需要生图能力，使用 Coze Image Generation',
          confidence: 0.95,
        };

      case 'quote-enhancement':
        // 报价增强是混合任务，优先 TokenHub，其次 DeepSeek + Coze 组合
        if (tokenhubPrimary) {
          return {
            service: 'tokenhub',
            reason: 'TokenHub 统一网关已启用，报价增强走统一网关（支持联网搜索+对话）',
            confidence: 0.92,
          };
        }
        const services = [];
        if (deepseekAvailable) services.push('deepseek');
        if (cozeStatus.enabled) services.push('coze');

        if (services.length === 0) {
          return {
            service: 'none',
            reason: 'TokenHub/DeepSeek 和 Coze 均不可用，无法增强报价',
            confidence: 0,
          };
        }

        return {
          service: services.length > 1 ? 'both' : (services[0] as 'deepseek' | 'coze'),
          reason: `报价增强需要组合能力：${services.join(' + ')}`,
          confidence: services.length > 1 ? 0.9 : 0.7,
        };

      default:
        return {
          service: tokenhubPrimary ? 'tokenhub' : deepseekAvailable ? 'deepseek' : 'coze',
          reason: tokenhubPrimary ? '默认使用 TokenHub 统一网关' : '默认使用 DeepSeek，降级到 Coze',
          confidence: tokenhubPrimary ? 0.75 : deepseekAvailable ? 0.7 : 0.5,
        };
    }
  }

  /**
   * 检查服务可用性
   */
  checkAvailability(service: ServiceType): {
    available: boolean;
    tokenhubAvailable: boolean;
    deepseekAvailable: boolean;
    cozeAvailable: boolean;
    geminiAvailable: boolean;
    cozeTools: {
      webSearch: boolean;
      embedding: boolean;
      imageGeneration: boolean;
    };
  } {
    const tokenhubAvailable = isTokenHubConfigured();
    const deepseekAvailable = !!process.env.DEEPSEEK_API_KEY;
    const cozeStatus = cozeToolsService.getStatus();

    let available = false;

    switch (service) {
      case 'tokenhub':
        available = tokenhubAvailable;
        break;
      case 'deepseek':
        available = deepseekAvailable;
        break;
      case 'coze':
        available = cozeStatus.enabled;
        break;
      case 'gemini':
        available = !!process.env.LAOZHANG_API_KEY;
        break;
      case 'both':
        available = deepseekAvailable && cozeStatus.enabled;
        break;
      case 'none':
        available = true; // 'none' 总是可用的（表示不使用服务）
        break;
      case 'auto':
        available =
          tokenhubAvailable || deepseekAvailable || cozeStatus.enabled || !!process.env.LAOZHANG_API_KEY;
        break;
    }

    return {
      available,
      tokenhubAvailable,
      deepseekAvailable,
      cozeAvailable: cozeStatus.enabled,
      geminiAvailable: !!process.env.LAOZHANG_API_KEY,
      cozeTools: {
        webSearch: cozeStatus.webSearchEnabled,
        embedding: cozeStatus.embeddingEnabled,
        imageGeneration: cozeStatus.imageGenerationEnabled,
      },
    };
  }

  /**
   * 获取推荐配置
   */
  getRecommendation(): {
    recommendation: string;
    currentSetup: {
      deepseek: boolean;
      coze: boolean;
      cozeTools: string[];
    };
    optimalSetup: {
      description: string;
      deepseekRequired: boolean;
      cozeRequired: boolean;
      cozeTools: string[];
    };
  } {
    const availability = this.checkAvailability('auto');
    const cozeStatus = cozeToolsService.getStatus();

    const cozeToolsList = [];
    if (cozeStatus.webSearchEnabled) cozeToolsList.push('Web Search');
    if (cozeStatus.embeddingEnabled) cozeToolsList.push('Embedding');
    if (cozeStatus.imageGenerationEnabled) cozeToolsList.push('Image Generation');

    return {
      recommendation:
        availability.tokenhubAvailable
          ? '✅ TokenHub 统一网关已就绪（主路由）。直连 Key 保留作降级备用，所有功能可正常使用'
          : availability.deepseekAvailable && availability.cozeAvailable
            ? '✅ 完美配置！DeepSeek + Coze 双引擎已就绪，所有功能可正常使用'
            : availability.deepseekAvailable
              ? '⚠️  基础配置可用。建议配置 TokenHub 统一网关或启用 Coze 工具以获得市场价格查询能力'
              : availability.cozeAvailable
                ? '⚠️  部分配置可用。建议配置 DeepSeek API Key 以获得完整的对话和技术方案生成能力'
                : '❌ 无可用AI服务。请配置 TokenHub 统一网关或 DeepSeek/Coze',
      currentSetup: {
        deepseek: availability.deepseekAvailable,
        coze: availability.cozeAvailable,
        cozeTools: cozeToolsList,
      },
      optimalSetup: {
        description: '推荐配置：TokenHub（统一网关：对话/搜索/生图）+ 直连 Key（降级备用）',
        deepseekRequired: true,
        cozeRequired: true,
        cozeTools: ['Web Search', 'Embedding', 'Image Generation'],
      },
    };
  }

  /**
   * 执行任务（自动选择服务）
   */
  async executeTask<T>(
    taskType: TaskType,
    taskFn: (service: ServiceType) => Promise<T>
  ): Promise<{
    result: T;
    serviceUsed: ServiceType;
    selection: ServiceSelection;
  }> {
    const selection = this.selectService(taskType);

    Logger.info(`[AIServiceSelector] 执行任务: ${taskType}`, {
      选择服务: selection.service,
      原因: selection.reason,
      置信度: selection.confidence,
    });

    try {
      const result = await taskFn(selection.service);

      return {
        result,
        serviceUsed: selection.service,
        selection,
      };
    } catch (error) {
      Logger.error(`[AIServiceSelector] 任务执行失败: ${taskType}`, error);

      // 尝试降级
      if (selection.service !== 'deepseek' && selection.service !== 'none') {
        Logger.info('[AIServiceSelector] 尝试降级到 DeepSeek');
        try {
          const result = await taskFn('deepseek');
          return {
            result,
            serviceUsed: 'deepseek',
            selection: {
              service: 'deepseek',
              reason: '原服务失败，降级到 DeepSeek',
              confidence: 0.5,
            },
          };
        } catch (fallbackError) {
          Logger.error('[AIServiceSelector] 降级也失败', fallbackError);
          throw error;
        }
      }

      throw error;
    }
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const aiServiceSelector = AIServiceSelector.getInstance();
