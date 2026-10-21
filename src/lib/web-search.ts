// 联网搜索模块 — 优先通过 TokenHub 统一网关联网搜索（带引用来源），
// 失败时降级到 DeepSeek（Responses API + web_search），再降级到 Kimi（use_search）、
// 火山引擎（火山方舟 search_options），最后兜底 LaoZhang.ai grok-4（可能不可用）
// 失败时静默降级，不影响正常对话

import OpenAI from 'openai';
import { tokenHubClient } from './tokenhub-client';

// ========== 类型定义 ==========
export interface SearchItem {
  title: string;
  snippet: string;
  url: string;
}

export interface WebSearchResult {
  items: SearchItem[];
  abstract?: string;
}

// ========== LaoZhang.ai 客户端 ==========
const searchClient = new OpenAI({
  apiKey: process.env.LAOZHANG_API_KEY,
  baseURL: process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1',
  dangerouslyAllowBrowser: false,
});

const SEARCH_MODEL = process.env.WEB_SEARCH_MODEL || 'grok-4';

// ========== 火山引擎（火山方舟）联网搜索 ==========

/**
 * 火山方舟联网搜索 — 通过 Chat Completions + search_options 实现
 * 端点: https://ark.cn-beijing.volces.com/api/v3/chat/completions（OpenAI 兼容）
 * 文档: https://docs.volcengine.com/docs/82379/2309827
 * 鉴权: VOLCENGINE_API_KEY（火山方舟控制台 → API Key 管理）
 * 模型: VOLCENGINE_MODEL（支持联网搜索的模型或接入点 ID ep-xxx）
 */
async function searchVolcEngine(query: string): Promise<WebSearchResult | null> {
  if (process.env.VOLCENGINE_SEARCH_ENABLED === 'false') {
    console.warn('[VolcEngine] VOLCENGINE_SEARCH_ENABLED=false，跳过火山引擎搜索');
    return null;
  }

  const apiKey = process.env.VOLCENGINE_API_KEY;
  if (!apiKey) {
    console.warn('[VolcEngine] 未配置 VOLCENGINE_API_KEY，跳过火山引擎搜索');
    return null;
  }

  try {
    const response = await fetch(
      `${process.env.VOLCENGINE_BASE_URL || 'https://ark.cn-beijing.volces.com/api/v3'}/chat/completions`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.VOLCENGINE_MODEL || 'doubao-seed-1-6-250615',
          messages: [
            {
              role: 'user',
              content: `请搜索与以下内容相关的最新信息，包括市场价格、产品参数、品牌供应商等：${query}`,
            },
          ],
          temperature: 0.3,
          max_tokens: 2048,
          // 启用联网搜索 + 返回引用来源
          search_options: {
            enable_source: true,
            enable_citation: true,
          },
        }),
        signal: AbortSignal.timeout(10000),
      }
    );

    if (!response.ok) {
      console.warn(`[VolcEngine] API 错误: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const message = data?.choices?.[0]?.message;
    const content: string = message?.content || '';

    // 从引用来源（citations）提取搜索结果条目
    const items: SearchItem[] = Array.isArray(message?.citations)
      ? message.citations.map((c: any) => ({
          title: c.title || c.site_name || '',
          snippet: c.content || '',
          url: c.url || '',
        }))
      : [];

    // 无引用但正文有内容时，整段作为一条结果
    if (items.length === 0 && content.trim()) {
      items.push({
        title: content.substring(0, 60),
        snippet: content,
        url: '',
      });
    }

    if (items.length === 0) {
      console.warn('[VolcEngine] 无搜索结果');
      return null;
    }

    const result: WebSearchResult = {
      items: items.slice(0, 8),
      abstract: content.substring(0, 200) || '',
    };

    setCache(query, result);
    return result;
  } catch (error: any) {
    console.warn('[VolcEngine] 搜索失败:', error?.message || error);
    return null;
  }
}

// ========== DeepSeek 联网搜索 ==========

/**
 * DeepSeek V4 原生联网搜索 — 通过 Responses API + web_search 工具
 * 端点: https://api.deepseek.com/v1/responses
 * 文档: https://api-docs.deepseek.com/guides/web_search
 * 鉴权: DEEPSEEK_API_KEY
 * 说明：chat/completions 的 search 参数会被静默忽略，必须用 Responses API。
 *       chat/completions 对 web_search 工具返回 400，仅 Responses API 支持。
 *       搜索结果是黑盒（服务端注入），只能拿到 open_page 的来源 URL（无标题）。
 */
async function searchDeepSeek(query: string): Promise<WebSearchResult | null> {
  const apiKey = process.env.DEEPSEEK_API_KEY;
  if (!apiKey) {
    console.warn('[DeepSeek] 未配置 DEEPSEEK_API_KEY，跳过 DeepSeek 搜索');
    return null;
  }

  try {
    const response = await fetch(
      `${process.env.DEEPSEEK_BASE_URL || 'https://api.deepseek.com/v1'}/responses`,
      {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${apiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          model: process.env.DEEPSEEK_SEARCH_MODEL || 'deepseek-v4-flash',
          // 简洁 prompt 引导模型少搜索、快响应（实测 8~15s 波动，主要受服务端负载影响）
          input: `请联网搜索：${query}`,
          // 启用原生联网搜索（Responses API 专用）
          tools: [{ type: 'web_search' }],
          max_output_tokens: 1024,
        }),
        // 最多等 17s（route 搜索超时 20s，留 3s 给降级链），确保 DeepSeek 结果能在超时前返回
        signal: AbortSignal.timeout(17000),
      }
    );

    if (!response.ok) {
      console.warn(`[DeepSeek] API 错误: ${response.status}`);
      return null;
    }

    const data = await response.json();
    const output = Array.isArray(data?.output) ? data.output : [];

    // 最终回答文本（message 项中的 output_text）
    const content = output
      .filter((o: any) => o?.type === 'message')
      .map((m: any) =>
        (m?.content || [])
          .filter((c: any) => c?.type === 'output_text')
          .map((c: any) => c?.text || '')
          .join('')
      )
      .join('\n')
      .trim();

    // 引用来源 URL（web_search_call → open_page 动作，剥掉 #ws_call_id= 尾巴）
    const urls: string[] = [];
    for (const o of output) {
      if (o?.type === 'web_search_call' && o?.action?.type === 'open_page' && o.action.url) {
        const url = o.action.url.replace(/#ws_call_id=.*$/, '');
        if (!urls.includes(url)) urls.push(url);
      }
    }

    const items: SearchItem[] = [];
    for (const url of urls.slice(0, 8)) {
      let title = '';
      try {
        title = new URL(url).hostname.replace(/^www\./, '');
      } catch {
        title = url.substring(0, 60);
      }
      items.push({
        title,
        snippet: content.substring(0, 150),
        url,
      });
    }

    // 无引用 URL 但正文有内容时，整段作为一条结果
    if (items.length === 0 && content) {
      items.push({
        title: content.substring(0, 60),
        snippet: content,
        url: '',
      });
    }

    if (items.length === 0) {
      console.warn('[DeepSeek] 无搜索结果');
      return null;
    }

    const result: WebSearchResult = {
      items: items.slice(0, 8),
      abstract: content.substring(0, 200),
    };

    setCache(query, result);
    console.warn('[DeepSeek] 搜索成功');
    return result;
  } catch (error: any) {
    console.warn('[DeepSeek] 搜索失败:', error?.message || error);
    return null;
  }
}

// ========== Kimi 联网搜索 ==========

/**
 * Kimi 联网搜索 — 通过内置工具 $web_search 两步调用（tool_calls）
 * 端点: https://api.moonshot.cn/v1/chat/completions
 * 鉴权: KIMI_K2_7_CODE_API_KEY
 * 模型: KIMI_K2_7_CODE_MODEL（当前账号可用 kimi-k2.7-code / kimi-k2.6）
 * 说明：k2 系模型不支持 use_search 参数（实测被忽略），必须用 builtin_function
 *       $web_search：第一轮模型返回 tool_calls，把 arguments 原样回传（role=tool），
 *       第二轮模型基于搜索结果生成最终回复。
 * 已知限制：实测 k2.7-code 第二轮生成回复需 31~40s，超出 17s 预算时静默超时降级。
 */
async function searchKimi(query: string): Promise<WebSearchResult | null> {
  const apiKey = process.env.KIMI_K2_7_CODE_API_KEY;
  if (!apiKey) {
    console.warn('[Kimi] 未配置 KIMI_K2_7_CODE_API_KEY，跳过 Kimi 搜索');
    return null;
  }

  const apiUrl = process.env.KIMI_K2_7_CODE_API_URL || 'https://api.moonshot.cn/v1/chat/completions';
  const model = process.env.KIMI_K2_7_CODE_MODEL || 'kimi-k2.7-code';
  const timeout = AbortSignal.timeout(17000);
  const headers = {
    Authorization: `Bearer ${apiKey}`,
    'Content-Type': 'application/json',
  };

  try {
    // 第一轮：触发 $web_search 工具调用
    const messages: any[] = [{ role: 'user', content: `请联网搜索最新信息：${query}` }];
    const tools = [{ type: 'builtin_function', function: { name: '$web_search' } }];
    const first = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, tools, max_tokens: 2048 }),
      signal: timeout,
    });

    if (!first.ok) {
      console.warn(`[Kimi] API 错误: ${first.status}`);
      return null;
    }

    const firstData = await first.json();
    const firstMsg = firstData?.choices?.[0]?.message || {};
    const toolCalls = Array.isArray(firstMsg.tool_calls) ? firstMsg.tool_calls : [];

    // 模型未触发搜索工具（可能直接回答），正文兜底
    if (toolCalls.length === 0) {
      const content: string = firstMsg.content || '';
      if (!content.trim()) {
        console.warn('[Kimi] 未触发搜索且无正文');
        return null;
      }
      const fallback: WebSearchResult = {
        items: [{ title: content.substring(0, 60), snippet: content, url: '' }],
        abstract: content.substring(0, 200),
      };
      setCache(query, fallback);
      console.warn('[Kimi] 未触发联网搜索，返回模型直接回答');
      return fallback;
    }

    // 回传 tool 结果（原样返回 arguments，Kimi 自动执行搜索）
    messages.push({ role: 'assistant', content: firstMsg.content || '', tool_calls: toolCalls });
    for (const tc of toolCalls) {
      messages.push({
        role: 'tool',
        tool_call_id: tc.id,
        name: tc.function?.name,
        content: tc.function?.arguments || '{}',
      });
    }

    // 第二轮：模型基于搜索结果生成最终回复
    const second = await fetch(apiUrl, {
      method: 'POST',
      headers,
      body: JSON.stringify({ model, messages, tools, max_tokens: 2048 }),
      signal: timeout,
    });

    if (!second.ok) {
      console.warn(`[Kimi] API 错误: ${second.status}`);
      return null;
    }

    const secondData = await second.json();
    const content: string = secondData?.choices?.[0]?.message?.content || '';
    if (!content.trim()) {
      console.warn('[Kimi] 搜索后无回复正文');
      return null;
    }

    // 从正文 Markdown 链接提取来源 URL（实测 k2.7-code 不回传 annotations）
    const items: SearchItem[] = [];
    for (const m of content.matchAll(/\[([^\]]*)\]\((https?:\/\/[^)\s]+)\)/g)) {
      const url = m[2].replace(/#ws_call_id=.*$/, '');
      items.push({
        title: (m[1] || '').slice(0, 60),
        snippet: m[0].slice(0, 150),
        url,
      });
      if (items.length >= 8) break;
    }

    // 无链接时整段作为一条结果
    if (items.length === 0) {
      items.push({
        title: content.substring(0, 60),
        snippet: content,
        url: '',
      });
    }

    const result: WebSearchResult = {
      items: items.slice(0, 8),
      abstract: content.substring(0, 200),
    };

    setCache(query, result);
    console.warn('[Kimi] 搜索成功');
    return result;
  } catch (error: any) {
    console.warn('[Kimi] 搜索失败:', error?.message || error);
    return null;
  }
}

// ========== 内存缓存 ==========
const cache = new Map<string, { data: WebSearchResult; ts: number }>();
const CACHE_TTL = 60 * 60 * 1000; // 1 小时

function cacheKey(q: string) {
  return q.trim().toLowerCase().slice(0, 200);
}

function getCached(q: string): WebSearchResult | null {
  const c = cache.get(cacheKey(q));
  if (c && Date.now() - c.ts < CACHE_TTL) return c.data;
  if (c) cache.delete(cacheKey(q));
  return null;
}

function setCache(q: string, data: WebSearchResult) {
  if (cache.size > 500) {
    const oldest = [...cache.entries()].sort((a, b) => a[1].ts - b[1].ts);
    for (let i = 0; i < 100; i++) cache.delete(oldest[i][0]);
  }
  cache.set(cacheKey(q), { data, ts: Date.now() });
}

// ========== 搜索功能 ==========

/**
 * 联网搜索 — TokenHub（主）、DeepSeek（备1）、Kimi（备2）并行竞争，按优先级取有结果者；
 * 均无结果时降级到火山引擎（火山方舟），最后兜底 LaoZhang grok-4
 * @param query 搜索关键词
 * @returns 搜索结果，失败返回 null
 */
export async function searchWeb(query: string): Promise<WebSearchResult | null> {
  // 1. 查缓存
  const cached = getCached(query);
  if (cached) {
    return cached;
  }

  // 2. TokenHub（主，3s 超时）、DeepSeek（备1，17s）、Kimi（备2，17s）并行发起；
  //    先等 TokenHub + DeepSeek，任一有结果即返回；都无结果才等 Kimi（避免 Kimi 拖慢快速路径）
  const tokenhubReady = tokenHubClient.shouldUseAsPrimary() && process.env.TOKENHUB_SEARCH_ENABLED !== 'false';
  const tokenhubP = Promise.race([
    tokenhubReady ? tokenHubClient.webSearch(query).catch(() => null) : Promise.resolve(null),
    new Promise<null>((resolve) => setTimeout(() => resolve(null), 3000)),
  ]);
  const deepseekP = searchDeepSeek(query).catch(() => null);
  const kimiP = searchKimi(query).catch(() => null);

  const [tokenhubResult, deepseekResult] = await Promise.all([tokenhubP, deepseekP]);

  if (tokenhubResult && tokenhubResult.items.length > 0) {
    const result: WebSearchResult = {
      items: tokenhubResult.items.slice(0, 8),
      abstract: tokenhubResult.abstract || '',
    };
    setCache(query, result);
    return result;
  }

  if (deepseekResult && deepseekResult.items.length > 0) {
    console.warn('[WebSearch] TokenHub 无结果，采用 DeepSeek 搜索结果');
    return deepseekResult;
  }

  // DeepSeek 无结果，等 Kimi（已在并行运行，通常已到 17s 超时边界）
  const kimiResult = await kimiP;
  if (kimiResult && kimiResult.items.length > 0) {
    console.warn('[WebSearch] TokenHub/DeepSeek 无结果，采用 Kimi 搜索结果');
    return kimiResult;
  }

  console.warn('[WebSearch] TokenHub/DeepSeek/Kimi 均无结果，降级到火山引擎');

  // 3. 火山引擎（火山方舟）联网搜索（备用）
  try {
    const volcResult = await searchVolcEngine(query);
    if (volcResult && volcResult.items.length > 0) {
      return volcResult;
    }
    console.warn('[WebSearch] 火山引擎搜索无结果，降级到 LaoZhang grok-4');
  } catch (error: any) {
    console.warn('[WebSearch] 火山引擎搜索失败:', error?.message || error);
  }

  try {
    // 4. 调用 LaoZhang.ai (grok-4 + 联网搜索)（兜底降级）
    const response = await searchClient.chat.completions.create({
      model: SEARCH_MODEL,
      messages: [
        {
          role: 'system',
          content: '你是一个专业的搜索助手。请根据用户的查询进行联网搜索，返回最新的、准确的信息。回答要简洁、结构化。如果无法获取实时数据，请基于你的知识给出合理参考，并注明信息可能不是最新的。',
        },
        {
          role: 'user',
          content: `搜索与以下内容相关的最新信息，包括市场价格、产品参数、品牌供应商等：${query}`,
        },
      ],
      temperature: 0.3,
      max_tokens: 2048,
      // 通过 extra_body 启用联网搜索
    } as any, { enable_search: true } as any);

    const content = response.choices[0]?.message?.content || '';

    if (!content.trim()) {
      return null;
    }

    // 4. 将文本结果包装为结构化格式
    const lines = content.split('\n').filter((l) => l.trim());
    const items: SearchItem[] = [];

    for (const line of lines) {
      const trimmed = line.trim();
      if (trimmed.length < 5) continue;

      // 尝试提取编号标题格式：1. xxx / 1、xxx
      const numberedMatch = trimmed.match(/^\d+[.、)\s]+(.+)/);
      if (numberedMatch) {
        items.push({
          title: numberedMatch[1].substring(0, 60),
          snippet: trimmed,
          url: '',
        });
      } else if (items.length === 0) {
        // 第一段非编号内容作为概述
        continue;
      }
    }

    // 如果没有解析出结构化条目，整体作为一条结果
    if (items.length === 0) {
      items.push({
        title: content.substring(0, 60),
        snippet: content,
        url: '',
      });
    }

    const result: WebSearchResult = {
      items: items.slice(0, 8),
      abstract: lines[0] || '',
    };

    setCache(query, result);

    return result;
  } catch (error: any) {
    console.error('[WebSearch] 搜索失败:', error?.message || error);
    return null;
  }
}

/**
 * 将搜索结果格式化为文本（用于注入 AI prompt）
 */
export function formatSearchResult(result: WebSearchResult): string {
  const lines: string[] = [];

  if (result.abstract) {
    lines.push(`【概述】${result.abstract}`);
  }

  result.items.forEach((item, i) => {
    lines.push(`${i + 1}. ${item.title}`);
    lines.push(`   ${item.snippet}`);
    if (item.url) lines.push(`   来源: ${item.url}`);
  });

  return lines.join('\n');
}
