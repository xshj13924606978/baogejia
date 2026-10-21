/**
 * GLM 客户端（智谱 AI，OpenAI 兼容接口）
 *
 * GLM-5.2 High：中文理解顶级，适合中文专业场景、技术方案生成。
 */

const GLM_API_KEY = process.env.GLM_API_KEY;
const GLM_API_URL =
  process.env.GLM_API_URL || 'https://open.bigmodel.cn/api/paas/v4/chat/completions';
const GLM_MODEL = process.env.GLM_MODEL || 'glm-5.2';

export interface GLMMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface GLMOptions {
  temperature?: number;
  max_tokens?: number;
  top_p?: number;
  stream?: boolean;
}

export async function callGLM(
  messages: GLMMessage[],
  options: GLMOptions = {}
): Promise<string> {
  if (!GLM_API_KEY) {
    throw new Error('GLM_API_KEY 未配置');
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
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: GLM_MODEL,
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
      throw new Error(`GLM API 错误 (${response.status}): ${errorText}`);
    }

    const data = await response.json();

    if (!data.choices || data.choices.length === 0) {
      throw new Error('GLM 返回空响应');
    }

    return data.choices[0].message.content;
  } catch (error: unknown) {
    clearTimeout(timeoutId);

    if (error instanceof Error && error.name === 'AbortError') {
      throw new Error('GLM 请求超时');
    }

    throw error;
  }
}

/**
 * 流式调用 GLM
 */
export async function* streamGLM(
  messages: GLMMessage[],
  options: GLMOptions = {}
): AsyncGenerator<string, void, unknown> {
  if (!GLM_API_KEY) {
    throw new Error('GLM_API_KEY 未配置');
  }

  const { temperature = 0.7, max_tokens = 4096, top_p = 0.9 } = options;

  const controller = new AbortController();
  const timeoutId = setTimeout(() => controller.abort(), 120000);

  try {
    const response = await fetch(GLM_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        Authorization: `Bearer ${GLM_API_KEY}`,
      },
      body: JSON.stringify({
        model: GLM_MODEL,
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
      throw new Error(`GLM API 错误 (${response.status}): ${errorText}`);
    }

    const reader = response.body?.getReader();
    if (!reader) {
      throw new Error('GLM 流式响应无 body');
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
      throw new Error('GLM 请求超时');
    }

    throw error;
  }
}
