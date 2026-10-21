/**
 * TokenHub 统一网关客户端
 *
 * 功能：
 * 1. 对话补全（非流式 / 流式，OpenAI 兼容）
 * 2. 联网搜索（通过 Chat API + web_search_options，返回带引用来源 search_results）
 * 3. 图像生成（hunyuan-image / flux）
 *
 * 设计目标：
 * - 统一密钥管理：一个 TOKENHUB_API_KEY 替代多个模型的独立 Key
 * - 按场景灵活切换模型：通过 model / 环境变量切换，不改代码
 * - 智能降级：本客户端负责调用，调用失败时由上层（AIClient / searchWeb）降级到直连原模型
 *
 * 参考文档：
 * - 调用指南：https://cloud.tencent.cn/document/product/1823/130079
 * - 联网搜索：https://cloud.tencent.cn/document/product/1823/132358
 */

// ============================================================================
// 类型定义
// ============================================================================

export interface TokenHubMessage {
  role: 'system' | 'user' | 'assistant';
  content: string;
}

export interface TokenHubSearchOptions {
  /** 是否开启联网搜索 */
  enabled?: boolean;
  /** 搜索版本：lite（轻量）/ standard（标准，默认） */
  search_source?: 'lite' | 'standard';
  /** 用户位置（可选，用于本地化搜索） */
  user_location?: {
    type?: string;
    country?: string;
    region?: string;
    city?: string;
    timezone?: string;
  };
}

export interface TokenHubChatParams {
  messages: TokenHubMessage[];
  /** 项目内部模型名（如 deepseek / deepseek-v4-pro / glm / kimi-k2.7-code），会自动映射到 TokenHub 模型名 */
  model?: string;
  temperature?: number;
  maxTokens?: number;
  /** 联网搜索选项（仅 Chat API 支持） */
  search_options?: TokenHubSearchOptions;
  signal?: AbortSignal;
  /** 是否流式 */
  stream?: boolean;
}

export interface TokenHubSearchResultItem {
  index: number;
  url: string;
  name: string;
  snippet: string;
  site: string;
}

export interface TokenHubChatResponse {
  text: string;
  /** 联网搜索引用来源（choices[0].message.search_results） */
  search_results?: TokenHubSearchResultItem[];
  usage?: {
    prompt_tokens?: number;
    completion_tokens?: number;
    total_tokens?: number;
  };
}

export interface TokenHubWebSearchResult {
  items: Array<{
    title: string;
    snippet: string;
    url: string;
    site?: string;
    index?: number;
  }>;
  abstract?: string;
}

// ============================================================================
// 配置读取与模型映射
// ============================================================================

const BASE_URL = process.env.TOKENHUB_BASE_URL || 'https://tokenhub.tencentmaas.com/v1';
const API_KEY = process.env.TOKENHUB_API_KEY || '';
const SEARCH_ENABLED = process.env.TOKENHUB_SEARCH_ENABLED !== 'false';
const DEFAULT_MODEL = process.env.TOKENHUB_DEFAULT_MODEL || 'deepseek-v4-pro';

/**
 * 项目内部模型名 → TokenHub 模型名映射
 * 直连模型名与 TokenHub 模型名可能不同，通过此表转换。
 * 可通过环境变量 TOKENHUB_CHAT_MODEL / TOKENHUB_SEARCH_MODEL 覆盖默认模型。
 */
export const TOKENHUB_MODEL_MAP: Record<string, string> = {
  // DeepSeek
  deepseek: process.env.TOKENHUB_CHAT_MODEL || 'deepseek-v4-pro',
  'deepseek-v4-pro': 'deepseek-v4-pro',
  'deepseek-v4-flash': 'deepseek-v4-flash',
  'deepseek-v3': process.env.TOKENHUB_CHAT_MODEL || 'deepseek-v3-pro',
  'deepseek-v3-pro': 'deepseek-v3-pro',
  // GLM（TokenHub 无 glm-5.2-high，使用 glm-5.2）
  glm: process.env.TOKENHUB_CHAT_MODEL || 'glm-5.2',
  'glm-5.2': 'glm-5.2',
  // Kimi
  'kimi-k2.7-code': 'kimi-k2.7-code',
  'kimi-k2.6': 'kimi-k2.6',
  // MiniMax（TokenHub 暂无对应模型，统一降级到 DeepSeek V4 Pro）
  'minimax-m2-her': 'deepseek-v4-pro',
  'minimax-m2.5': 'deepseek-v4-pro',
  'minimax-m2.7': 'deepseek-v4-pro',
  // 腾讯混元
  'hy3': 'hy3',
  'hy3-preview': 'hy3-preview',
  // 默认兜底
  '*': DEFAULT_MODEL,
};

/**
 * 将项目内部模型名映射为 TokenHub 模型名
 */
export function resolveTokenHubModel(model?: string): string {
  if (!model) return DEFAULT_MODEL;
  return TOKENHUB_MODEL_MAP[model] || DEFAULT_MODEL;
}

/**
 * 检查 TokenHub 是否已配置
 */
export function isTokenHubConfigured(): boolean {
  return !!API_KEY;
}

/**
 * 获取当前主/备路由优先级
 */
export function getProviderPriority(): 'tokenhub' | 'direct' {
  return process.env.AI_PROVIDER_PRIORITY === 'direct' ? 'direct' : 'tokenhub';
}

// ============================================================================
// TokenHub 客户端
// ============================================================================

class TokenHubClient {
  private baseURL: string;
  private apiKey: string;

  constructor() {
    this.baseURL = BASE_URL;
    this.apiKey = API_KEY;
  }

  /** 是否已配置可用 */
  isConfigured(): boolean {
    return isTokenHubConfigured();
  }

  /** 是否应作为主路由（配置了 Key 且优先级为 tokenhub） */
  shouldUseAsPrimary(): boolean {
    return isTokenHubConfigured() && getProviderPriority() === 'tokenhub';
  }

  /**
   * 构建请求体
   */
  private buildBody(params: TokenHubChatParams): Record<string, unknown> {
    const body: Record<string, unknown> = {
      model: resolveTokenHubModel(params.model),
      messages: params.messages,
      stream: !!params.stream,
    };

    if (params.temperature !== undefined) body.temperature = params.temperature;
    if (params.maxTokens !== undefined) body.max_tokens = params.maxTokens;

    // 联网搜索（Chat API 方式：web_search_options）
    if (params.search_options?.enabled !== false && SEARCH_ENABLED) {
      body.web_search_options = {
        enable: params.search_options?.enabled ?? true,
      };
      if (params.search_options?.search_source) {
        (body.web_search_options as Record<string, unknown>).search_source =
          params.search_options.search_source;
      }
      if (params.search_options?.user_location) {
        (body.web_search_options as Record<string, unknown>).user_location =
          params.search_options.user_location;
      }
    }

    return body;
  }

  /**
   * 解析非流式响应
   */
  private parseChatResponse(data: any): TokenHubChatResponse {
    const message = data?.choices?.[0]?.message;
    return {
      text: message?.content || '',
      search_results: Array.isArray(message?.search_results)
        ? message.search_results
        : undefined,
      usage: data?.usage
        ? {
            prompt_tokens: data.usage.prompt_tokens,
            completion_tokens: data.usage.completion_tokens,
            total_tokens: data.usage.total_tokens,
          }
        : undefined,
    };
  }

  /**
   * 非流式对话补全（OpenAI 兼容 /chat/completions）
   */
  async chat(params: TokenHubChatParams): Promise<TokenHubChatResponse> {
    if (!this.apiKey) {
      throw new Error('TOKENHUB_API_KEY 未配置');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 120000);
    if (params.signal) {
      // 外部取消优先
      params.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(this.buildBody({ ...params, stream: false })),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`TokenHub API 错误 ${response.status}: ${errorText.slice(0, 300)}`);
      }

      const data = await response.json();
      return this.parseChatResponse(data);
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('TokenHub 请求超时或已取消');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 流式对话补全（SSE 解析）
   */
  async *streamChat(params: TokenHubChatParams): AsyncGenerator<string, void, unknown> {
    if (!this.apiKey) {
      throw new Error('TOKENHUB_API_KEY 未配置');
    }

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 180000);
    if (params.signal) {
      params.signal.addEventListener('abort', () => controller.abort(), { once: true });
    }

    try {
      const response = await fetch(`${this.baseURL}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify(this.buildBody({ ...params, stream: true })),
        signal: controller.signal,
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`TokenHub 流式 API 错误 ${response.status}: ${errorText.slice(0, 300)}`);
      }

      if (!response.body) {
        throw new Error('TokenHub 流式响应无 body');
      }

      const reader = response.body.getReader();
      const decoder = new TextDecoder();
      let buffer = '';

      while (true) {
        if (params.signal?.aborted) break;

        const { done, value } = await reader.read();
        if (done) break;

        buffer += decoder.decode(value, { stream: true });

        // 按行解析 SSE
        const lines = buffer.split('\n');
        buffer = lines.pop() || '';

        for (const line of lines) {
          const trimmed = line.trim();
          if (!trimmed.startsWith('data:')) continue;

          const payload = trimmed.slice(5).trim();
          if (payload === '[DONE]') return;

          try {
            const chunk = JSON.parse(payload);
            const content = chunk?.choices?.[0]?.delta?.content || '';
            if (content) {
              yield content;
            }
          } catch {
            // 忽略无法解析的 chunk
          }
        }
      }
    } catch (error: any) {
      if (error.name === 'AbortError') {
        throw new Error('TokenHub 流式请求超时或已取消');
      }
      throw error;
    } finally {
      clearTimeout(timeout);
    }
  }

  /**
   * 联网搜索（通过 Chat API + web_search_options）
   * 返回带引用来源的搜索结果，并附带模型生成的回答摘要。
   */
  async webSearch(
    query: string,
    options?: { model?: string; search_source?: 'lite' | 'standard'; systemPrompt?: string }
  ): Promise<TokenHubWebSearchResult | null> {
    if (!this.apiKey) {
      return null;
    }

    const model = options?.model || process.env.TOKENHUB_SEARCH_MODEL || 'deepseek-v4-pro';

    try {
      const response = await this.chat({
        model,
        search_options: {
          enabled: true,
          search_source: options?.search_source || 'standard',
        },
        temperature: 0.3,
        maxTokens: 2048,
        messages: [
          {
            role: 'system',
            content:
              options?.systemPrompt ||
              '你是一个专业的搜索助手。请根据用户的查询进行联网搜索，返回最新的、准确的信息。回答要简洁、结构化，并在正文中用 [1][2] 标注引用来源。',
          },
          {
            role: 'user',
            content: query,
          },
        ],
      });

      const searchResults = response.search_results || [];

      if (!response.text && searchResults.length === 0) {
        return null;
      }

      const items = searchResults.map((r) => ({
        title: r.name || r.site || `来源 ${r.index}`,
        snippet: r.snippet || '',
        url: r.url,
        site: r.site,
        index: r.index,
      }));

      return {
        items,
        abstract: response.text || '',
      };
    } catch (error: any) {
      console.error('[TokenHub] 联网搜索失败:', error?.message || error);
      return null;
    }
  }

  /**
   * 图像生成（hunyuan-image / flux）
   * 注意：TokenHub 图像生成使用独立端点（非 chat/completions），
   * 如实际端点有差异请根据官方文档调整。
   */
  async generateImage(prompt: string, options?: { model?: string; size?: string }): Promise<string | null> {
    if (!this.apiKey) {
      return null;
    }

    const model = options?.model || process.env.TOKENHUB_IMAGE_MODEL || 'hunyuan-image';

    try {
      const response = await fetch(`${this.baseURL}/images/generations`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${this.apiKey}`,
        },
        body: JSON.stringify({
          model,
          prompt,
          n: 1,
          size: options?.size || '1024x1024',
        }),
        signal: AbortSignal.timeout(120000),
      });

      if (!response.ok) {
        const errorText = await response.text().catch(() => '');
        throw new Error(`TokenHub 生图 API 错误 ${response.status}: ${errorText.slice(0, 300)}`);
      }

      const data = await response.json();
      const url = data?.data?.[0]?.url || data?.data?.[0]?.b64_json;
      return url || null;
    } catch (error: any) {
      console.error('[TokenHub] 图像生成失败:', error?.message || error);
      return null;
    }
  }
}

// ============================================================================
// 导出单例
// ============================================================================

export const tokenHubClient = new TokenHubClient();
