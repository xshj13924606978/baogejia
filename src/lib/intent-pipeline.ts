/**
 * 意图处理管道 — 统一入口
 *
 * 流程：用户输入 → LLM 意图解析 → SQL 候选集 → 四层渐进筛选 → 返回结果
 *
 * 统一管道：不再有旧管道降级，所有产品查询由此管道处理
 */

import { intentUnderstanding } from './intent-understanding';
import { intentBasedSearch } from './intent-based-search';
import { extractAllParams, getKeyParameters } from './product-comparison';
import type { Intent, IntentProduct, MatchLevel } from './intent-understanding';

// ═══════════════════════ 接口 ═══════════════════════

export interface PipelineResult {
  products: IntentProduct[];
  source: 'intent' | 'none';
  confidence: number;
  intent?: Intent;
  searchStrategy?: string;
  matchLevel?: MatchLevel;
  missingInfo?: string;
}

export interface ProductGroup {
  key: string;
  representative: IntentProduct;
  count: number;
  products: IntentProduct[];
}

// ═══════════════════════ 管道 ═══════════════════════

export async function processWithIntent(userInput: string): Promise<PipelineResult> {
  try {
    // 第1步：LLM 意图解析
    const intent = await intentUnderstanding.understand(userInput);

    // 问候和未知意图 → 直接返回，由 LLM 处理回复
    if (intent.type === 'greeting' || intent.type === 'unknown') {
      console.log(`[IntentPipeline] type=${intent.type}, 交给 LLM 处理`);
      return { products: [], source: 'none', confidence: intent.confidence, intent };
    }

    // 第2步：基于意图的产品搜索（四层渐进匹配）
    const searchResult = await intentBasedSearch.search(intent);

    // 第3步：返回结果
    console.log(
      `[IntentPipeline] source=intent, products=${searchResult.products.length}, ` +
      `matchLevel=${searchResult.matchLevel}, confidence=${searchResult.confidence}`
    );
    return {
      products: searchResult.products,
      source: 'intent',
      confidence: searchResult.confidence,
      intent,
      searchStrategy: searchResult.searchStrategy,
      matchLevel: searchResult.matchLevel === 'none' ? undefined : searchResult.matchLevel,
      missingInfo: searchResult.matchLevel !== 'exact'
        ? searchResult.searchStrategy
        : undefined,
    };

  } catch (error) {
    console.error('[IntentPipeline] 异常:', error);
    return { products: [], source: 'none', confidence: 0 };
  }
}

// ═══════════════════════ 分组函数 ═══════════════════════

export function groupByKeyParams(products: IntentProduct[], keyParams?: string[]): ProductGroup[] {
  if (products.length === 0) return [];
  const productType = products[0]?.name || '';
  const params = keyParams || getKeyParameters(productType, products);
  const groupKeys = params;

  if (groupKeys.length === 0) {
    return [{ key: 'all', representative: products[0], count: products.length, products }];
  }

  const groups = new Map<string, IntentProduct[]>();
  for (const product of products) {
    const allParams = extractAllParams(product.parameterDescription);
    const groupKey = groupKeys.map(p => `${p}:${allParams.get(p) || '-'}`).join('|');
    if (!groups.has(groupKey)) groups.set(groupKey, []);
    groups.get(groupKey)!.push(product);
  }

  return Array.from(groups.entries()).map(([key, prods]) => ({
    key, representative: prods[0], count: prods.length, products: prods,
  }));
}

// ═══════════════════════ Markdown 格式化 ═══════════════════════

function formatProductTable(products: IntentProduct[], productType: string): string {
  if (products.length === 0) return '';

  const keyParams = getKeyParameters(productType, products);
  const displayParams = keyParams.slice(0, 4);

  // 始终包含品牌列；当无 key:value 参数时，用原始参数描述作为"规格"列
  const hasParams = displayParams.length > 0;
  const headers = hasParams
    ? `| 序号 | 品牌 | 产品名称 | 型号 | ${displayParams.join(' | ')} | 价格（元） |`
    : `| 序号 | 品牌 | 产品名称 | 型号 | 规格 | 价格（元） |`;
  const separators = hasParams
    ? `|:---:|:---|:---|:---|${displayParams.map(() => ':---').join('|')}|:---:|`
    : `|:---:|:---|:---|:---|:---|:---:|`;

  let ctx = headers + '\n' + separators + '\n';

  const prices = products.map(p => p.minPrice || p.price).filter(v => v > 0);
  const minP = Math.min(...prices);

  products.forEach((p, i) => {
    let tag = '';
    const pMin = p.minPrice || p.price;
    if (pMin === minP && prices.length > 1) tag = ' ⭐';
    if (p.matchType === 'partial' && p.missingConditions) tag = ` ⚠️`;
    if (p.matchType === 'fuzzy') tag = ` ⚠️`;
    if (p.matchType === 'recommend') tag = ` 💡`;

    const priceStr = p.minPrice > 0
      ? `¥${p.minPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
      : `¥${p.price.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

    if (hasParams) {
      const paramValues = displayParams.map(paramKey => {
        const params = extractAllParams(p.parameterDescription);
        return params.get(paramKey) || '-';
      });
      ctx += `| ${i + 1}${tag} | ${p.brand || '-'} | ${p.name} | ${p.model || '-'} | ${paramValues.join(' | ')} | ${priceStr} |\n`;
    } else {
      ctx += `| ${i + 1}${tag} | ${p.brand || '-'} | ${p.name} | ${p.model || '-'} | ${p.parameterDescription || '-'} | ${priceStr} |\n`;
    }
  });
  ctx += '\n';
  return ctx;
}

/**
 * 将搜索结果格式化为 Markdown 上下文
 */
export function formatProductsAsContext(result: PipelineResult, originalQuery: string): string {
  if (result.products.length === 0) return '';

  const products = result.products;
  const productType = result.intent?.entities?.productType || products[0]?.name || '';

  // 单个产品
  if (products.length === 1) {
    const p = products[0];
    let ctx = `\n\n【数据库产品信息】\n`;
    ctx += `产品名称：${p.name}\n`;
    if (p.model) ctx += `规格型号：${p.model}\n`;
    if (p.brand) ctx += `品牌：${p.brand}\n`;
    ctx += `单价：${p.price.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} 元\n`;
    if (p.minPrice > 0) ctx += `最低售价：${p.minPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} 元\n`;
    if (p.costPrice > 0) ctx += `成本：${p.costPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2 })} 元\n`;
    if (p.parameterDescription) ctx += `产品参数：${p.parameterDescription}\n`;
    ctx += `价格来源：产品库\n`;
    return ctx;
  }

  // 多个产品 — 根据 matchLevel 展示不同提示
  let ctx = '\n\n【数据库产品信息】\n';
  const matchLevel = result.matchLevel || 'exact';

  const levelLabels: Record<string, string> = {
    exact: '精确匹配',
    partial: '部分匹配',
    fuzzy: '相近匹配',
    recommend: '推荐产品',
  };

  const levelIcons: Record<string, string> = {
    exact: '✅',
    partial: '⚠️',
    fuzzy: '📌',
    recommend: '💡',
  };

  const icon = levelIcons[matchLevel] || '';
  const label = levelLabels[matchLevel] || '匹配';

  ctx += `${icon} ${label}到 ${products.length} 款产品`;
  if (matchLevel === 'partial') {
    const missing = products[0]?.missingConditions;
    if (missing) ctx += `（缺少 ${missing} 条件）`;
  }
  if (matchLevel === 'fuzzy') {
    ctx += '（参数容差±10%）';
  }
  if (matchLevel === 'recommend') {
    ctx += '（未找到精确匹配，以下为同类型推荐）';
  }
  ctx += `：\n\n`;

  ctx += formatProductTable(products, productType);

  // 推荐产品参数详情
  const recommended = products[0];
  if (recommended) {
    ctx += `\n**⭐ 推荐产品详情：**\n`;
    if (recommended.brand) ctx += `- **品牌**：${recommended.brand}\n`;
    if (recommended.model) ctx += `- **型号**：${recommended.model}\n`;
    if (recommended.parameterDescription) ctx += `- **参数**：${recommended.parameterDescription}\n`;
    const recPrice = recommended.minPrice || recommended.price;
    ctx += `- **价格**：¥${recPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;
    if (recommended.costPrice > 0) {
      ctx += `（成本：¥${recommended.costPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}）`;
    }
    ctx += `\n`;
  }

  ctx += `\n> 匹配方式：${result.searchStrategy || '意图匹配'}，数据来源：产品库\n`;
  return ctx;
}
