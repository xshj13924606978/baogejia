/**
 * 项目场景工艺模板（#[20260827-1030]-6 第一层：专家规则层）
 *
 * 将"项目类型/场景"匹配到工艺路线模板，工艺细节复用 knowledge/process-templates。
 * 模糊匹配 + 兜底默认模板，不依赖外部资料。
 */

import {
  getProcessTemplate,
  type ProcessTemplate,
} from '../knowledge/process-templates';

export interface ScenarioTemplate {
  id: string;
  projectType: string; // 项目类型名称（用于方案文本）
  aliases: string[]; // 触发关键词
  processHint: string; // 匹配 knowledge 工艺模板的提示词
  description: string; // 场景说明
  keyParams: string[]; // 关键参数
}

// ============================================================================
// 内置场景模板（常用环保场景）
// ============================================================================

export const SCENARIO_TEMPLATES: ScenarioTemplate[] = [
  {
    id: 'metro-mud',
    projectType: '地铁/市政施工泥浆水处理',
    aliases: ['地铁', '盾构', '泥浆', '钻孔', '桩基', '隧道', '河道清淤'],
    processHint: '泥浆水',
    description: '高浊度泥浆水的物化处理：沉淀浓缩 + 压滤脱水 + 滤液回用',
    keyParams: ['进料 SS 5,000~60,000 mg/L', '泥饼含水率 ≤ 60%', '滤液 SS < 100 mg/L'],
  },
  {
    id: 'domestic',
    projectType: '生活污水处理',
    aliases: ['生活', '市政', '城镇', '小区', '污水站'],
    processHint: 'A/O',
    description: 'A/O 生化 + 沉淀 + 消毒，出水满足 GB 18918-2002 一级标准',
    keyParams: ['COD ≤ 50 mg/L', 'NH3-N ≤ 5 mg/L', 'HRT 8~12 h'],
  },
  {
    id: 'industrial',
    projectType: '工业废水处理',
    aliases: ['工业', '电镀', '化工', '印染', '制药', '造纸', '表面处理', '电子'],
    processHint: 'A/O',
    description: '调节 + 物化预处理 + 生化处理 + 深度处理',
    keyParams: ['按水质定制', '含重金属需先预处理', '分质分流'],
  },
  {
    id: 'food',
    projectType: '食品废水处理',
    aliases: ['食品', '屠宰', '养殖', '饮料', '啤酒', '乳业', '罐头'],
    processHint: 'A/O',
    description: '隔油 + 调节 + 生化 + 沉淀，COD 去除率 ≥ 90%',
    keyParams: ['隔油预处理', '厌氧+好氧', 'COD 去除率 ≥ 90%'],
  },
  {
    id: 'high-standard',
    projectType: '高标准回用/零排放',
    aliases: ['回用', '零排', '再生', '中水', '直排'],
    processHint: 'MBR',
    description: 'MBR 膜生物反应器，出水满足回用要求',
    keyParams: ['SS ≤ 5 mg/L', '浊度 ≤ 1 NTU', '出水可直接回用'],
  },
];

/** 按项目类型关键词模糊匹配场景模板（默认生活污水） */
export function matchScenario(projectType: string): ScenarioTemplate {
  const type = projectType || '';
  if (!type) return SCENARIO_TEMPLATES[1];
  const hit = SCENARIO_TEMPLATES.find((t) => t.aliases.some((a) => type.includes(a)));
  if (hit) return hit;
  // 含"水"字但无明确场景 → 按生活污水兜底
  return SCENARIO_TEMPLATES[1];
}

/** 场景 → 工艺模板（复用 knowledge 工艺库） */
export function resolveProcessTemplate(projectType: string, processType?: string): ProcessTemplate {
  if (processType && processType.trim()) {
    return getProcessTemplate(processType);
  }
  const scenario = matchScenario(projectType);
  return getProcessTemplate(scenario.processHint);
}

/** 获取全部场景模板（备选对比） */
export function getAllScenarios(): ScenarioTemplate[] {
  return SCENARIO_TEMPLATES;
}