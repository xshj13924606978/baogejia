/**
 * 混合驱动方案生成器（#[20260827-1030]-6 + #[20260827-1030]-7）
 *
 * 编排三层架构：
 *   第一层 专家规则层（rules/*）       —— 设备选型/工艺匹配/成本估算/标准索引，确定性
 *   第二层 数据服务层（data/*）       —— 价格决策链路（产品库→定额库→联网→估算）、
 *                                        公司信息、客户、方案持久化、数据来源追踪
 *   第三层 AI 推理层（intent + prompt）—— 意图理解 + 注入规则/数据结果的 AI 润色
 *
 * 数据决策链路（用户确认）：
 *   价格：①产品价格库 → ②定额库 → ③联网搜索 → ④规则估算（标注"估算价，待核实"）
 *   资料：①资料库 → ②联网搜索 → ③规则内置
 *
 * 关键特性：
 * - 规则优先：即使 DeepSeek/知识库/数据库完全不可用，也能输出完整、有据的方案（rule-only）
 * - 数据有据：设备价格一律走决策链路并标注来源，方案末尾附"数据来源"表
 * - 动态关联：产品价格库/定额库/公司信息修改后，后续方案自动采用最新数据
 * - 持久化：方案保存到 proposal_history，可追溯、可版本管理
 */

import { callDeepSeekChat } from './deepseek-client';
import { understandUserRequirement, type UserRequirement } from './intent-processor';
import {
  selectAllEquipment,
  estimateCost,
  rebaseCostFromEquipment,
  resolveProcessTemplate,
  getStandardsForProject,
  type Complexity,
  type EquipmentSelectionResult,
} from './rules';
import { getProcessTemplate, type ProcessTemplate } from './knowledge/process-templates';
import type { StandardEntry } from './knowledge/standards-db';
import { resolveEquipmentPrices } from './data/price-resolver';
import { getDefaultCompany, companyToProposalText, type CompanyInfo } from './data/company-service';
import { createDataSourceTracker, type DataSourceTracker } from './data/data-source-tracker';
import { saveProposal, type ProposalRecord } from './data/proposal-storage';
import { searchKnowledgeAssets, type KnowledgeAssetHit } from './data/knowledge-service';
import {
  buildProposalPrompt,
  equipmentItemsToMarkdown,
  processFlowToText,
  costBreakdownToText,
} from './prompts/proposal-prompt';

// ============================================================================
// 结果类型
// ============================================================================

export interface ProposalResult {
  success: boolean;
  method: 'hybrid' | 'rule-only'; // 是否经过 AI 润色
  intent: UserRequirement;
  equipment: EquipmentSelectionResult;
  process: ProcessTemplate;
  cost: ReturnType<typeof estimateCost>;
  standards: StandardEntry[];
  knowledge: KnowledgeAssetHit[];
  /** 数据来源标注列表 */
  dataSources: ReturnType<DataSourceTracker['toJSON']>;
  /** 供方（本公司）信息 */
  companyInfo: CompanyInfo | null;
  /** 持久化记录 ID（保存成功时） */
  proposalId?: number;
  markdown: string; // 最终方案（Markdown）
  aiUsed: boolean;
}

export interface GenerateProposalOptions {
  useAI?: boolean; // 是否启用 AI 润色（默认 true）
  complexity?: Complexity; // 成本复杂度
  knowledgeLimit?: number;
  userId?: string; // 用户上下文（价格库/公司信息/方案历史按用户隔离）
  enableOnlineSearch?: boolean; // 覆盖 ENABLE_ONLINE_SEARCH
  saveToHistory?: boolean; // 是否保存方案历史（默认 userId 存在时 true）
}

// ============================================================================
// 规则兜底方案（无 AI 时也能输出完整方案）
// ============================================================================

function buildRuleBasedProposal(
  intent: UserRequirement,
  equipment: EquipmentSelectionResult,
  process: ProcessTemplate,
  cost: ReturnType<typeof estimateCost>,
  standards: StandardEntry[],
  companyText: string,
  dataSourcesMarkdown: string
): string {
  const L: string[] = [];
  const cap = intent.capacityTd > 0 ? `${intent.capacityTd} t/d` : '待确认';

  L.push('# 技术方案（规则引擎生成 · 预算价口径）');
  L.push('');
  L.push('## 0. 供方信息');
  L.push('');
  L.push(companyText);
  L.push('');
  L.push('## 1. 项目概况');
  L.push('');
  L.push(`本项目为${intent.projectType}工程，设计处理规模 ${cap}${intent.location ? `，项目地点：${intent.location}` : ''}。`);
  L.push(`设计依据：《室外排水设计标准》GB 50014-2021、《${standards[0]?.name ?? '污水综合排放标准'}》${standards[0]?.code ?? 'GB 8978-1996'} 等。`);
  L.push('');
  L.push('## 2. 处理对象与水质分析');
  L.push('');
  L.push(`处理对象：${intent.projectType}产生的污水${intent.processType ? `，工艺倾向 ${intent.processType}` : ''}。`);
  L.push(`进水水质：${intent.influentQuality ? Object.entries(intent.influentQuality).map(([k, v]) => `${k.toUpperCase()} ${v} mg/L`).join('，') : '待确认（建议正式设计前取样检测）'}。`);
  L.push('');
  L.push('## 3. 工艺方案设计');
  L.push('');
  L.push(`工艺路线：${process.name}`);
  L.push('');
  L.push('```mermaid');
  L.push('flowchart LR');
  process.steps.forEach((s, i) => L.push(`  A${i + 1}[${s.name}]`));
  for (let i = 0; i < process.steps.length - 1; i++) L.push(`  A${i + 1} --> A${i + 2}`);
  L.push('```');
  L.push('');
  L.push('### 工艺步骤');
  process.steps.forEach((s, i) => {
    L.push(`${i + 1}. **${s.name}**：${s.purpose}`);
    if (s.keyParams.length) L.push(`   - 关键参数：${s.keyParams.join('、')}`);
  });
  L.push('');
  L.push('## 4. 主要设备技术参数');
  L.push('');
  L.push(equipmentItemsToMarkdown(equipment.items));
  L.push('');
  L.push('## 5. 设计计算与处理能力估算');
  L.push('');
  L.push(`- 处理规模：${cap}`);
  L.push('- 压滤机选型：按处理量与含固率确定过滤面积，详见设备清单');
  L.push('- 配套泵/风机：按流量与扬程选型，详见设备清单');
  L.push('- 药剂投加：PAC/PAM 成套加药装置自动投加');
  L.push('');
  L.push('## 6. 供货范围与分项报价（预算价）');
  L.push('');
  L.push(costBreakdownToText(cost.breakdown));
  L.push('');
  L.push('## 7. 安装调试与验收');
  L.push('');
  L.push('- 设备基础施工完成后进行设备安装，单机试运行 24 h');
  L.push('- 联动试运行 72 h，出水水质连续达标视为验收通过');
  L.push('- 提供竣工资料：设备合格证、试运行记录、操作手册');
  L.push('');
  L.push('## 8. 运行维护指南');
  L.push('');
  process.opPoints.forEach((p) => L.push(`- ${p}`));
  L.push('');
  L.push('## 9. 商务条款');
  L.push('');
  L.push('- 报价为预算价，最终以深化设计后正式报价为准');
  L.push('- 质保期 12 个月，质保期内免费维修更换');
  L.push('- 交货期：合同签订后 30~45 天');
  L.push('');
  L.push('## 10. 需确认的数据清单');
  L.push('');
  L.push('- [ ] 精确进水水质（COD/SS/BOD/氨氮等）');
  L.push('- [ ] 出水执行标准（一级A/一级B/回用等）');
  L.push('- [ ] 现场标高、电源条件、场地尺寸');
  L.push('- [ ] 处理量日变化系数与最大时流量');
  if (intent.capacityTd <= 0) L.push('- [ ] 处理规模（当前未提供）');
  L.push('');
  if (dataSourcesMarkdown) {
    L.push(dataSourcesMarkdown);
    L.push('');
  }
  return L.join('\n');
}

/** 清理 AI 输出的 markdown 代码块围栏 */
function stripMarkdownFence(text: string): string {
  const t = text.trim();
  const fence = /^```(?:markdown|md)?\s*\n?([\s\S]*?)\n?```$/;
  const m = t.match(fence);
  return m ? m[1].trim() : t;
}

// ============================================================================
// 主入口
// ============================================================================

export async function generateProposal(userInput: string, options?: GenerateProposalOptions): Promise<ProposalResult> {
  const useAI = options?.useAI !== false;
  const complexity = options?.complexity ?? 'standard';
  const userId = options?.userId;
  const tracker = createDataSourceTracker();

  // ====== 第 1 步：AI/规则理解意图 ======
  const intent = await understandUserRequirement(userInput, { useAI });

  // ====== 第 2 步：规则层计算（确定性，不依赖资料） ======
  const process = resolveProcessTemplate(intent.projectType, intent.processType);
  // 工艺类型同步给设备选型：生化类工艺自动附带曝气设备
  const equipment = selectAllEquipment(intent.capacityTd, process.id === 'mud-water' ? '物化压滤' : process.name);
  let cost = estimateCost(intent.capacityTd, complexity);
  const standards = getStandardsForProject(intent.projectType, intent.processType);

  // ====== 第 2.5 步：价格决策链路（产品库→定额库→联网→估算） ======
  const enrichedItems = await resolveEquipmentPrices(equipment.items, {
    userId,
    enableOnlineSearch: options?.enableOnlineSearch,
  });
  const enrichedEquipmentTotal = enrichedItems.reduce((sum, e) => sum + e.unitPrice * e.quantity, 0);
  const equipmentResolved: EquipmentSelectionResult = {
    ...equipment,
    items: enrichedItems,
    equipmentTotal: enrichedEquipmentTotal,
  };
  // 设备费以实际解析结果为准，按 65/15/8/7/5 重算成本分项，保证分项与总价一致
  cost = rebaseCostFromEquipment(enrichedEquipmentTotal, cost);
  // 追踪每台设备的定价来源
  for (const item of enrichedItems) {
    tracker.track({
      label: `${item.name} ${item.model}`,
      detail: `${item.unitPrice.toLocaleString()} 元/台`,
      source: item.priceSource === 'product_db' || item.priceSource === 'quota_db' || item.priceSource === 'online_search'
        ? (item.priceSource === 'product_db' ? '产品价格库' : item.priceSource === 'quota_db' ? '定额库' : '联网搜索')
        : '规则估算（估算价，待核实）',
      sourceType: (item.priceSource || 'rule_estimate') as any,
    });
  }

  // ====== 第 3 步：资料检索（资料库 → 规则内置，联网补充由 AI 层可选进行） ======
  const knowledge = await searchKnowledgeAssets(
    `${intent.projectType} ${intent.capacityTd > 0 ? intent.capacityTd + '吨/天' : ''} ${intent.processType ?? ''}`.trim(),
    { limit: options?.knowledgeLimit ?? 4 }
  );
  for (const k of knowledge) {
    tracker.track({
      label: '资料引用',
      detail: k.title,
      source: k.sourceDetail,
      sourceType: 'knowledge_db',
    });
  }

  // ====== 第 3.5 步：供方信息（公司信息库，杜绝硬编码） ======
  const companyInfo = await getDefaultCompany(userId);
  const companyText = companyToProposalText(companyInfo);
  if (companyInfo) {
    tracker.track({
      label: '供方信息',
      detail: companyInfo.company_name,
      source: '公司信息库（company_info）',
      sourceType: 'company_db',
    });
  }

  // ====== 第 4 步：AI 润色生成 ======
  let markdown = '';
  let aiUsed = false;
  let method: ProposalResult['method'] = 'rule-only';
  const dataSourcesMarkdown = tracker.toMarkdown();

  if (useAI && intent.capacityTd > 0) {
    try {
      const rules = {
        equipmentItems: equipmentResolved.items,
        equipmentTotal: equipmentResolved.equipmentTotal,
        processTemplate: process,
        processFlowText: processFlowToText(process),
        costTotal: cost.total,
        costBreakdownText: costBreakdownToText(cost.breakdown),
        standards,
        standardsText: standards.map((s) => `${s.code} ${s.name}`).join('\n'),
        supplierInfo: companyText,
        dataSourcesMarkdown,
      };
      const prompt = buildProposalPrompt({
        intent,
        rules,
        knowledge: knowledge.map((k) => ({ text: `${k.title}：${k.summary ?? k.contentPreview ?? ''}` })),
        userInput,
      });
      const res = await callDeepSeekChat({
        messages: [
          {
            role: 'system',
            content: '你是一名严谨的环保水处理工程专家，输出专业的中文技术方案，严格遵循用户要求，不编造任何价格与参数。',
          },
          { role: 'user', content: prompt },
        ],
        temperature: 0.3,
        maxTokens: 6000,
      });
      markdown = stripMarkdownFence(res.text);
      if (markdown.length > 200) {
        aiUsed = true;
        method = 'hybrid';
        // AI 方案末尾追加数据来源表
        if (dataSourcesMarkdown) {
          markdown = markdown.trimEnd() + '\n\n---\n\n' + dataSourcesMarkdown;
        }
      }
    } catch (e) {
      console.warn('[proposal-generator] AI 润色失败，降级为规则引擎方案:', e);
    }
  }

  // ====== 第 5 步：兜底 ======
  if (!markdown) {
    markdown = buildRuleBasedProposal(intent, equipmentResolved, process, cost, standards, companyText, dataSourcesMarkdown);
  }

  // ====== 第 6 步：持久化（可追溯、可版本管理） ======
  let proposalId: number | undefined;
  const saveToHistory = options?.saveToHistory ?? Boolean(userId);
  if (saveToHistory) {
    const record: ProposalRecord | null = await saveProposal({
      userId,
      projectType: intent.projectType,
      capacity: intent.capacityTd > 0 ? intent.capacityTd : undefined,
      totalPrice: cost.total,
      content: markdown,
      dataSources: tracker.toJSON(),
      meta: { method, aiUsed, processName: process.name, input: userInput.slice(0, 500) },
    });
    proposalId = record?.id;
  }

  return {
    success: true,
    method,
    intent,
    equipment: equipmentResolved,
    process,
    cost,
    standards,
    knowledge,
    dataSources: tracker.toJSON(),
    companyInfo,
    proposalId,
    markdown,
    aiUsed,
  };
}

// 兼容导出：部分调用方可能直接引用工艺模板
export { getProcessTemplate };
