/**
 * 方案生成 Prompt 构建器（#[20260827-1030]-6 第三层）
 *
 * 将「用户需求 + 规则层计算结果 + 知识库检索结果」注入 Prompt，
 * 约束 AI 只能基于注入数据生成，不得随意编造参数与价格。
 * 输出要求：10 章节完整方案、预算价口径、未提供信息标注"待确认"。
 */

import type { UserRequirement } from '../intent-processor';
import type { SelectedEquipment } from '../rules';
import type { ProcessTemplate } from '../knowledge/process-templates';
import type { StandardEntry } from '../knowledge/standards-db';

export interface RuleData {
  equipmentItems: SelectedEquipment[]; // 规则层设备清单（含价格与来源）
  equipmentTotal: number; // 设备费小计
  processTemplate: ProcessTemplate; // 工艺模板
  processFlowText: string; // 工艺流程文本（步骤链）
  costTotal: number; // 预算总价（规则层估算）
  costBreakdownText: string; // 成本分项文本
  standards: StandardEntry[]; // 适用标准
  standardsText: string; // 标准引用文本
  /** 供方（本公司）信息（来自 company_info 表，禁止硬编码） */
  supplierInfo: string;
  /** 数据来源表（价格/资料均标注来源） */
  dataSourcesMarkdown: string;
}

export interface KnowledgeResult {
  text: string;
  score?: number;
}

export interface BuildProposalPromptData {
  intent: UserRequirement;
  rules: RuleData;
  knowledge: KnowledgeResult[];
  userInput: string;
}

/** 价格来源中文标签（统一决策链路：产品库→定额库→联网→估算） */
export function priceSourceText(source: SelectedEquipment['priceSource']): string {
  switch (source) {
    case 'product_db':
      return '产品价格库';
    case 'quota_db':
      return '定额库';
    case 'online_search':
      return '联网搜索';
    case 'rule_estimate':
    default:
      return '规则估算（待核实）';
  }
}

/** 设备清单 → Markdown 表格 */
export function equipmentItemsToMarkdown(items: SelectedEquipment[]): string {
  const rows = items.map(
    (e) =>
      `| ${e.name} | ${e.model} | ${e.quantity} | ${e.specs.replace(/\|/g, '｜')} | ${e.unitPrice.toLocaleString()} | ${priceSourceText(e.priceSource)} |`
  );
  return ['| 设备名称 | 型号 | 数量 | 技术参数 | 单价（元） | 价格来源 |', '| --- | --- | ---: | --- | ---: | --- |', ...rows].join('\n');
}

/** 工艺流程 → 文本链 */
export function processFlowToText(template: ProcessTemplate): string {
  return template.steps.map((s, i) => `${i + 1}. ${s.name}（${s.purpose}）`).join('\n');
}

/** 成本分项 → 文本 */
export function costBreakdownToText(breakdown: {
  equipment: number;
  installation: number;
  piping: number;
  electrical: number;
  transport: number;
  total: number;
}): string {
  return [
    `设备费 ${breakdown.equipment.toLocaleString()} 元（65%）`,
    `安装费 ${breakdown.installation.toLocaleString()} 元（15%）`,
    `管道阀门 ${breakdown.piping.toLocaleString()} 元（8%）`,
    `电控系统 ${breakdown.electrical.toLocaleString()} 元（7%）`,
    `运输费 ${breakdown.transport.toLocaleString()} 元（5%）`,
    `预算总价合计 ${breakdown.total.toLocaleString()} 元`,
  ].join('\n');
}

/**
 * 构建完整 Prompt
 */
export function buildProposalPrompt(data: BuildProposalPromptData): string {
  const { intent, rules, knowledge, userInput } = data;
  const requirementLines = [
    `项目类型：${intent.projectType}`,
    `处理规模：${intent.capacityTd > 0 ? `${intent.capacityTd} t/d` : '待确认'}`,
  ];
  if (intent.processType) requirementLines.push(`工艺倾向：${intent.processType}`);
  if (intent.location) requirementLines.push(`项目地点：${intent.location}`);
  if (intent.budget) requirementLines.push(`预算：${intent.budget} 万元`);
  if (intent.influentQuality) {
    const q = intent.influentQuality;
    const parts = [
      q.cod ? `COD ${q.cod} mg/L` : undefined,
      q.ss ? `SS ${q.ss} mg/L` : undefined,
      q.bod5 ? `BOD5 ${q.bod5} mg/L` : undefined,
      q.ph ? `pH ${q.ph}` : undefined,
    ].filter(Boolean);
    if (parts.length) requirementLines.push(`进水水质：${parts.join('，')}`);
  }
  if (intent.effluentStandards) requirementLines.push('出水标准：用户已指定（见需求）');
  if (intent.requirements?.length) requirementLines.push(`特殊要求：${intent.requirements.join('；')}`);

  const standardsText =
    rules.standards.length > 0
      ? rules.standards.map((s) => `- ${s.code} ${s.name}`).join('\n')
      : rules.standardsText;

  return `你是一位资深环保水处理设备工程专家。请根据以下数据生成专业、完整、可交付的技术方案（招标/投标口径）。

## 用户需求（原始输入）
${userInput}

## 结构化需求（由系统意图处理器提取）
${requirementLines.join('\n')}

## 设备选型计算结果（基于专家规则层，非猜测）
${equipmentItemsToMarkdown(rules.equipmentItems)}
设备费小计：${rules.equipmentTotal.toLocaleString()} 元
选型说明：${rules.processTemplate.designPoints[0] ?? ''}

## 工艺方案（基于内置工艺模板）
工艺路线：${rules.processTemplate.name}
工艺流程：
${rules.processFlowText}
关键参数：${rules.processTemplate.steps.map((s) => s.keyParams.join('、')).filter(Boolean).join('；') || '按设计计算'}

## 成本估算（预算价口径）
${rules.costBreakdownText}

## 供方信息（本公司，来自公司信息库，方案中必须原样引用，不得改动或虚构）
${rules.supplierInfo}

## 数据来源（每个价格/资料均标注来源，方案末尾必须附"数据来源"表）
${rules.dataSourcesMarkdown || '（当前方案价格均为规则估算，建议补充产品价格库后重新生成）'}

## 适用标准
${standardsText}

${knowledge.length > 0 ? `## 知识库参考资料（如有冲突以知识库为准）
${knowledge.map((k) => `- ${k.text}`).join('\n')}` : ''}

## 输出要求
生成完整的 10 章节技术方案，格式为 Markdown：

1. 项目概况（含设计规模、设计依据）
2. 处理对象与水质分析
3. 工艺方案设计（含工艺流程图，用 mermaid 描述）
4. 主要设备技术参数（必须与设备清单一致）
5. 设计计算与处理能力估算（含过滤面积、泵扬程、药剂投加等，必须给出公式与代入）
6. 供货范围与分项报价（标注"预算价"口径，分项加总与总价一致）
7. 安装调试与验收
8. 运行维护指南
9. 商务条款与售后承诺
10. 需确认的数据清单

严格要求：
- 所有设备参数、价格、计算必须基于上述规则数据，不得随意编造
- 报价统一标注"预算价"口径；用户未提供的信息（如精确水质）标注"待确认"
- 语言专业、简洁、准确，禁用"无法提供/无法生成/待您提供后我们再"等推诿表述
- 若用户需求不合理（如处理量过小却要求大型设备），给出专业建议并调整
- 工艺流程图用 \`\`\`mermaid 代码块给出
- 10 个章节标题必须完整列出
- 供方信息必须使用"## 供方信息"章节原样引用，禁止虚构公司名称/联系人/银行账号
- 方案末尾必须追加"## 数据来源"章节，将上述数据来源表原样输出（不得删除来源标注）
- 若某设备价格来源为"规则估算（待核实）"，在报价章节标注"估算价，待核实"`;
}