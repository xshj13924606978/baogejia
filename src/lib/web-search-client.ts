import OpenAI from 'openai';

// 联网搜索客户端（通过 LaoZhang.ai 中转，使用 grok-4）
const searchClient = new OpenAI({
  apiKey: process.env.LAOZHANG_API_KEY,
  baseURL: process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1',
  dangerouslyAllowBrowser: false,
});

const SEARCH_MODEL = process.env.WEB_SEARCH_MODEL || 'grok-4';

export interface SearchResult {
  content: string;
  model: string;
  usage?: {
    prompt_tokens: number;
    completion_tokens: number;
    total_tokens: number;
  };
}

/**
 * 联网搜索 — 查询市场价格
 */
export async function searchMarketPrice(productName: string): Promise<SearchResult | null> {
  return searchWithPrompt(
    `搜索"${productName}"的最新市场价格。要求：
1. 给出价格区间（最低价-最高价）
2. 列出2-3个主要品牌/供应商及报价
3. 标注价格来源或平台
4. 只返回搜索结果，不要多余的分析`
  );
}

/**
 * 联网搜索 — 查询竞争对手报价
 */
export async function searchCompetitorQuotes(productName: string): Promise<SearchResult | null> {
  return searchWithPrompt(
    `搜索"${productName}"的竞争对手报价信息。要求：
1. 列出3-5家主要供应商/品牌的报价
2. 包含型号、价格、联系方式（如果有）
3. 按价格从低到高排列
4. 只返回搜索结果，不要多余的分析`
  );
}

/**
 * 通用联网搜索
 */
export async function searchWithPrompt(prompt: string): Promise<SearchResult | null> {
  try {
    console.log(`[WebSearch] 搜索: ${prompt.substring(0, 60)}...`);

    const response = await searchClient.chat.completions.create({
      model: SEARCH_MODEL,
      messages: [
        {
          role: 'system',
          content: '你是一个专业的搜索助手。请根据用户的查询进行联网搜索，返回最新的、准确的信息。回答要简洁、结构化。如果无法获取实时数据，请基于你的知识给出合理参考，并注明信息可能不是最新的。',
        },
        { role: 'user', content: prompt },
      ],
      temperature: 0.3,
      max_tokens: 2048,
    });

    const content = response.choices[0]?.message?.content || '';
    console.log(`[WebSearch] 搜索完成, ${content.length} 字符`);

    return {
      content,
      model: response.model,
      usage: response.usage
        ? {
            prompt_tokens: response.usage.prompt_tokens,
            completion_tokens: response.usage.completion_tokens,
            total_tokens: response.usage.total_tokens,
          }
        : undefined,
    };
  } catch (error: any) {
    console.error('[WebSearch] 搜索失败:', error);
    return null;
  }
}
