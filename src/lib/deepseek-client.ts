import OpenAI from 'openai';
import {  ChatCompletionChunk } from 'openai/resources/chat/completions';
import { Stream } from 'openai/streaming';

// 定义支持的AI模型类型
export type AIModel =
  | 'deepseek'
  | 'deepseek-v4-pro'
  | 'coze'
  | 'gemini'
  | 'gemma'
  | 'minimax-m2-her'
  | 'kimi-k2.7-code'
  | 'octopus-rpa';

// 聊天补全参数接口
export interface ChatCompletionParams {
  messages: Array<{
    role: 'system' | 'user' | 'assistant';
    content: string;
  }>;
  temperature?: number;
  maxTokens?: number;
  stream?: boolean;
  conversationId?: string;
  model?: AIModel;
  signal?: AbortSignal;
}

// AI响应接口
export interface AIResponse {
  text: string;
  model: AIModel;
  conversationId?: string;
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

// 统一AI客户端类
export class AIClient {
  private deepseekClient: OpenAI;
  private geminiClient: OpenAI | null = null;
  private cozeClient: any;
  private gemmaClient: OpenAI | null = null;

  constructor() {
    // 初始化DeepSeek客户端
    const apiKey = process.env.DEEPSEEK_API_KEY;
    const baseURL = process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1';

    if (!apiKey) {
      console.warn('DEEPSEEK_API_KEY 未配置，DeepSeek功能将不可用');
    }

    this.deepseekClient = new OpenAI({
      apiKey: apiKey || 'dummy-key',
      baseURL,
      dangerouslyAllowBrowser: false,
    });

    // 初始化Gemini客户端（LaoZhang.ai 中转）
    const laoZhangApiKey = process.env.LAOZHANG_API_KEY;
    const laoZhangBaseURL = process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1';

    if (laoZhangApiKey) {
      this.geminiClient = new OpenAI({
        apiKey: laoZhangApiKey,
        baseURL: laoZhangBaseURL,
        dangerouslyAllowBrowser: false,
      });
    } else {
      console.warn('LAOZHANG_API_KEY 未配置，Gemini功能将不可用');
    }

    this.cozeClient = null;
  }

  /**
   * 主要聊天接口
   */
  async chat(params: ChatCompletionParams): Promise<AIResponse> {
    const model = params.model || this.selectDefaultModel();

    try {
      switch (model) {
        case 'deepseek':
          return await this.callDeepSeek(params);
        case 'gemini':
          return await this.callGemini(params);
        case 'coze':
          return await this.callCoze(params);
        default:
          return await this.callDeepSeek(params);
      }
    } catch (error) {
      console.error(`${model} 调用失败:`, error);

      // 如果指定模型失败且有备用模型，尝试切换
      if (model === 'gemini') {
        // Gemini失败，尝试DeepSeek
        if (process.env.DEEPSEEK_API_KEY) {
          return await this.callDeepSeek(params);
        }
      } else if (model === 'deepseek') {
        // DeepSeek失败，尝试Gemini
        if (this.geminiClient) {
          return await this.callGemini(params);
        }
        // DeepSeek失败，尝试Coze（如果可用）
        if (await this.isCozeAvailable()) {
          return await this.callCoze(params);
        }
      } else if (model === 'coze') {
        // Coze失败，尝试DeepSeek
        return await this.callDeepSeek(params);
      }

      // 所有尝试都失败
      throw error;
    }
  }

  /**
   * 选择默认模型
   */
  private selectDefaultModel(): AIModel {
    return 'deepseek';
  }

  /**
   * 检查Coze是否可用
   */
  private async isCozeAvailable(): Promise<boolean> {
    return !!(process.env.COZE_API_KEY && this.cozeClient);
  }

  /**
   * 调用DeepSeek API（非流式）
   */
  private async callDeepSeek(params: ChatCompletionParams): Promise<AIResponse> {
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY未配置');
    }

    try {

      // 使用原生 fetch 调用 DeepSeek API
      const response = await fetch(`${process.env.DEEPSEEK_BASE_URL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${process.env.DEEPSEEK_API_KEY}`,
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
          messages: params.messages,
          temperature: params.temperature ?? 0.7,
          max_tokens: params.maxTokens ?? 4096,
          stream: false,
        }),
        signal: AbortSignal.timeout(60000),
      });

      if (!response.ok) {
        const errorText = await response.text();
        console.error('[DeepSeek] API 请求失败:', response.status, errorText);
        throw new Error(`DeepSeek API 错误 ${response.status}: ${errorText}`);
      }

      const data = await response.json();

      return {
        text: data.choices[0]?.message?.content || '',
        model: 'deepseek',
        conversationId: params.conversationId,
        usage: data.usage
          ? {
              prompt_tokens: data.usage.prompt_tokens,
              completion_tokens: data.usage.completion_tokens,
              total_tokens: data.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error: any) {
      console.error('DeepSeek API详细错误:', error);

      if (error.status === 401) {
        throw new Error('DeepSeek API认证失败，请检查API Key');
      } else if (error.status === 429) {
        throw new Error('DeepSeek API请求超限，请稍后重试');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('无法连接到DeepSeek API，请检查网络');
      }

      throw new Error(`DeepSeek API调用失败: ${error.message}`);
    }
  }

  /**
   * 调用Gemini API（非流式，通过 LaoZhang.ai 中转）
   */
  private async callGemini(params: ChatCompletionParams): Promise<AIResponse> {
    if (!this.geminiClient) {
      throw new Error('LAOZHANG_API_KEY未配置，Gemini不可用');
    }

    try {

      const response = await this.geminiClient.chat.completions.create({
        model: process.env.LAOZHANG_MODEL || 'gemini-2.5-flash',
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 8192,
      });


      return {
        text: response.choices[0]?.message?.content || '',
        model: 'gemini',
        conversationId: params.conversationId,
        usage: response.usage
          ? {
              prompt_tokens: response.usage.prompt_tokens,
              completion_tokens: response.usage.completion_tokens,
              total_tokens: response.usage.total_tokens,
            }
          : undefined,
      };
    } catch (error: any) {
      console.error('Gemini API详细错误:', error);

      if (error.status === 401) {
        throw new Error('Gemini API认证失败，请检查API Key');
      } else if (error.status === 429) {
        throw new Error('Gemini API请求超限，请稍后重试');
      } else if (error.code === 'ECONNREFUSED') {
        throw new Error('无法连接到Gemini API，请检查网络');
      }

      throw new Error(`Gemini API调用失败: ${error.message}`);
    }
  }

  /**
   * 调用Coze API（预留接口）
   */
  private async callCoze(params: ChatCompletionParams): Promise<AIResponse> {

    const lastMessage = params.messages[params.messages.length - 1]?.content || '';

    return {
      text: `[Coze API预留接口] 您的消息已收到，但Coze服务当前未启用。\n\n您发送的是：${lastMessage.substring(0, 100)}${lastMessage.length > 100 ? '...' : ''}`,
      model: 'coze',
      conversationId: params.conversationId,
    };
  }

  /**
   * 流式调用（根据 model 参数分发到不同模型）
   */
  async *streamChat(params: ChatCompletionParams): AsyncGenerator<string, void, unknown> {
    const model = params.model || 'deepseek';
    const signal = params.signal;

    try {
      if (model === 'gemma') {
        yield* this.streamGemma(params);
      } else if (model === 'gemini') {
        yield* this.streamGemini(params);
      } else if (model === 'deepseek-v4-pro') {
        yield* this.streamDeepSeekV4Pro(params);
      } else if (model === 'minimax-m2-her') {
        yield* this.streamMiniMax(params);
      } else if (model === 'kimi-k2.7-code') {
        yield* this.streamKimi(params);
      } else if (model === 'octopus-rpa') {
        yield* this.handleOctopusRPA(params);
      } else {
        yield* this.streamDeepSeek(params);
      }
    } catch (error: any) {
      // 降级：新模型失败降级到 deepseek
      const newModels: AIModel[] = ['gemma', 'gemini', 'deepseek-v4-pro', 'minimax-m2-her', 'kimi-k2.7-code', 'octopus-rpa'];
      if ((model === 'gemma' || model === 'gemini') && process.env.DEEPSEEK_API_KEY) {
        yield* this.streamDeepSeek({ ...params, signal });
      } else if (model === 'deepseek' && this.geminiClient) {
        yield* this.streamGemini({ ...params, signal });
      } else if (newModels.includes(model) && process.env.DEEPSEEK_API_KEY) {
        yield `> ${model} 暂时不可用，已切换到 DeepSeek 处理您的请求\n\n`;
        yield* this.streamDeepSeek({ ...params, signal });
      } else {
        console.error(`[AIClient] ${model}流式调用失败:`, error);
        yield `[错误] ${error.message}`;
      }
    }
  }

  /**
   * 流式调用DeepSeek
   */
  private async *streamDeepSeek(params: ChatCompletionParams): AsyncGenerator<string, void, unknown> {
    if (!process.env.DEEPSEEK_API_KEY) {
      throw new Error('DEEPSEEK_API_KEY未配置');
    }

    try {
      if (params.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const stream = (await this.deepseekClient.chat.completions.create({
        model: process.env.DEEPSEEK_MODEL || 'deepseek-chat',
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 4096,
        stream: true,
      })) as Stream<ChatCompletionChunk>;

      for await (const chunk of stream) {
        if (params.signal?.aborted) break;
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield content;
        }
      }
    } catch (error: any) {
      console.error('DeepSeek流式调用失败:', error);
      throw error;
    }
  }

  /**
   * 流式调用 Gemma 本地模型（通过 Ollama）
   */
  private async *streamGemma(params: ChatCompletionParams): AsyncGenerator<string, void, unknown> {
    if (!this.gemmaClient) {
      this.gemmaClient = new OpenAI({
        baseURL: process.env.GEMMA_API_URL || 'http://localhost:11434/v1',
        apiKey: 'ollama',
      });
    }

    try {
      if (params.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const stream = await this.gemmaClient.chat.completions.create({
        model: process.env.GEMMA_MODEL || 'gemma4:e4b',
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? parseInt(process.env.GEMMA_MAX_TOKENS || '2048'),
        stream: true,
      }) as Stream<ChatCompletionChunk>;

      for await (const chunk of stream) {
        if (params.signal?.aborted) break;
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield content;
        }
      }
    } catch (error: any) {
      console.error('[AIClient] Gemma流式调用失败:', error);
      throw error;
    }
  }

  /**
   * 流式调用Gemini（通过 LaoZhang.ai 中转）
   */
  private async *streamGemini(params: ChatCompletionParams): AsyncGenerator<string, void, unknown> {
    if (!this.geminiClient) {
      throw new Error('LAOZHANG_API_KEY未配置，Gemini不可用');
    }

    try {
      if (params.signal?.aborted) throw new DOMException('Aborted', 'AbortError');

      const stream = (await this.geminiClient.chat.completions.create({
        model: process.env.LAOZHANG_MODEL || 'gemini-2.5-flash',
        messages: params.messages,
        temperature: params.temperature ?? 0.7,
        max_tokens: params.maxTokens ?? 8192,
        stream: true,
      })) as Stream<ChatCompletionChunk>;

      for await (const chunk of stream) {
        if (params.signal?.aborted) break;
        const content = chunk.choices[0]?.delta?.content || '';
        if (content) {
          yield content;
        }
      }
    } catch (error: any) {
      console.error('Gemini流式调用失败:', error);
      throw error;
    }
  }

  /**
   * 流式调用 DeepSeek V4 Pro
   */
  private async *streamDeepSeekV4Pro(params: ChatCompletionParams): AsyncGenerator<string, void, unknown> {
    const { streamDeepSeekV4Pro } = await import('./deepseek-v4-pro-client');
    yield* streamDeepSeekV4Pro(params.messages, {
      temperature: params.temperature,
      max_tokens: params.maxTokens,
    });
  }

  /**
   * 流式调用 MiniMax M2 Her
   */
  private async *streamMiniMax(params: ChatCompletionParams): AsyncGenerator<string, void, unknown> {
    const { streamMiniMax } = await import('./minimax-client');
    yield* streamMiniMax(params.messages, {
      temperature: params.temperature,
      max_tokens: params.maxTokens,
      enableSearch: true,
    });
  }

  /**
   * 流式调用 Kimi K2.7 Code
   */
  private async *streamKimi(params: ChatCompletionParams): AsyncGenerator<string, void, unknown> {
    const { streamKimi } = await import('./kimi-client');
    yield* streamKimi(params.messages, {
      temperature: params.temperature ?? 0.3,
      max_tokens: params.maxTokens,
    });
  }

  /**
   * 八爪鱼 RPA 特殊处理（数据采集模式）
   */
  private async *handleOctopusRPA(params: ChatCompletionParams): AsyncGenerator<string, void, unknown> {
    const { getOctopusAssistantMessage, executeOctopusTask } = await import('./octopus-rpa-client');

    const lastMessage = params.messages[params.messages.length - 1]?.content || '';

    // 检查是否包含 URL
    const urlMatch = lastMessage.match(/https?:\/\/[^\s]+/);

    if (urlMatch && process.env.OCTOPUS_RPA_API_KEY) {
      yield '正在通过**八爪鱼 RPA**采集网页数据...\n\n';

      try {
        const result = await executeOctopusTask({
          url: urlMatch[0],
          operation: 'extract',
          extractType: 'text',
        });

        if (result.success && result.data) {
          yield `**采集成功！**\n\n采集到的数据：\n\n\`\`\`\n${typeof result.data === 'string' ? result.data : JSON.stringify(result.data, null, 2)}\n\`\`\``;
        } else {
          yield `采集任务已提交（任务 ID: ${result.taskId}），请稍后查询结果。`;
        }
      } catch (error: any) {
        yield `采集过程出现错误: ${error.message}\n\n`;
        yield getOctopusAssistantMessage(lastMessage);
      }
    } else {
      yield getOctopusAssistantMessage(lastMessage);
    }
  }

  /**
   * 获取当前可用模型列表
   */
  getAvailableModels(): AIModel[] {
    const available: AIModel[] = [];

    if (process.env.DEEPSEEK_API_KEY) {
      available.push('deepseek');
    }

    if (process.env.DEEPSEEK_V4_PRO_API_KEY) {
      available.push('deepseek-v4-pro');
    }

    if (this.geminiClient) {
      available.push('gemini');
    }

    if (process.env.MINIMAX_M2_HER_API_KEY) {
      available.push('minimax-m2-her');
    }

    if (process.env.KIMI_K2_7_CODE_API_KEY) {
      available.push('kimi-k2.7-code');
    }

    if (process.env.OCTOPUS_RPA_API_KEY) {
      available.push('octopus-rpa');
    }

    return available;
  }
}

// 导出单例实例
export const aiClient = new AIClient();

// 向后兼容的函数
export async function callDeepSeekChat(params: ChatCompletionParams): Promise<AIResponse> {
  return aiClient.chat({ ...params, model: 'deepseek' });
}

export async function callGeminiChat(params: ChatCompletionParams): Promise<AIResponse> {
  return aiClient.chat({ ...params, model: 'gemini' });
}

export async function* streamDeepSeekChat(
  params: ChatCompletionParams
): AsyncGenerator<string, void, unknown> {
  yield* aiClient.streamChat({ ...params, model: 'deepseek' });
}

export async function* streamGeminiChat(
  params: ChatCompletionParams
): AsyncGenerator<string, void, unknown> {
  yield* aiClient.streamChat({ ...params, model: 'gemini' });
}

export function getAIClient(): AIClient {
  return aiClient;
}

export default aiClient;
