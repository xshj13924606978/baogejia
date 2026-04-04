// 联网搜索模块 — DuckDuckGo Instant Answer API
// 无需 API Key，返回结构化数据（标题 + 摘要 + 链接）
// 失败时静默降级，不影响正常对话

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

// ========== DuckDuckGo 即时答案 API ==========

interface DDGResponse {
  Abstract?: string;
  AbstractSource?: string;
  AbstractURL?: string;
  Heading?: string;
  RelatedTopics?: Array<{
    Text?: string;
    FirstURL?: string;
    Icon?: { URL?: string };
    Result?: string;
  } | null>;
  Results?: Array<{
    Text?: string;
    FirstURL?: string;
  }>;
  Type?: string;
}

/**
 * 联网搜索 — 使用 DuckDuckGo 即时答案 API
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

    console.log(`[WebSearch] DuckDuckGo 搜索: ${query.substring(0, 60)}...`);

    // 2. 调用 DuckDuckGo API
    const url = `https://api.duckduckgo.com/?q=${encodeURIComponent(query)}&format=json&no_html=1&skip_disambig=1`;
    const res = await fetch(url, {
      headers: { 'Accept': 'application/json' },
      signal: AbortSignal.timeout(5000),
    });

    if (!res.ok) {
      console.error(`[WebSearch] DuckDuckGo HTTP ${res.status}`);
      return null;
    }

    const data: DDGResponse = await res.json();

    // 3. 解析结果
    const items: SearchItem[] = [];

    // Abstract（维基百科摘要）
    let abstract = '';
    if (data.Abstract) {
      abstract = data.Abstract;
      if (data.AbstractURL) {
        items.push({
          title: data.Heading || data.AbstractSource || '相关介绍',
          snippet: data.Abstract,
          url: data.AbstractURL,
        });
      }
    }

    // RelatedTopics
    if (data.RelatedTopics) {
      for (const topic of data.RelatedTopics) {
        if (!topic) continue;
        // 嵌套格式：{ Text, FirstURL } 或 { Result, Topics: [...] }
        const text = topic.Text || topic.Result || '';
        const link = topic.FirstURL || '';
        if (text && link && items.length < 8) {
          items.push({
            title: text.split(' - ')[0]?.trim() || text.substring(0, 50),
            snippet: text,
            url: link,
          });
        }
      }
    }

    // Results（直接答案）
    if (data.Results) {
      for (const r of data.Results) {
        if (r.Text && r.FirstURL && items.length < 8) {
          items.push({
            title: r.Text.substring(0, 60),
            snippet: r.Text,
            url: r.FirstURL,
          });
        }
      }
    }

    if (items.length === 0) {
      console.log('[WebSearch] DuckDuckGo 无结果');
      return null;
    }

    const result: WebSearchResult = { items, abstract };
    setCache(query, result);

    console.log(`[WebSearch] 返回 ${items.length} 条结果, ${abstract ? abstract.length + ' 字摘要' : '无摘要'}`);
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
