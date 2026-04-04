/**
 * 意图处理管道 — 统一入口
 *
 * 流程：用户输入 → 意图理解 → 产品搜索 → 返回结果
 * 失败时自动降级到旧逻辑（PriceMatcher）
 */

import { intentUnderstanding } from './intent-understanding';
import { intentBasedSearch } from './intent-based-search';
import type { Intent, IntentResult, IntentProduct } from './intent-understanding';

// ═══════════════════════ 接口 ═══════════════════════

export interface PipelineResult {
  products: IntentProduct[];
  source: 'intent' | 'legacy' | 'none';
  confidence: number;
  intent?: Intent;
  searchStrategy?: string;
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

/**
 * 将搜索结果格式化为 Markdown 上下文（注入到 AI 消息中）
 */
export function formatProductsAsContext(result: PipelineResult, originalQuery: string): string {
  if (result.products.length === 0) return '';

  const intent = result.intent;
  const products = result.products;

  // 单个产品 — 简洁卡片
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

  // 多个产品 — 对比表格
  let ctx = `\n\n【数据库产品信息】\n`;
  ctx += `根据您的需求"${originalQuery}"，找到 ${products.length} 款产品：\n\n`;

  // 构建表格（差异点标注）
  ctx += `| 序号 | 产品名称 | 型号 | 单价（元） | 最低售价（元） | 品牌 |\n`;
  ctx += `|:---:|:---|:---|:---:|:---:|:---|\n`;

  // 价格范围用于标注最便宜和最贵
  const prices = products.map(p => p.minPrice || p.price).filter(v => v > 0);
  const minP = Math.min(...prices);
  const maxP = Math.max(...prices);

  products.forEach((p, i) => {
    const price = p.price.toLocaleString('zh-CN', { minimumFractionDigits: 2 });
    const minPrice = p.minPrice > 0
      ? p.minPrice.toLocaleString('zh-CN', { minimumFractionDigits: 2 })
      : '-';
    let tag = '';
    const pMin = p.minPrice || p.price;
    if (pMin === minP && prices.length > 1) tag = ' ⭐最低价';
    if (pMin === maxP && prices.length > 1) tag = '';

    ctx += `| ${i + 1}${tag ? ' ⭐' : ''} | ${p.name} | ${p.model || '-'} | ¥${price} | ¥${minPrice} | ${p.brand || '-'} |\n`;
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
