/**
 * 意图处理器（#[20260827-1030]-6 第三层：AI 推理层前置）
 *
 * 将自然语言需求解析为结构化工程需求：
 * - 规则优先：正则 + 关键词解析（处理量/项目类型/工艺/水质目标），零依赖、零延迟
 * - AI 补充：规则提取不完整时调用 DeepSeek 结构化提取（可选开关）
 * - 输出置信度，供生成器决定兜底策略
 */

import { callDeepSeekChat } from './deepseek-client';
import { matchScenario } from './rules';

// ============================================================================
// 类型定义
// ============================================================================

export interface UserRequirement {
  projectType: string; // 项目类型（生活污水/工业废水/食品废水/地铁泥浆等）
  capacityTd: number; // 处理量（t/d，已统一换算）
  influentQuality?: {
    cod?: number;
    bod5?: number;
    ss?: number;
    nh3n?: number;
    ph?: number;
  };
  effluentStandards?: {
    cod?: number;
    ss?: number;
    nh3n?: number;
  };
  processType?: string; // 工艺倾向（A/O、MBR、SBR、物化等）
  location?: string;
  budget?: number; // 万元
  requirements?: string[];
  rawInput: string;
  confidence: number; // 0~1
  extractedBy: 'rule' | 'ai' | 'rule+ai';
}

// ============================================================================
// 规则解析（确定性，不依赖外部）
// ============================================================================

const CN_NUM: Record<string, number> = {
  一: 1, 二: 2, 两: 2, 三: 3, 四: 4, 五: 5, 六: 6, 七: 7, 八: 8, 九: 9, 十: 10, 半: 0.5,
};

function parseChineseNumber(text: string): number | null {
  // 阿拉伯数字
  const arabic = text.match(/[-+]?\d+(?:\.\d+)?/);
  if (arabic) return parseFloat(arabic[0]);
  // 中文数字：支持 十/五十/十三/一百/一百二十 等
  const t = text.trim();
  if (!t || t.length > 5) return null;
  let result = 0;
  let section = 0; // 当前段累计
  for (const ch of t) {
    if (ch === '百') {
      section = section || 1;
      result += section * 100;
      section = 0;
    } else if (ch === '十') {
      section = section || 1;
      result += section * 10;
      section = 0;
    } else if (CN_NUM[ch] !== undefined) {
      section = CN_NUM[ch];
    } else {
      return null;
    }
  }
  return result + section;
}

/** 解析处理量：支持 吨/天、t/d、m³/d、方/天、100吨、每天处理60吨、每天五十吨 等 */
export function parseCapacity(input: string): number {
  // 中文数字优先（避免"五十"被当作普通文本）
  const cn = input.match(/(?:每天|每日|日处理|规模)?\s*(?:处理|消纳|排放)?\s*([一二两三四五六七八九十百]+)\s*(?:吨|t)\s*(?:每天|每日|一日)?/i);
  if (cn) {
    const n = parseChineseNumber(cn[1]);
    if (n !== null) return n;
  }
  const patterns = [
    /每天\s*(?:处理|消纳|排放)?\s*(\d+(?:\.\d+)?)\s*(?:吨|t)\s*(?:泥浆|水)?/i,
    /日处理\s*(\d+(?:\.\d+)?)\s*(?:吨|t)\s*(?:泥浆|水)?/i,
    /(\d+(?:\.\d+)?)\s*(?:吨|t)\s*(?:每天|每日|\/天|\/日|一天|一日)/i,
    /(\d+(?:\.\d+)?)\s*(?:m³|立方|方|m3)\s*(?:每天|每日|\/天|\/日)/i,
    /(?:每天|每日)\s*(?:处理)?\s*(\d+(?:\.\d+)?)\s*(?:m³|立方|方|m3)/i,
    /(\d+(?:\.\d+)?)\s*(?:吨|t)(?:\s*[／/]?\s*d)?\b/i,
  ];
  for (const re of patterns) {
    const m = input.match(re);
    if (m) return parseFloat(m[1]);
  }
  return 0;
}

const PROJECT_TYPE_RULES: Array<{ type: string; keywords: string[] }> = [
  { type: '地铁/市政施工泥浆水处理', keywords: ['地铁', '盾构', '泥浆', '钻孔', '桩基', '隧道', '河道清淤'] },
  { type: '食品废水处理', keywords: ['食品', '屠宰', '养殖', '饮料', '啤酒', '乳业', '罐头', '发酵'] },
  { type: '工业废水处理', keywords: ['工业', '电镀', '化工', '印染', '制药', '造纸', '表面处理', '电子', '废水'] },
  { type: '生活污水处理', keywords: ['生活', '市政', '城镇', '小区', '污水站', '生活污水'] },
  { type: '高标准回用/零排放', keywords: ['回用', '零排', '再生', '中水', '直排'] },
];

/** 解析项目类型 */
export function parseProjectType(input: string): string {
  for (const r of PROJECT_TYPE_RULES) {
    if (r.keywords.some((k) => input.includes(k))) return r.type;
  }
  return '生活污水处理'; // 兜底
}

const PROCESS_HINTS: Array<{ type: string; keywords: string[] }> = [
  { type: 'MBR', keywords: ['mbr', '膜生物', '膜法', '中空纤维'] },
  { type: 'SBR', keywords: ['sbr', '序批', 'cass'] },
  { type: 'A2O', keywords: ['a2o', 'a²/o', '除磷'] },
  { type: 'A/O', keywords: ['a/o', 'ao', '生化', '脱氮'] },
  { type: '物化', keywords: ['物化', '混凝', '沉淀', '压滤', '絮凝'] },
];

/** 解析工艺类型 */
export function parseProcessType(input: string): string | undefined {
  const lower = input.toLowerCase();
  for (const p of PROCESS_HINTS) {
    if (p.keywords.some((k) => lower.includes(k))) return p.type;
  }
  return undefined;
}

/** 解析预算（万元） */
export function parseBudget(input: string): number | undefined {
  const m = input.match(/(\d+(?:\.\d+)?)\s*万元/);
  if (m) return parseFloat(m[1]);
  const m2 = input.match(/预算[^0-9]{0,4}(\d+(?:\.\d+)?)/);
  if (m2) return parseFloat(m2[1]);
  return undefined;
}

/** 解析地点 */
export function parseLocation(input: string): string | undefined {
  const m = input.match(/[在]?\s*([\u4e00-\u9fa5]{2,8}市)/);
  if (m) return m[1];
  return undefined;
}

/** 解析出水标准关键词 */
export function parseEffluentHint(input: string): string | undefined {
  if (/(一级A|一级\s*a)/i.test(input)) return 'GB 18918-2002 一级A';
  if (/(一级B|一级\s*b)/i.test(input)) return 'GB 18918-2002 一级B';
  if (/一级/i.test(input)) return 'GB 18918-2002 一级A';
  if (/二级/i.test(input)) return 'GB 8978-1996 二级';
  if (/(回用|再生)/.test(input)) return '回用水质（GB/T 18920）';
  return undefined;
}

// ============================================================================
// 规则解析主入口
// ============================================================================

export function parseRequirementByRule(rawInput: string): UserRequirement {
  const input = rawInput.trim();
  const capacityTd = parseCapacity(input);
  const projectType = parseProjectType(input);
  const processType = parseProcessType(input);
  const location = parseLocation(input);
  const budget = parseBudget(input);
  const effluent = parseEffluentHint(input);

  // 置信度：处理量>0 记 0.4，项目类型匹配到关键词记 0.3，工艺记 0.2，其余 0.1
  const scenario = matchScenario(projectType);
  const matchedAlias = scenario.aliases.some((a) => input.includes(a));
  const confidence = (capacityTd > 0 ? 0.4 : 0) + (matchedAlias ? 0.3 : 0) + (processType ? 0.2 : 0) + (location ? 0.05 : 0) + (budget ? 0.05 : 0);

  const requirement: UserRequirement = {
    projectType,
    capacityTd,
    processType,
    location,
    budget,
    requirements: effluent ? [`出水水质按 ${effluent}`] : undefined,
    rawInput: input,
    confidence: Math.min(1, confidence),
    extractedBy: 'rule',
  };
  if (effluent) requirement.effluentStandards = {};
  return requirement;
}

// ============================================================================
// AI 补充解析（DeepSeek 结构化提取，可选）
// ============================================================================

const AI_PARSE_SYSTEM_PROMPT = `你是一名环保水处理工程需求分析专家。请从用户输入中提取结构化信息，只输出 JSON，不要任何多余文字。
JSON 字段：
- projectType: string 项目类型（如"生活污水处理"、"工业废水处理"、"食品废水处理"、"地铁/市政施工泥浆水处理"）
- capacityTd: number 处理量（吨/天，如输入为 m³/d 按 1:1 换算）
- processType: string|null 工艺倾向（A/O、A2O、MBR、SBR、物化 等，无则 null）
- influentQuality: {cod?:number,bod5?:number,ss?:number,ph?:number}|null
- effluentStandards: {cod?:number,ss?:number,nh3n?:number}|null
- location: string|null
- budget: number|null 预算（万元）
- requirements: string[] 特殊要求
若某项用户未提供，填 null 或省略。`;

export async function parseRequirementWithAI(rawInput: string): Promise<UserRequirement> {
  const rule = parseRequirementByRule(rawInput);
  try {
    const res = await callDeepSeekChat({
      messages: [
        { role: 'system', content: AI_PARSE_SYSTEM_PROMPT },
        { role: 'user', content: rawInput },
      ],
      temperature: 0.1,
      maxTokens: 500,
    });
    const text = res.text.trim();
    const jsonStart = text.indexOf('{');
    const jsonEnd = text.lastIndexOf('}');
    if (jsonStart >= 0 && jsonEnd > jsonStart) {
      const parsed = JSON.parse(text.slice(jsonStart, jsonEnd + 1));
      const merged: UserRequirement = {
        projectType: typeof parsed.projectType === 'string' ? parsed.projectType : rule.projectType,
        capacityTd: typeof parsed.capacityTd === 'number' ? parsed.capacityTd : rule.capacityTd,
        processType: parsed.processType || rule.processType,
        location: parsed.location || rule.location,
        budget: parsed.budget ?? rule.budget,
        requirements: parsed.requirements?.length ? parsed.requirements : rule.requirements,
        rawInput,
        confidence: Math.min(1, rule.confidence + 0.3),
        extractedBy: 'rule+ai',
      };
      if (parsed.influentQuality && typeof parsed.influentQuality === 'object') merged.influentQuality = parsed.influentQuality;
      if (parsed.effluentStandards && typeof parsed.effluentStandards === 'object') merged.effluentStandards = parsed.effluentStandards;
      return merged;
    }
  } catch (e) {
    // AI 不可用则回退规则结果
    console.warn('[intent-processor] AI 解析失败，使用规则结果:', e);
  }
  return rule;
}

/**
 * 意图理解主入口
 * @param opts.useAI 是否启用 AI 补充（默认 true；规则置信度足够时跳过）
 */
export async function understandUserRequirement(rawInput: string, opts?: { useAI?: boolean }): Promise<UserRequirement> {
  const rule = parseRequirementByRule(rawInput);
  const useAI = opts?.useAI !== false;
  // 规则已解析出处理量+项目类型 → 直接使用（零延迟）
  if (!useAI || (rule.capacityTd > 0 && rule.confidence >= 0.7)) {
    return rule;
  }
  return parseRequirementWithAI(rawInput);
}