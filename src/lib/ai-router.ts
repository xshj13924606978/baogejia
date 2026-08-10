import { callGemmaLocal, isGemmaAvailable } from './gemma-local-client';
import type { ModelId } from './models';

export type TaskType = 'chat' | 'quote' | 'analyze_image' | 'analyze_doc' | 'price_query'
  | 'tech_solution' | 'code_generation' | 'data_parsing' | 'market_compare' | 'simple_chat'
  | 'image_analysis' | 'document_analysis';

/**
 * AI 智能路由：根据任务类型选择最合适的模型
 * - 多模态任务（图片/文档）→ Gemini
 * - 简单对话/价格查询 → 优先 Gemma 本地，降级 DeepSeek
 * - 复杂报价 → DeepSeek
 */
export async function smartRoute(
  task: TaskType,
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: { temperature?: number; max_tokens?: number }
): Promise<string> {
  // 1. 多模态任务 → Gemini（暂未集成，降级到 DeepSeek）
  if (task === 'analyze_image' || task === 'analyze_doc') {
    const { callDeepSeekChat } = await import('./deepseek-client');
    const result = await callDeepSeekChat({
      model: 'deepseek',
      messages: messages as any,
      temperature: options?.temperature,
      maxTokens: options?.max_tokens,
    });
    return result.text || '';
  }

  // 2. 简单对话/价格查询 → 优先 Gemma 本地
  if (task === 'chat' || task === 'price_query') {
    if (process.env.GEMMA_ENABLED === 'true') {
      const gemmaResult = await callGemmaLocal(messages, options);
      if (gemmaResult) {
        return gemmaResult;
      }
    }
    const { callDeepSeekChat } = await import('./deepseek-client');
    const result = await callDeepSeekChat({
      model: 'deepseek',
      messages: messages as any,
      temperature: options?.temperature,
      maxTokens: options?.max_tokens,
    });
    return result.text || '';
  }

  // 3. 复杂报价 → DeepSeek
  if (task === 'quote') {
    const { callDeepSeekChat } = await import('./deepseek-client');
    const result = await callDeepSeekChat({
      model: 'deepseek',
      messages: messages as any,
      temperature: options?.temperature,
      maxTokens: options?.max_tokens,
    });
    return result.text || '';
  }

  // 默认降级
  const { callDeepSeekChat } = await import('./deepseek-client');
  const result = await callDeepSeekChat({
    model: 'deepseek',
    messages: messages as any,
  });
  return result.text || '';
}

// ============================================================================
// 任务类型 → 推荐模型映射表（用于自动模式）
// ============================================================================

const TASK_MODEL_MAP: Record<TaskType, ModelId[]> = {
  price_query: ['deepseek', 'gemini', 'kimi-k2.7-code'],
  tech_solution: ['deepseek', 'gemini', 'kimi-k2.7-code'],
  image_analysis: ['gemini', 'deepseek'],
  analyze_image: ['gemini', 'deepseek'],
  document_analysis: ['gemini', 'deepseek'],
  analyze_doc: ['gemini', 'deepseek'],
  code_generation: ['kimi-k2.7-code', 'deepseek', 'gemma'],
  data_parsing: ['kimi-k2.7-code', 'deepseek', 'gemini'],
  market_compare: ['minimax-m2-her', 'deepseek', 'gemini'],
  simple_chat: ['gemma', 'deepseek'],
  chat: ['deepseek', 'gemma', 'gemini'],
  quote: ['deepseek', 'gemini', 'kimi-k2.7-code'],
};

/**
 * 根据任务类型获取推荐模型列表
 */
export function getRecommendedModels(taskType: TaskType): ModelId[] {
  return TASK_MODEL_MAP[taskType] || ['deepseek'];
}

/**
 * 根据任务类型选择最佳可用模型
 */
export function selectBestModel(taskType: TaskType): ModelId {
  const recommended = getRecommendedModels(taskType);

  // 按优先级检查模型是否可用
  for (const model of recommended) {
    switch (model) {
      case 'deepseek':
        if (process.env.DEEPSEEK_API_KEY) return 'deepseek';
        break;
      case 'gemini':
        if (process.env.LAOZHANG_API_KEY) return 'gemini';
        break;
      case 'gemma':
        if (process.env.GEMMA_ENABLED === 'true') return 'gemma';
        break;
      case 'minimax-m2-her':
        if (process.env.MINIMAX_M2_HER_API_KEY) return 'minimax-m2-her';
        break;
      case 'kimi-k2.7-code':
        if (process.env.KIMI_K2_7_CODE_API_KEY) return 'kimi-k2.7-code';
        break;
      default:
        break;
    }
  }

  return 'deepseek';
}
