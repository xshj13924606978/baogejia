/**
 * 报价意图识别工具
 * 根据用户消息区分简单报价和完整项目报价
 */

export type QuoteIntent = 'simple' | 'full';

/**
 * 检测报价意图类型
 * - simple: 用户只问产品价格，不需要安装运输
 * - full: 用户需要包含安装/运输的完整项目报价
 */
export function detectQuoteIntent(userMessage: string): QuoteIntent {
  // 完整项目报价：包含安装、运输、项目等关键词
  if (/安装|运输|运费|项目报价|包安装|含税含运|施工|现场|吊车/.test(userMessage)) {
    return 'full';
  }
  // 默认为简单报价
  return 'simple';
}

/**
 * 根据意图生成额外提示（可追加到 system prompt）
 */
export function buildQuoteIntentHint(intent: QuoteIntent): string {
  if (intent === 'full') {
    return `\n【当前用户意图：完整项目报价】用户需要包含安装/运输的完整报价。请引导用户提供：1.项目地址 2.安装现场条件 3.是否含税发票。`;
  }
  return '';
}
