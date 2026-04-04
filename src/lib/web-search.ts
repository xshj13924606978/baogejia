// 联网搜索模块 — 通过 LaoZhang.ai 中转调用 grok-4（支持联网搜索）
// 失败时静默降级，不影响正常对话

import OpenAI from 'openai';

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
 * 联网搜索 — 使用 grok-4 + enable_search
 * @param query 搜索关键词
 * @returns 搜索结果，失败返回 null
 */
export async function searchWeb(query: string): Promise<WebSearchResult | null> {
  try {
    // 1. 查缓存
    const cached = getCached(query);
    if (cached) {
      console.log(`[WebSearch] 缓存命中: ${query.substring(0, 40)}...`);
      return cached;
    }

    console.log(`[WebSearch] grok-4 搜索: ${query.substring(0, 60)}...`);

    // 2. 调用 LaoZhang.ai (grok-4 + 联网搜索)
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
      console.log('[WebSearch] grok-4 返回空内容');
      return null;
    }

    // 3. 将文本结果包装为结构化格式
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
    console.log(`[WebSearch] 返回 ${result.items.length} 条结果, ${content.length} 字`);

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
