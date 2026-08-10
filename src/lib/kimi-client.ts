/**
 * Kimi K2.7 Code 客户端
 *
 * 专注代码优化和结构化数据生成。
 */

const KIMI_API_KEY = process.env.KIMI_K2_7_CODE_API_KEY;
const KIMI_API_URL =
  process.env.KIMI_K2_7_CODE_API_URL || 'https://api.moonshot.cn/v1/chat/completions';
const KIMI_MODEL = process.env.KIMI_K2_7_CODE_MODEL || 'moonshot-v1-8k';

export interface KimiMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface KimiOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
}

export async function callKimi(
  messages: KimiMessage[],
  options: KimiOptions = {}
): Promise<string> {
  if (!KIMI_API_KEY) {
    throw new Error('KIMI_K2_7_CODE_API_KEY 未配置');
  }

  const { temperature = 0.3, max_tokens = 4096, top_p = 0.9 } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(KIMI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KIMI_API_KEY}`,
      },
      body: JSON.stringify({
        model: KIMI_MODEL,
        messages,
        temperature,
        max_tokens,
        top_p,
        stream: false,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kimi API 错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('Kimi 返回空响应');
    }

    return data.choices[0].message.content;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Kimi 请求超时');
    }

    throw error;
  }
}

/**
 * 流式调用 Kimi K2.7 Code
 */
export async function* streamKimi(
  messages: KimiMessage[],
  options: KimiOptions = {}
): AsyncGenerator<string, void, unknown> {
  if (!KIMI_API_KEY) {
    throw new Error('KIMI_K2_7_CODE_API_KEY 未配置');
  }

  const { temperature = 0.3, max_tokens = 4096, top_p = 0.9 } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(KIMI_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${KIMI_API_KEY}`,
      },
      body: JSON.stringify({
        model: KIMI_MODEL,
        messages,
        temperature,
        max_tokens,
        top_p,
        stream: true,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`Kimi API 错误 (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('Kimi 流式响应无 body');
    }

    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        const trimmed = line.trim();
        if (!trimmed || !trimmed.startsWith('data: ')) continue;

        const jsonStr = trimmed.slice(6);
        if (jsonStr === '[DONE]') return;

        try {
          const parsed = JSON.parse(jsonStr);
          const content = parsed.choices?.[0]?.delta?.content;
          if (content) {
            yield content;
          }
        } catch {
          // 跳过无法解析的行
        }
      }
    }
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('Kimi 请求超时');
    }

    throw error;
  }
}
