/**
 * MiniMax M2 Her 客户端
 *
 * 支持 200K 上下文和联网搜索，
 * 适合市场行情对比和最新数据查询。
 */

const MINIMAX_API_KEY = process.env.MINIMAX_M2_HER_API_KEY;
const MINIMAX_API_URL =
  process.env.MINIMAX_M2_HER_API_URL || 'https://api.minimaxi.com/v1/chat/completions';
const MINIMAX_MODEL = process.env.MINIMAX_M2_HER_MODEL || 'minimax-m2-her';

export interface MiniMaxMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface MiniMaxOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  enableSearch?: boolean;
}

export async function callMiniMax(
  messages: MiniMaxMessage[],
  options: MiniMaxOptions = {}
): Promise<string> {
  if (!MINIMAX_API_KEY) {
    throw new Error('MINIMAX_M2_HER_API_KEY 未配置');
  }

  const {
    temperature = 0.7,
    max_tokens = 4096,
    top_p = 0.9,
    enableSearch = true,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const requestBody: Record<string, unknown> = {
      model: MINIMAX_MODEL,
      messages,
      temperature,
      max_tokens,
      top_p,
      stream: false,
    };

    // 启用联网搜索
    if (enableSearch) {
      requestBody.tools = [
        {
          type: 'web_search',
          web_search: {
            enable: true,
          },
        },
      ];
    }

    const response = await fetch(MINIMAX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax API 错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('MiniMax 返回空响应');
    }

    return data.choices[0].message.content;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('MiniMax 请求超时');
    }

    throw error;
  }
}

/**
 * 流式调用 MiniMax M2 Her
 */
export async function* streamMiniMax(
  messages: MiniMaxMessage[],
  options: MiniMaxOptions = {}
): AsyncGenerator<string, void, unknown> {
  if (!MINIMAX_API_KEY) {
    throw new Error('MINIMAX_M2_HER_API_KEY 未配置');
  }

  const {
    temperature = 0.7,
    max_tokens = 4096,
    top_p = 0.9,
    enableSearch = true,
  } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const requestBody: Record<string, unknown> = {
      model: MINIMAX_MODEL,
      messages,
      temperature,
      max_tokens,
      top_p,
      stream: true,
    };

    if (enableSearch) {
      requestBody.tools = [
        {
          type: 'web_search',
          web_search: {
            enable: true,
          },
        },
      ];
    }

    const response = await fetch(MINIMAX_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${MINIMAX_API_KEY}`,
      },
      body: JSON.stringify(requestBody),
      signal: controller.signal,
    });

    clearTimeout(timeoutId);

    if (!response.ok) {
      const errorText = await response.text();
      throw new Error(`MiniMax API 错误 (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('MiniMax 流式响应无 body');
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
      throw new Error('MiniMax 请求超时');
    }

    throw error;
  }
}
