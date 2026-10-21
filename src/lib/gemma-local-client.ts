import OpenAI from 'openai';

// 初始化 Gemma 客户端
const gemmaClient = new OpenAI({
  baseURL: process.env.GEMMA_API_URL || 'http://localhost:11434/v1',
  apiKey: 'ollama', // Ollama 不需要真实 API Key
});

// 非流式调用
export async function callGemmaLocal(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  options?: { temperature?: number; max_tokens?: number }
): Promise<string | null> {
  try {
    const controller = new AbortController();
    const timeout = setTimeout(
      () => controller.abort(),
      parseInt(process.env.GEMMA_TIMEOUT || '30000')
    );

    const response = await gemmaClient.chat.completions.create(
      {
        model: process.env.GEMMA_MODEL || 'gemma4:e4b',
        messages: messages as any,
        temperature: options?.temperature ?? 0.7,
        max_tokens: options?.max_tokens ?? parseInt(process.env.GEMMA_MAX_TOKENS || '2048'),
      },
      { signal: controller.signal }
    );

    clearTimeout(timeout);
    return response.choices[0]?.message?.content || null;
  } catch (error: any) {
    console.error('[GemmaLocal] 调用失败:', error.message);
    return null;
  }
}

// 流式调用
export async function streamGemmaLocal(
  messages: { role: 'system' | 'user' | 'assistant'; content: string }[],
  onChunk: (chunk: string) => void,
  options?: { temperature?: number }
): Promise<void> {
  try {
    const stream = await gemmaClient.chat.completions.create({
      model: process.env.GEMMA_MODEL || 'gemma4:e4b',
      messages: messages as any,
      temperature: options?.temperature ?? 0.7,
      stream: true,
    });

    for await (const chunk of stream) {
      const content = chunk.choices[0]?.delta?.content;
      if (content) {
        onChunk(content);
      }
    }
  } catch (error: any) {
    console.error('[GemmaLocal] 流式调用失败:', error.message);
    throw error;
  }
}

// 检查 Gemma 服务是否可用
export async function isGemmaAvailable(): Promise<boolean> {
  try {
    const response = await fetch('http://localhost:11434/api/tags');
    if (!response.ok) return false;
    const data = await response.json();
    const models = data.models || [];
    return models.some((m: any) => m.name.includes('gemma4'));
  } catch {
    return false;
  }
}
