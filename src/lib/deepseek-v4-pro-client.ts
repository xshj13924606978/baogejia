/**
 * DeepSeek V4 Pro 客户端
 *
 * 旗舰推理模型，100万 token 上下文，
 * 适合复杂报价和技术方案生成。
 */

const DEEPSEEK_V4_PRO_API_KEY = process.env.DEEPSEEK_V4_PRO_API_KEY;
const DEEPSEEK_V4_PRO_API_URL =
  process.env.DEEPSEEK_V4_PRO_API_URL || 'https://api.deepseek.com/v1/chat/completions';
const DEEPSEEK_V4_PRO_MODEL = process.env.DEEPSEEK_V4_PRO_MODEL || 'deepseek-chat';

export interface DeepSeekV4ProMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface DeepSeekV4ProOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export async function callDeepSeekV4Pro(
  messages: DeepSeekV4ProMessage[],
  options: DeepSeekV4ProOptions = {}
): Promise<string> {
  if (!DEEPSEEK_V4_PRO_API_KEY) {
    throw new Error('DEEPSEEK_V4_PRO_API_KEY 未配置');
  }

  const {
    temperature = 0.7,
    max_tokens = 4096,
    top_p = 0.9,
    stream = false,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(DEEPSEEK_V4_PRO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_V4_PRO_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_V4_PRO_MODEL,
        messages,
        temperature,
        max_tokens,
        top_p,
        stream,
      }),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`DeepSeek V4 Pro API 错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('DeepSeek V4 Pro 返回空响应');
    }

    return data.choices[0].message.content;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('DeepSeek V4 Pro 请求超时');
    }

    throw error;
  }
}

/**
 * 流式调用 DeepSeek V4 Pro
 */
export async function* streamDeepSeekV4Pro(
  messages: DeepSeekV4ProMessage[],
  options: DeepSeekV4ProOptions = {}
): AsyncGenerator<string, void, unknown> {
  if (!DEEPSEEK_V4_PRO_API_KEY) {
    throw new Error('DEEPSEEK_V4_PRO_API_KEY 未配置');
  }

  const { temperature = 0.7, max_tokens = 4096, top_p = 0.9 } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(DEEPSEEK_V4_PRO_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${DEEPSEEK_V4_PRO_API_KEY}`,
      },
      body: JSON.stringify({
        model: DEEPSEEK_V4_PRO_MODEL,
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
      throw new Error(`DeepSeek V4 Pro API 错误 (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('DeepSeek V4 Pro 流式响应无 body');
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
      throw new Error('DeepSeek V4 Pro 请求超时');
    }

    throw error;
  }
}
