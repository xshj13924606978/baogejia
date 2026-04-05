/**
 * 意图处理管道 — 统一入口
 *
 * 流程：用户输入 → 意图理解 → 产品搜索 → 返回结果
 * 失败时自动降级到旧逻辑（PriceMatcher）
 */

import { intentUnderstanding } from './intent-understanding';
import { intentBasedSearch } from './intent-based-search';
import { extractAllParams, getKeyParameters } from './product-comparison';
import type { Intent, IntentResult, IntentProduct } from './intent-understanding';

// ═══════════════════════ 接口 ═══════════════════════

export interface PipelineResult {
  products: IntentProduct[];
  source: 'intent' | 'legacy' | 'none';
  confidence: number;
  intent?: Intent;
  searchStrategy?: string;
}

/** 按关键参数分组后的产品组 */
export interface ProductGroup {
  key: string;
  representative: IntentProduct;
  count: number;
  products: IntentProduct[];
}

// ═══════════════════════ 管道 ═══════════════════════

export async function processWithIntent(userInput: string): Promise<PipelineResult> {
  // 环境变量开关（默认开启）
  const enabled = process.env.INTENT_PIPELINE_ENABLED !== 'false';

  if (!enabled) {
    console.log('[IntentPipeline] 新逻辑已通过环境变量禁用，直接走旧逻辑');
    return { products: [], source: 'none', confidence: 0 };
  }

  try {
    // 第1步：意图理解
    const intent = await intentUnderstanding.understand(userInput);

    // 问候和未知意图 → 不走产品搜索，直接返回（交给旧逻辑处理问候）
    if (intent.type === 'greeting' || intent.type === 'unknown') {
      console.log(`[IntentPipeline] type=${intent.type}, 交给旧逻辑处理`);
      return { products: [], source: 'none', confidence: intent.confidence, intent };
    }

    // 第2步：基于意图的产品搜索
    const searchResult = await intentBasedSearch.search(intent);

    // 第3步：判断是否成功
    if (searchResult.products.length > 0 && searchResult.confidence >= 0.7) {
      console.log(
        `[IntentPipeline] 新逻辑命中 source=intent, ` +
        `products=${searchResult.products.length}, ` +
        `strategy=${searchResult.searchStrategy}, ` +
        `confidence=${searchResult.confidence}`
      );
      return {
        products: searchResult.products,
        source: 'intent',
        confidence: searchResult.confidence,
        intent,
        searchStrategy: searchResult.searchStrategy,
      };
    }

    // 新逻辑未命中 → 降级
    console.log(
      `[IntentPipeline] 新逻辑未命中 (products=${searchResult.products.length}, ` +
      `confidence=${searchResult.confidence})，降级到旧逻辑`
    );
    return { products: [], source: 'none', confidence: searchResult.confidence, intent };

  } catch (error) {
    console.error('[IntentPipeline] 新逻辑异常，降级到旧逻辑:', error);
    return { products: [], source: 'none', confidence: 0 };
  }
}

// ═══════════════════════ 分组函数 ═══════════════════════

/**
 * 按关键参数分组（通用：自动识别参数维度）
 * 用于将大量匹配产品按关键差异分组展示
 */
export function groupByKeyParams(products: IntentProduct[], keyParams?: string[]): ProductGroup[] {
  if (products.length === 0) return [];

  const productType = products[0]?.name || '';
  const params = keyParams || getKeyParameters(productType, products);
  // 取前2个参数作为分组键（避免过度细分）
  const groupKeys = params.slice(0, 2);

  if (groupKeys.length === 0) {
    return [{ key: 'all', representative: products[0], count: products.length, products }];
  }

  const groups = new Map<string, IntentProduct[]>();

  for (const product of products) {
    const allParams = extractAllParams(product.parameterDescription);
    const groupKey = groupKeys.map(p => `${p}:${allParams.get(p) || '-'}`).join('|');
    if (!groups.has(groupKey)) {
      groups.set(groupKey, []);
    }
    groups.get(groupKey)!.push(product);
  }

  const maxPerGroup = parseInt(process.env.MAX_PRODUCTS_PER_GROUP || '3', 10);
  return Array.from(groups.entries()).map(([key, prods]) => ({
    key,
    representative: prods[0],
    count: prods.length,
    products: prods.slice(0, maxPerGroup),
  }));
}

/**
 * 将搜索结果格式化为 Markdown 上下文（注入到 AI 消息中）
 * 通用版：自动从 parameter_description 提取参数列
 */
export function formatProductsAsContext(result: PipelineResult, originalQuery: string): string {
  if (result.products.length === 0) return '';

  const products = result.products;

  // 单个产品 — 简洁卡片（通用参数展示）
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
    ctx += `匹配方式：${result.searchStrategy || '意图匹配'}\n`;
    return ctx;
  }

  // 多个产品 — 动态参数对比表格
  let ctx = `\n\n【数据库产品信息】\n`;
  ctx += `根据您的需求"${originalQuery}"，找到 ${products.length} 款产品：\n\n`;

  // 自动检测参数维度
  const productType = result.intent?.entities?.productType || products[0]?.name || '';
  const keyParams = getKeyParameters(productType, products);
  // 取前4个参数维度展示（避免表格过宽）
  const displayParams = keyParams.slice(0, 4);

  // 构建动态表头
  ctx += `| 序号 | 产品名称 | 型号 | ${displayParams.join(' | ')} | 价格（元） |\n`;
  ctx += `|:---:|:---|:---|${displayParams.map(() => ':---').join('|')}|:---:|\n`;

  // 价格范围用于标注最便宜
  const prices = products.map(p => p.minPrice || p.price).filter(v => v > 0);
  const minP = Math.min(...prices);

  products.forEach((p, i) => {
    const paramValues = displayParams.map(paramKey => {
      const params = extractAllParams(p.parameterDescription);
      return params.get(paramKey) || '-';
    });

    let tag = '';
    const pMin = p.minPrice || p.price;
    if (pMin === minP && prices.length > 1) tag = ' ⭐';

    const priceStr = p.minPrice > 0
      ? `¥${p.minPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`
      : `¥${p.price.toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`;

    ctx += `| ${i + 1}${tag} | ${p.name} | ${p.model || '-'} | ${paramValues.join(' | ')} | ${priceStr} |\n`;
  });

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
