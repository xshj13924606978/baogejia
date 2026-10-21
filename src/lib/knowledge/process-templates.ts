/**
 * 工艺方案模板（#[20260827-1030]-3）
 *
 * 收录常用污水处理工艺路线的结构化模板（含步骤、关键参数、设备配套、
 * 设计/运维要点）。用于方案生成引擎推断工艺路径、构建工艺流程图与
 * 章节文本。
 */

export interface ProcessStep {
  name: string;
  purpose: string;
  keyParams: string[];
  equipment: string[]; // 涉及设备类别（与设备库 ID 对应）
}

export interface ProcessTemplate {
  id: string;
  name: string;
  aliases: string[]; // 工艺别名（用于自动匹配）
  scenarios: string; // 适用场景
  steps: ProcessStep[];
  designPoints: string[]; // 设计要点
  opPoints: string[]; // 运维要点
  expectedRemoval: Record<string, string>; // 预期处理效果
}

// ============================================================================
// 工艺模板
// ============================================================================

export const PROCESS_TEMPLATES: ProcessTemplate[] = [
  {
    id: 'mud-water',
    name: '泥浆水物化处理工艺（混凝+沉淀+压滤）',
    aliases: ['泥浆', '泥浆水', '盾构', '地铁施工', '钻孔', '钻屑', '物化', '混凝沉淀'],
    scenarios: '地铁盾构/钻孔桩/河道清淤等高浊度泥浆水的预处理与脱水',
    steps: [
      { name: '收集调节', purpose: '均质均量、沉砂', keyParams: ['停留时间 4~6 h', '设溢流与排砂'], equipment: ['机械格栅', '潜水搅拌机'] },
      { name: '絮凝反应', purpose: 'PAC/PAM 桥联絮凝', keyParams: ['PAC 100~150 mg/L', 'PAM 1.5~3 mg/L', 'GT 值 1×10⁴~5×10⁴'], equipment: ['成套加药装置', '潜水搅拌机'] },
      { name: '沉淀/浓缩', purpose: '固液分离', keyParams: ['表面负荷 1.0~1.5 m³/(m²·h)', '含固率提升至 3~5%'], equipment: ['刮泥机'] },
      { name: '压滤脱水', purpose: '泥饼外运', keyParams: ['过滤压力 0.6~1.2 MPa', '泥饼含水率 ≤ 60%'], equipment: ['板框/厢式压滤机', '污泥螺杆泵'] },
      { name: '滤液回用', purpose: '循环利用', keyParams: ['SS < 100 mg/L', '回调节池'], equipment: ['提升泵'] },
    ],
    designPoints: [
      '调节池 HRT ≥ 4 h，配套液位计与溢流口',
      '压滤机按日处理批次配置，循环时间 ≤ 8 h',
      '脱水机房设通风、除臭与气体检测',
      '回流液水质应满足排放或回用要求',
    ],
    opPoints: [
      '每日监测进料含固率与药剂投加量',
      '每周清洗滤布/滤板，校核压榨压力',
      '滤液 SS 异常时加大絮凝剂量或回流',
      '冬季低温时 PAC 配置浓度提高 10%',
    ],
    expectedRemoval: {
      '进料 SS': '5,000~60,000 mg/L',
      '泥饼含水率': '≤ 60%',
      '滤液 SS': '< 100 mg/L',
    },
  },
  {
    id: 'ao',
    name: 'A/O（厌氧-好氧）生化工艺',
    aliases: ['A/O', 'AO', '缺氧好氧', '脱氮'],
    scenarios: '城镇污水/工业废水的脱氮处理',
    steps: [
      { name: '预处理', purpose: '除砂除渣', keyParams: ['细格栅间隙 ≤ 5 mm'], equipment: ['机械格栅', '沉砂设备'] },
      { name: '厌氧（A）池', purpose: '反硝化脱氮', keyParams: ['HRT 2~4 h', 'NO3-N < 5 mg/L', 'MLSS 3000~5000 mg/L'], equipment: ['潜水搅拌机'] },
      { name: '好氧（O）池', purpose: 'COD/BOD 降解与硝化', keyParams: ['HRT 6~10 h', 'DO 2~3 mg/L', 'MLSS 3000~4000 mg/L'], equipment: ['罗茨鼓风机', '曝气器'] },
      { name: '二沉池', purpose: '泥水分离', keyParams: ['表面负荷 1.0~1.5 m³/(m²·h)'], equipment: ['刮泥机', '污泥回流泵'] },
      { name: '污泥脱水', purpose: '剩余污泥处理', keyParams: ['剩余污泥量 0.3~0.5 kgDS/m³'], equipment: ['板框/厢式压滤机', '污泥螺杆泵'] },
    ],
    designPoints: [
      'A 池与 O 池容积比 1:3~1:2',
      '混合液回流比 200~400%',
      '污泥回流比 50~100%',
      '硝化反应受温度影响，冬季须保温',
    ],
    opPoints: [
      '每日监测 DO、pH、温度、MLSS',
      '硝化效果下降时排查碱度（须 ≥ 100 mg/L CaCO₃）',
      '污泥膨胀时调整 SRT 至 15~20 d',
      '回流泵故障应急启用临时回流管线',
    ],
    expectedRemoval: {
      COD: '去除 85~95%',
      'NH3-N': '去除 80~95%',
      TN: '去除 60~80%',
      SS: '去除 85~95%',
    },
  },
  {
    id: 'a2o',
    name: 'A²/O（厌氧-缺氧-好氧）工艺',
    aliases: ['A2O', 'A²/O', '脱氮除磷'],
    scenarios: '同时要求脱氮除磷的城镇污水处理',
    steps: [
      { name: '厌氧池', purpose: '释磷', keyParams: ['HRT 1~2 h', 'DO < 0.2 mg/L', 'MLSS 3000 mg/L'], equipment: ['潜水搅拌机'] },
      { name: '缺氧池', purpose: '反硝化', keyParams: ['HRT 2~3 h', 'DO < 0.5 mg/L'], equipment: ['潜水搅拌机'] },
      { name: '好氧池', purpose: '硝化与吸磷', keyParams: ['HRT 4~6 h', 'DO 2 mg/L'], equipment: ['罗茨鼓风机', '曝气器'] },
      { name: '二沉池', purpose: '泥水分离与回流', keyParams: ['污泥回流比 50~100%', '混合液回流 200%'], equipment: ['刮泥机', '回流泵'] },
      { name: '化学除磷', purpose: '辅助除磷', keyParams: ['PAC 投加 5~10 mg/L'], equipment: ['加药计量泵'] },
      { name: '污泥脱水', purpose: '剩余污泥处理', keyParams: ['含水率 ≤ 80%'], equipment: ['板框/厢式压滤机'] },
    ],
    designPoints: [
      '总 HRT 8~12 h',
      '碳源不足时需补充乙酸钠或甲醇',
      '污泥龄 SRT 15~20 d',
    ],
    opPoints: [
      '冬季低温硝化速率下降，建议 SBR 备用',
      'TP 异常时启动化学除磷',
      '关注二沉池跑泥情况',
    ],
    expectedRemoval: {
      COD: '去除 85~95%',
      'NH3-N': '去除 85%',
      TN: '去除 70%',
      TP: '去除 80%（含化学除磷）',
    },
  },
  {
    id: 'mbr',
    name: 'MBR（膜生物反应器）',
    aliases: ['MBR', '膜生物反应器', '中空纤维'],
    scenarios: '出水水质要求高（再生水回用、零排放）的中小水量项目',
    steps: [
      { name: '预处理', purpose: '保护膜', keyParams: ['超细格栅 ≤ 1 mm'], equipment: ['机械格栅'] },
      { name: '生化池', purpose: 'COD/氨氮降解', keyParams: ['HRT 8~12 h', 'MLSS 8000~12000 mg/L'], equipment: ['罗茨鼓风机'] },
      { name: 'MBR 膜池', purpose: '泥水分离', keyParams: ['通量 15~20 L/(m²·h)', '跨膜压差 < 30 kPa'], equipment: ['中空纤维膜组件', '抽吸泵', '反洗泵'] },
      { name: '消毒', purpose: '回用安全', keyParams: ['余氯 ≥ 0.3 mg/L'], equipment: ['加药装置'] },
    ],
    designPoints: [
      '膜通量按 15~20 L/(m²·h) 设计，富余 20%',
      '反洗周期 8~12 min',
      '化学清洗周期 6~12 个月',
    ],
    opPoints: [
      '跨膜压差 > 30 kPa 时立即化学清洗',
      '冬季低温影响膜通量，需提高曝气强度',
      '定期监测出水浊度（应 < 1 NTU）',
    ],
    expectedRemoval: {
      COD: '≤ 30 mg/L',
      'NH3-N': '≤ 1.5 mg/L',
      SS: '≤ 5 mg/L',
      浊度: '≤ 1 NTU',
    },
  },
  {
    id: 'sbr',
    name: 'SBR（序批式活性污泥法）',
    aliases: ['SBR', '序批', 'CASS'],
    scenarios: '间歇式进水、中小水量、占地面积受限场景',
    steps: [
      { name: '进水', purpose: '注水', keyParams: ['注水比 1/4~1/3'], equipment: ['进水阀'] },
      { name: '曝气', purpose: '降解', keyParams: ['DO 2~3 mg/L', '曝气时间 2~4 h'], equipment: ['罗茨鼓风机'] },
      { name: '沉淀', purpose: '泥水分离', keyParams: ['沉淀 1~1.5 h'], equipment: [] },
      { name: '滗水', purpose: '排出清水', keyParams: ['滗水速率 5~8 mm/min'], equipment: ['滗水器'] },
      { name: '闲置/排泥', purpose: '周期结束', keyParams: ['闲置 ≤ 2 h'], equipment: ['污泥泵'] },
    ],
    designPoints: [
      '周期数 4~6 周期/d',
      '高水位/低水位液位计配套',
    ],
    opPoints: [
      '冬季低温延长曝气时间',
      '每周校准液位计与滗水器',
    ],
    expectedRemoval: {
      COD: '去除 85%',
      'NH3-N': '去除 80%',
      SS: '去除 90%',
    },
  },
];

// ============================================================================
// 查询接口
// ============================================================================

/**
 * 按工艺名/别名自动匹配最合适的工艺模板
 * 未匹配时返回默认物化处理模板
 */
export function getProcessTemplate(processHint: string): ProcessTemplate {
  const hint = (processHint || '').toLowerCase();
  if (!hint) return PROCESS_TEMPLATES[0];
  for (const t of PROCESS_TEMPLATES) {
    if (t.aliases.some((a) => hint.includes(a.toLowerCase()))) return t;
  }
  // 关键词模糊匹配
  if (hint.includes('生化') || hint.includes('脱氮') || hint.includes('cod')) return PROCESS_TEMPLATES.find((t) => t.id === 'ao') ?? PROCESS_TEMPLATES[0];
  if (hint.includes('膜')) return PROCESS_TEMPLATES.find((t) => t.id === 'mbr') ?? PROCESS_TEMPLATES[0];
  return PROCESS_TEMPLATES[0];
}

/** 获取所有工艺模板（备选/对比） */
export function getProcessAlternatives(currentId?: string): ProcessTemplate[] {
  return PROCESS_TEMPLATES.filter((t) => t.id !== currentId);
}

/** 将工艺模板的步骤格式化为 Mermaid 流程图源代码 */
export function processTemplateToMermaid(template: ProcessTemplate): string {
  const lines: string[] = ['flowchart LR'];
  let prev = 'A1';
  template.steps.forEach((s, i) => {
    const id = `A${i + 1}`;
    lines.push(`  ${id}[${s.name}]`);
    if (i > 0) lines.push(`  ${prev} --> ${id}`);
    prev = id;
  });
  return lines.join('\n');
}