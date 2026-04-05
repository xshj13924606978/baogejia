/**
 * 意图理解层 — 使用 Gemini 结构化提取用户意图
 *
 * 将自然语言输入转化为结构化 Intent，支持：
 * - 产品类型识别（空压机、化粪池、水泵等）
 * - 模糊需求理解（便宜、节能、性价比高、进口等）
 * - 预算/品牌/参数约束提取
 * - 意图分类（query_product / ask_price / greeting / unknown）
 */

import { callGeminiChat } from './deepseek-client';

// ═══════════════════════ 接口定义 ═══════════════════════

export interface Intent {
  type: 'query_product' | 'compare' | 'ask_price' | 'ask_spec' | 'ask_tech_support' | 'greeting' | 'unknown';
  entities: {
    productType?: string;
    attributes?: string[];
    budget?: { min?: number; max?: number };
    brand?: string;
    quantity?: number;
    specs?: Record<string, string>;
  };
  originalQuery: string;
  confidence: number;
}

export interface IntentResult {
  intent: Intent;
  products?: IntentProduct[];
  searchStrategy: string;
  confidence: number;
}

export interface IntentProduct {
  name: string;
  model: string;
  price: number;
  brand: string;
  parameterDescription: string;
  minPrice: number;
  costPrice: number;
  source: string;
  /** 匹配类型：exact=精确匹配, close=相近匹配 */
  matchType?: 'exact' | 'close';
  /** 匹配详情，如 "排气量: 需求1.1, 实际1.0, 误差-9%" */
  matchDetails?: string;
}

// ═══════════════════════ 琐碎输入检测 ═══════════════════════

const TRIVIAL_PATTERNS = [
  /^(你好|在吗|hi|hello|ok|好的|嗯|谢谢|再见|拜拜)$/i,
  /^[。！？!?\s]+$/,
];

const PRODUCT_KEYWORDS = [
  '空压机', '化粪池', '水泵', '风机', '过滤器', '阀门', '管道',
  '二氧化氯', '发生器', '消毒', '膜', '沉淀池', '调节池', '厌氧',
  '好氧', '曝气', '格栅', '提升泵', '刮泥机', '压滤机', '搅拌机',
  '加药', '流量计', '液位计', '压缩机', '冷水机', '冷却塔',
  '焊枪', '电线', '电缆', '传感器', '控制柜', '配电箱',
  '浮球', '填料', '滤料', '活性炭', '石英砂', '树脂',
  '氩弧', '切割机', '发电机', '变压器',
];

function isTrivialInput(input: string): boolean {
  const trimmed = input.trim();
  if (trimmed.length < 2) return true;
  if (trimmed.length < 5) {
    return TRIVIAL_PATTERNS.some(p => p.test(trimmed));
  }
  return false;
}

// ═══════════════════════ Gemini Prompt ═══════════════════════

const INTENT_SYSTEM_PROMPT = `你是一个产品意图理解引擎。你的任务是将用户的自然语言输入转化为结构化的 JSON 意图对象。

## 规则
1. 只返回 JSON，不要返回任何其他文本
2. 如果无法识别产品类型，type 设为 "unknown"
3. 对于模糊需求（如"便宜"、"节能"），将其映射到 attributes 数组
4. 预算提取为数字范围（单位统一为元）
5. confidence 表示你对意图理解的置信度（0-1）

## attributes 映射规则
- "便宜/经济/实惠/预算有限/省钱/价格低" → ["便宜"]
- "贵/高端/大品牌/品质好" → ["高端"]
- "节能/省电/高效/低能耗/变频" → ["节能"]
- "性价比/划算/实惠" → ["性价比"]
- "进口/海外/国外" → ["进口"]
- "国产/自主/国内" → ["国产"]
- "大功率/大型/大排量/大容量" → ["大功率"]
- "静音/低噪音/安静" → ["静音"]
- "稳定/可靠/耐用/持久" → ["稳定"]
- "小巧/紧凑/小型/迷你" → ["小型"]

## specs 参数提取规则
- "排气量1.1/流量1.1 m³/min" → specs.flowRate = "1.1"
- "压力0.8/0.8MPa" → specs.pressure = "0.8"
- "功率5.5KW/5.5千瓦" → specs.power = "5.5"
- "电压380V/380伏" → specs.voltage = "380"
- "变频/永磁变频" → specs.controlType = "永磁变频"
- "5方/5立方米/5m³化粪池" → specs.volume = "5"

## 示例

输入: "便宜点的空压机"
输出: {"type":"query_product","entities":{"productType":"空压机","attributes":["便宜"]},"originalQuery":"便宜点的空压机","confidence":0.9}

输入: "预算2万左右的水泵"
输出: {"type":"query_product","entities":{"productType":"水泵","budget":{"max":22000}},"originalQuery":"预算2万左右的水泵","confidence":0.85}

输入: "排气量1.1 m³/min的空压机"
输出: {"type":"query_product","entities":{"productType":"空压机","specs":{"flowRate":"1.1"}},"originalQuery":"排气量1.1 m³/min的空压机","confidence":0.95}

输入: "帮我推荐一个进口的节能水泵"
输出: {"type":"query_product","entities":{"productType":"水泵","attributes":["进口","节能"]},"originalQuery":"帮我推荐一个进口的节能水泵","confidence":0.9}

输入: "5方化粪池多少钱"
输出: {"type":"ask_price","entities":{"productType":"化粪池","specs":{"volume":"5"}},"originalQuery":"5方化粪池多少钱","confidence":0.95}

输入: "你好"
输出: {"type":"greeting","entities":{},"originalQuery":"你好","confidence":1.0}

输入: "今天天气怎么样"
输出: {"type":"unknown","entities":{},"originalQuery":"今天天气怎么样","confidence":0.5}`;

// ═══════════════════════ JSON 解析 ═══════════════════════

function parseJSON(text: string): any | null {
  // 第1级：直接解析
  try {
    const parsed = JSON.parse(text.trim());
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}

  // 第2级：提取第一个 {...} 块
  const jsonBlockMatch = text.match(/\{[\s\S]*\}/);
  if (jsonBlockMatch) {
    try {
      const parsed = JSON.parse(jsonBlockMatch[0]);
      if (parsed && typeof parsed === 'object') return parsed;
    } catch {}
  }

  // 第3级：清理 markdown 标记后提取
  const cleaned = text
    .replace(/```json\s*/gi, '')
    .replace(/```\s*/gi, '')
    .replace(/^[^{]*/, '')
    .replace(/[^}]*$/, '');
  try {
    const parsed = JSON.parse(cleaned);
    if (parsed && typeof parsed === 'object') return parsed;
  } catch {}

  return null;
}

function validateIntent(raw: any): Intent {
  const validTypes = ['query_product', 'compare', 'ask_price', 'ask_spec', 'ask_tech_support', 'greeting', 'unknown'];
  return {
    type: validTypes.includes(raw.type) ? raw.type : 'unknown',
    entities: {
      productType: typeof raw.entities?.productType === 'string' ? raw.entities.productType : undefined,
      attributes: Array.isArray(raw.entities?.attributes) ? raw.entities.attributes.filter((a: any) => typeof a === 'string') : undefined,
      budget: raw.entities?.budget && typeof raw.entities.budget === 'object'
        ? {
            min: typeof raw.entities.budget.min === 'number' ? raw.entities.budget.min : undefined,
            max: typeof raw.entities.budget.max === 'number' ? raw.entities.budget.max : undefined,
          }
        : undefined,
      brand: typeof raw.entities?.brand === 'string' ? raw.entities.brand : undefined,
      quantity: typeof raw.entities?.quantity === 'number' ? raw.entities.quantity : undefined,
      specs: raw.entities?.specs && typeof raw.entities.specs === 'object' ? raw.entities.specs : undefined,
    },
    originalQuery: typeof raw.originalQuery === 'string' ? raw.originalQuery : '',
    confidence: typeof raw.confidence === 'number' ? Math.min(1, Math.max(0, raw.confidence)) : 0,
  };
}

// ═══════════════════════ 意图理解类 ═══════════════════════

export class IntentUnderstanding {
  private static instance: IntentUnderstanding;

  static getInstance(): IntentUnderstanding {
    if (!IntentUnderstanding.instance) {
      IntentUnderstanding.instance = new IntentUnderstanding();
    }
    return IntentUnderstanding.instance;
  }

  /**
   * 理解用户意图
   * @returns 结构化 Intent，失败时返回 { type: 'unknown', confidence: 0 }
   */
  async understand(userInput: string): Promise<Intent> {
    const trimmed = userInput.trim();

    // 琐碎输入快速跳过
    if (isTrivialInput(trimmed)) {
      const isGreeting = TRIVIAL_PATTERNS.some(p => p.test(trimmed));
      return {
        type: isGreeting ? 'greeting' : 'unknown',
        entities: {},
        originalQuery: trimmed,
        confidence: isGreeting ? 1.0 : 0,
      };
    }

    try {
      const response = await callGeminiChat({
        messages: [
          { role: 'system', content: INTENT_SYSTEM_PROMPT },
          { role: 'user', content: trimmed },
        ],
        temperature: 0.1,
        maxTokens: 512,
        model: 'gemini',
      });

      console.log('[IntentUnderstanding] Gemini 响应:', response.text.substring(0, 200));

      const raw = parseJSON(response.text);
      if (!raw) {
        console.log('[IntentUnderstanding] JSON 解析失败，降级');
        return this.buildFallbackIntent(trimmed);
      }

      const intent = validateIntent(raw);
      console.log('[IntentUnderstanding] 意图:', intent.type, '产品:', intent.entities.productType, '属性:', JSON.stringify(intent.entities.attributes), '置信度:', intent.confidence);
      return intent;
    } catch (error) {
      console.error('[IntentUnderstanding] Gemini 调用失败:', error);
      return this.buildFallbackIntent(trimmed);
    }
  }

  /**
   * 降级：基于关键词的简单意图识别
   */
  private buildFallbackIntent(input: string): Intent {
    // 检测是否有产品关键词
    const foundProduct = PRODUCT_KEYWORDS.find(kw => input.includes(kw));
    if (foundProduct) {
      // 检测是否是价格查询
      const isPriceQuery = /多少钱|价格|报价|成本|费用|价位/.test(input);
      return {
        type: isPriceQuery ? 'ask_price' : 'query_product',
        entities: { productType: foundProduct },
        originalQuery: input,
        confidence: 0.5,
      };
    }

    return {
      type: 'unknown',
      entities: {},
      originalQuery: input,
      confidence: 0,
    };
  }
}

export const intentUnderstanding = IntentUnderstanding.getInstance();
