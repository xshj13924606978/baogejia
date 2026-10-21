/**
 * 对话内智能意图识别引擎（#[20260827-1030]-2-UI 最终版·强化数据优先级）
 *
 * 五类意图：
 *  - proposal_generate 方案生成：方案关键词 / 规模数字+单位+介质 → 生成技术方案
 *  - product_inquiry  产品询价：产品名 + 询价词/规格 → 价格查询（按数据优先级）
 *  - batch_quote      批量报价：文件上传 / 显式批量表述 → 报价单
 *  - knowledge_query  知识问答：疑问词 + 专业词 → 资料库检索
 *  - general_chat     普通对话：其余 → 常规 AI 对话
 *
 * 实现：规则优先（离线、快速、可解释），可组合 LLM 语义意图（intent-pipeline）增强。
 * 数据查询严格遵守优先级（由 price-resolver / knowledge-service 保证）：
 *   产品价格：① 产品价格库 → ② 定额库 → ③ 联网搜索 → ④ 规则估算（标注待核实）
 *   资料文档：① 资料库 → ② 联网搜索 → ③ 规则内置
 */

export type UserIntent =
  | 'proposal_generate'
  | 'product_inquiry'
  | 'batch_quote'
  | 'knowledge_query'
  | 'general_chat';

export interface IntentResult {
  intent: UserIntent;
  confidence: number;
  keywords: string[];
  /** 提取到的产品名（product_inquiry / batch_quote 时） */
  productName?: string;
}

// ---- 产品词典（水处理/环保设备常见产品） ----
const PRODUCT_KEYWORDS = [
  '板框压滤机',
  '带式压滤机',
  '叠螺脱水机',
  '叠螺机',
  '离心脱水机',
  '卧螺离心机',
  '板框压滤',
  '压滤机',
  '刮泥机',
  '吸泥机',
  '行车刮泥机',
  '格栅除污机',
  '回转式格栅',
  '格栅',
  '除砂机',
  '加药装置',
  '加药系统',
  'PAM加药',
  'PAC加药',
  '溶气气浮',
  '气浮机',
  '气浮装置',
  '涡凹气浮',
  '刮渣机',
  '曝气器',
  '曝气头',
  '微孔曝气',
  '射流曝气',
  '罗茨风机',
  '鼓风机',
  '空气悬浮风机',
  '潜污泵',
  '潜水泵',
  '离心泵',
  '螺杆泵',
  '计量泵',
  '加药泵',
  '转子泵',
  '搅拌机',
  '潜水搅拌机',
  '推流器',
  '潜水推流器',
  '回流泵',
  '内回流泵',
  'MBR',
  '膜组件',
  '膜生物反应器',
  '超滤',
  '纳滤',
  '反渗透',
  'RO膜',
  '紫外线消毒',
  '紫外消毒',
  '臭氧发生器',
  '二氧化氯',
  '次氯酸钠',
  '斜管填料',
  '斜管',
  '填料',
  '弹性填料',
  '组合填料',
  '一体化设备',
  '一体化污水处理',
  '一体化净水',
  '电控柜',
  'PLC控制柜',
  '脱泥机',
  '污泥脱水',
  '污泥浓缩',
  '叠螺',
  '泥浆脱水',
  '泥浆',
  '高压隔膜',
  '厢式压滤',
];

// ---- 意图关键词 ----
const PROPOSAL_KEYWORDS = [
  '方案',
  '工艺流程',
  '工艺设计',
  '处理线',
  '项目设计',
  '工程方案',
  '技术方案',
  '设计计算',
  '处理工艺',
  '工艺路线',
];

const INQUIRY_KEYWORDS = [
  '多少钱',
  '价格',
  '报价',
  '单价',
  '什么价',
  '价位',
  '成本',
  '贵不贵',
  '怎么卖',
  '询价',
  '卖多少',
  '一台多少钱',
];

const QUESTION_KEYWORDS = [
  '是什么',
  '什么是',
  '原理',
  '为什么',
  '区别',
  '如何',
  '怎样',
  '怎么选',
  '推荐',
  '解释',
  '介绍',
  '依据',
  '含义',
  '作用',
];

const PROFESSIONAL_KEYWORDS = [
  '工艺',
  '技术',
  '标准',
  '规范',
  '原理',
  '设备',
  '水质',
  '污泥',
  '膜',
  '曝气',
  '设计',
  '运行',
  '维护',
  '药剂',
  '流量',
  '负荷',
  'BOD',
  'COD',
  '氨氮',
  '总磷',
  '悬浮物',
  'SS',
  'MLSS',
  'SVI',
  'pH',
  '含水率',
  '脱泥',
  '压滤',
  '絮凝',
  '沉淀',
  '消毒',
  '生化',
  '好氧',
  '厌氧',
  '缺氧',
];

// ---- 场景单位词 ----
const UNIT_KEYWORDS = ['吨', 't/d', 'T/D', 'm³', 'm3', '立方', '方', '台', '套', '公斤', 'kg', '小时', '天'];

// 介质词（规模数字+单位+介质 → 方案生成意图）
const MEDIUM_PATTERN =
  /\d+\s*(?:吨|t\/d|T\/D|m³|m3|立方|方|立方米)[^，。;\n]{0,20}(?:泥浆水|废水|污水|污泥水|水处理|生活污水|工业废水|渗滤液|原水|中水|给水|养殖废水|屠宰废水|食品废水|医疗废水|电镀废水|印染废水)/;

/**
 * 从文本中提取产品名（优先命中词典中更长的词，其次通用设备名模式）
 */
export function extractProductName(input: string): string | null {
  let best: string | null = null;
  for (const kw of PRODUCT_KEYWORDS) {
    if (input.includes(kw) && (!best || kw.length > best.length)) {
      best = kw;
    }
  }
  if (best) return best;
  const generic = input.match(/([\u4e00-\u9fa5]{2,8}(?:机|泵|池|器|设备|系统|装置|塔|罐|柜|槽|膜))/);
  return generic ? generic[1] : null;
}

/**
 * 识别用户输入意图（规则优先）
 * @param input 用户文本输入
 * @param hasFiles 是否伴随文件上传（Excel/图片/PDF/Word）
 */
export function recognizeIntent(input: string, hasFiles = false): IntentResult {
  const text = (input || '').trim();

  // 1. 文件上传 → 批量报价（文件内容由处理器细分：Excel/CSV→批量报价、图片→识别、PDF/Word→文档解析）
  if (hasFiles) {
    return { intent: 'batch_quote', confidence: 0.9, keywords: ['文件上传'] };
  }

  const keywords: string[] = [];

  // 2. 显式批量报价表述
  if (/(批量|清单|列表|多个产品|若干|分别报价|都报个价|全部报价|逐项报价|每一项)/.test(text) && /\d/.test(text)) {
    keywords.push('批量');
    return { intent: 'batch_quote', confidence: 0.85, keywords };
  }

  const hasNumber = /\d/.test(text);
  const hasUnit = UNIT_KEYWORDS.some((u) => text.includes(u));

  // 3. 方案生成：方案关键词 + 规模数字/单位；或 规模数字+单位+介质（如"60吨地铁泥浆水"）
  if (
    PROPOSAL_KEYWORDS.some((k) => text.includes(k)) && (hasNumber || hasUnit)
  ) {
    keywords.push('方案');
    return { intent: 'proposal_generate', confidence: 0.9, keywords };
  }
  if (MEDIUM_PATTERN.test(text)) {
    keywords.push('方案');
    return { intent: 'proposal_generate', confidence: 0.88, keywords };
  }

  // 4. 产品询价：产品名 + 询价词 / 规格数字
  const productName = extractProductName(text);
  const isInquiry = INQUIRY_KEYWORDS.some((k) => text.includes(k));
  if (productName && (isInquiry || hasNumber)) {
    keywords.push('询价');
    return {
      intent: 'product_inquiry',
      confidence: isInquiry ? 0.9 : 0.7,
      keywords,
      productName,
    };
  }

  // 5. 知识问答：疑问词 + 专业词
  const isQuestion = QUESTION_KEYWORDS.some((k) => text.includes(k));
  const isProfessional = PROFESSIONAL_KEYWORDS.some((k) => text.toUpperCase().includes(k.toUpperCase()));
  if (isQuestion && isProfessional) {
    keywords.push('知识问答');
    return { intent: 'knowledge_query', confidence: 0.75, keywords };
  }

  // 6. 普通对话
  return { intent: 'general_chat', confidence: 0.6, keywords: [] };
}

// ============================================================================
// 结构化卡片数据（前端多场景渲染）
// ============================================================================

export interface ProductCardItem {
  productName: string;
  model?: string;
  brand?: string;
  price: number;
  unit?: string;
  /** 数据来源：产品价格库 / 定额库 / 联网搜索 / 规则估算 */
  source: string;
  sourceDetail?: string;
  /** 置信度：极高 / 高 / 中 / 低 / 估算 */
  confidence?: string;
  matchedBy?: string;
  parameterDescription?: string;
  minPrice?: number;
  costPrice?: number;
}

export interface KnowledgeCardItem {
  title: string;
  type: string;
  relevanceScore: number;
  summary?: string;
  sourceFile?: string;
}

/** 资料中心匹配文件（#[20260827-1430]：知识问答直接下载/跳转） */
export interface KnowledgeAssetReferenceFile {
  id: string;
  title: string;
  /** 资料类型中文标签（标准规范/技术文档/案例/...） */
  category: string;
  /** 直接下载链接 */
  downloadUrl: string;
  /** 资料中心跳转链接 */
  libraryUrl: string;
}

export interface KnowledgeAssetReference {
  files: KnowledgeAssetReferenceFile[];
}

export type ChatCardData =
  | { type: 'product'; products: ProductCardItem[] }
  | { type: 'quote'; items: ProductCardItem[] }
  | {
      type: 'knowledge';
      items: KnowledgeCardItem[];
      /** 资料中心已匹配文件（#[20260827-1430]） */
      assetReference?: KnowledgeAssetReference;
    };
