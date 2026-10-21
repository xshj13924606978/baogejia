/**
 * 冒烟测试：#[20260827-1030]-6 规则层 + 意图处理器（不调用 AI/网络）
 * 用例：食品废水100吨/天、电镀废水50吨/天、地铁泥浆水60吨/天
 */
import { parseRequirementByRule, parseCapacity } from '../src/lib/intent-processor';
import {
  selectAllEquipment,
  estimateCost,
  matchScenario,
  resolveProcessTemplate,
  getStandardsForProject,
} from '../src/lib/rules';
import { isKnowledgeBaseEnabled } from '../src/lib/knowledge/knowledge-manager';

function runCase(input: string, expectBlower?: boolean) {
  console.log('========================================');
  console.log(`输入：${input}`);
  const intent = parseRequirementByRule(input);
  console.log(`[意图] 项目类型=${intent.projectType} 处理量=${intent.capacityTd} t/d 工艺=${intent.processType ?? '无'} 置信度=${intent.confidence.toFixed(2)} 提取方式=${intent.extractedBy}`);

  const process = resolveProcessTemplate(intent.projectType, intent.processType);
  const equipment = selectAllEquipment(intent.capacityTd, process.id === 'mud-water' ? '物化压滤' : process.name);
  console.log(`[设备] ${equipment.items.length} 项，设备费小计=${equipment.equipmentTotal.toLocaleString()} 元`);
  for (const e of equipment.items.slice(0, 5)) {
    console.log(`   - ${e.name} ${e.model} ×${e.quantity} 单价=${e.unitPrice.toLocaleString()} 元 [${e.priceSource}]`);
  }

  const scenario = matchScenario(intent.projectType);
  console.log(`[工艺] 场景=${scenario.projectType} → 工艺=${process.name}（${process.steps.length} 步）`);

  const cost = estimateCost(intent.capacityTd, 'standard');
  console.log(`[成本] 预算总价=${cost.total.toLocaleString()} 元（设备占比${(cost.ratios.equipment * 100)}%）`);

  const standards = getStandardsForProject(intent.projectType, intent.processType);
  console.log(`[标准] ${standards.length} 条：${standards.map((s) => s.code).join(', ')}`);

  // 校验
  let ok = true;
  const noSource = equipment.items.filter((e) => !e.priceSource);
  if (noSource.length > 0) { console.log('  ⚠️ 存在无价格来源条目！'); ok = false; }
  if (equipment.equipmentTotal <= 0) { console.log('  ⚠️ 设备费小计为 0！'); ok = false; }
  if (intent.capacityTd <= 0) { console.log('  ⚠️ 处理量解析为 0！'); ok = false; }
  if (expectBlower !== undefined) {
    const hasBlower = equipment.items.some((e) => e.name.includes('鼓风机'));
    if (hasBlower !== expectBlower) { console.log(`  ⚠️ 鼓风机期望=${expectBlower} 实际=${hasBlower}！`); ok = false; }
  }
  if (ok) console.log('  ✅ 校验通过');
  return ok;
}

console.log(`[开关] ENABLE_KNOWLEDGE_BASE=${isKnowledgeBaseEnabled()}`);
console.log(`[单位] parseCapacity('100吨/天')=${parseCapacity('100吨/天')}，parseCapacity('每天五十吨')=${parseCapacity('每天五十吨')}，parseCapacity('每天处理六十吨')=${parseCapacity('每天处理六十吨')}，parseCapacity('三百吨')=${parseCapacity('三百吨')}`);

const ok1 = runCase('食品废水100吨/天', true); // 生化 → 带鼓风机
const ok2 = runCase('电镀废水50吨/天', true); // A/O → 带鼓风机
const ok3 = runCase('地铁盾构施工泥浆水，每天处理60吨，要求泥饼含水率≤60%', false); // 物化 → 无鼓风机
const ok4 = runCase('小区生活污水，300吨每天，A/O工艺', true);
const ok5 = runCase('每天五十吨屠宰废水');

console.log('========================================');
const results = [ok1, ok2, ok3, ok4, ok5];
console.log(`用例结果：${results.filter(Boolean).length}/${results.length} 通过`);
process.exit(results.every(Boolean) ? 0 : 1);
