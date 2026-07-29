import { callGemmaLocal, isGemmaAvailable } from './gemma-local-client';

export type TaskType = 'chat' | 'quote' | 'analyze_image' | 'analyze_doc' | 'price_query';

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
