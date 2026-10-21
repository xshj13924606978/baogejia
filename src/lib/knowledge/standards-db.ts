/**
 * 规范标准库（#[20260827-1030]-3）
 *
 * 收录环保水处理领域常用设计/排放/设备/电气规范，摘录关键条款。
 * 数据为静态摘要，不依赖外部 API。
 */

export interface StandardEntry {
  code: string; // 规范编号
  name: string; // 名称
  category: 'water-quality' | 'discharge' | 'equipment' | 'design' | 'electrical' | 'safety' | 'operation';
  scope: string; // 适用范围
  keyClauses: string[]; // 关键条款摘要
  limitValues?: Record<string, string>; // 重要限值（pH、COD、SS 等）
  url?: string; // 引用参考（非外链）
}

// ============================================================================
// 规范库数据
// ============================================================================

export const STANDARDS_DB: StandardEntry[] = [
  {
    code: 'GB 8978-1996',
    name: '污水综合排放标准',
    category: 'discharge',
    scope: '适用于现有单位和新建单位（包括乡镇企业）的污水排放管理',
    keyClauses: [
      '按受纳水体功能分为一、二、三级标准',
      '污染物按性质分为第一类（含重金属）与第二类',
      '取样与监测须在排放口设采样点',
    ],
    limitValues: {
      '一级标准 pH': '6~9',
      '一级标准 COD': '100 mg/L',
      '一级标准 SS': '70 mg/L',
      '一级标准 BOD5': '30 mg/L',
      '一级标准 氨氮': '15 mg/L',
      '一级标准 磷酸盐（以 P 计）': '0.5 mg/L',
      '一级标准 石油类': '5 mg/L',
    },
  },
  {
    code: 'GB 18918-2002',
    name: '城镇污水处理厂污染物排放标准',
    category: 'discharge',
    scope: '适用于城镇污水处理厂的污染控制',
    keyClauses: [
      '分一级 A、一级 B、二级标准',
      '新建自 2003 年 7 月 1 日起执行',
      '总氮、总磷按受纳水体富营养化状况执行',
    ],
    limitValues: {
      '一级 A COD': '≤ 50 mg/L',
      '一级 A SS': '≤ 10 mg/L',
      '一级 A 氨氮': '≤ 5（8）mg/L',
      '一级 A 总氮': '≤ 15 mg/L',
      '一级 A 总磷': '≤ 0.5 mg/L',
      '一级 B COD': '≤ 60 mg/L',
      '一级 B SS': '≤ 20 mg/L',
    },
  },
  {
    code: 'JB/T 4333-2013',
    name: '厢式压滤机和板框压滤机',
    category: 'equipment',
    scope: '适用于分离固液混合物的厢式、板框压滤机',
    keyClauses: [
      '过滤压力：厢式 ≤ 1.0 MPa，板框 ≤ 0.8 MPa',
      '滤板材质可选 PP、增强聚丙烯、橡胶',
      '自动拉板应设电气联锁',
      '液压系统工作压力不超过额定压力 80%',
    ],
  },
  {
    code: 'CJJ 131-2009',
    name: '城镇污水处理厂运行、维护及安全技术规程',
    category: 'operation',
    scope: '城镇污水处理厂的运行与维护',
    keyClauses: [
      '格栅间隙按进水类型确定',
      '沉砂池运行停留时间 30~60 s',
      '生化池 DO 浓度 2~4 mg/L（好氧段）',
      '污泥脱水机房须设通风与气体检测',
    ],
  },
  {
    code: 'GB 50014-2021',
    name: '室外排水设计标准',
    category: 'design',
    scope: '新建/改扩建城镇、工业企业及小区的室外排水工程设计',
    keyClauses: [
      '雨水管道按 5 年一遇标准设计，重要地区 10 年以上',
      '污水管道最小管径 DN300，最小设计流速 0.6 m/s',
      '压力管道流速宜 0.7~2.0 m/s',
      '排水构筑物水力停留时间按工艺要求确定',
    ],
  },
  {
    code: 'GB 50013-2018',
    name: '室外给水设计标准',
    category: 'design',
    scope: '新建/改扩建的城镇及工业企业室外给水工程设计',
    keyClauses: [
      '给水处理工艺应满足出水水质目标',
      '沉淀池水平流速 ≤ 25 mm/s',
      '滤池滤速 8~12 m/h，反洗强度 12~15 L/(m²·s)',
    ],
  },
  {
    code: 'GB 50052-2009',
    name: '供配电系统设计规范',
    category: 'electrical',
    scope: '110 kV 及以下供配电系统设计',
    keyClauses: [
      '负荷分级：一级（含一级中特别重要）、二级、三级',
      '污水厂通常按二级负荷供电，建议双电源或柴油发电机备用',
      '应设无功功率补偿',
    ],
  },
  {
    code: 'GB 50054-2011',
    name: '低压配电设计规范',
    category: 'electrical',
    scope: '新建/扩建的工业与民用建筑低压配电系统（≤ 1000 V）',
    keyClauses: [
      '应设短路保护、过载保护、接地故障保护',
      '电动机馈线导体截面按启动电流校验',
      '配电柜防护等级室内不低于 IP3X，户外 IP55',
    ],
  },
  {
    code: 'GB 50055-2011',
    name: '通用用电设备配电设计规范',
    category: 'electrical',
    scope: '通用用电设备（含电动机）配电',
    keyClauses: [
      '电动机应设短路保护和接地故障保护',
      '连续运行风机/水泵宜设过载保护',
      'PLC 控制回路应独立配线，与动力回路分开敷设',
    ],
  },
  {
    code: 'GB 50015-2019',
    name: '建筑给水排水设计标准',
    category: 'design',
    scope: '建筑给水排水设计',
    keyClauses: [
      '管道流速：生活给水 1.0~2.0 m/s，排水 0.6~2.5 m/s',
      'UPVC 给水管压力等级不低于 1.0 MPa',
    ],
  },
  {
    code: 'HJ/T 416-2007',
    name: '环境信息术语与编码',
    category: 'operation',
    scope: '环境信息管理',
    keyClauses: ['不在水处理工艺直接引用，作为资料性参考'],
  },
];

// ============================================================================
// 查询接口
// ============================================================================

export function getStandardByCode(code: string): StandardEntry | null {
  return STANDARDS_DB.find((s) => s.code.toLowerCase() === code.toLowerCase()) ?? null;
}

export function searchStandards(keyword: string): StandardEntry[] {
  const k = keyword.toLowerCase();
  return STANDARDS_DB.filter(
    (s) => s.code.toLowerCase().includes(k) || s.name.toLowerCase().includes(k) || s.keyClauses.some((c) => c.toLowerCase().includes(k))
  );
}

export function getStandardsByCategory(category: StandardEntry['category']): StandardEntry[] {
  return STANDARDS_DB.filter((s) => s.category === category);
}

/** 根据项目类型与工艺类型推荐相关规范 */
export function getRelatedStandards(projectType: string, processType?: string): StandardEntry[] {
  const tags = [projectType, processType].filter(Boolean).join(' ').toLowerCase();
  const matched = new Set<string>();
  for (const s of STANDARDS_DB) {
    if (
      tags.includes('污水') ||
      tags.includes('处理') ||
      tags.includes('泥浆') ||
      tags.includes('水')
    ) {
      if (s.category === 'discharge' || s.category === 'water-quality') matched.add(s.code);
    }
    if (tags.includes('压滤') || tags.includes('脱水') || tags.includes('板框')) {
      if (s.code.startsWith('JB/T 4333')) matched.add(s.code);
    }
    if (s.category === 'design') matched.add(s.code);
    if (s.category === 'electrical') matched.add(s.code);
    if (s.category === 'operation') matched.add(s.code);
  }
  return STANDARDS_DB.filter((s) => matched.has(s.code));
}

/** 将规范条目格式化为 Markdown 列表 */
export function standardsToMarkdown(entries: StandardEntry[]): string {
  if (entries.length === 0) return '';
  const lines: string[] = [];
  for (const e of entries) {
    lines.push(`**${e.code} ${e.name}**`);
    lines.push(`适用范围：${e.scope}`);
    lines.push('主要条款：');
    for (const c of e.keyClauses) lines.push(`- ${c}`);
    if (e.limitValues) {
      lines.push('重要限值：');
      for (const [k, v] of Object.entries(e.limitValues)) lines.push(`- ${k}: ${v}`);
    }
    lines.push('');
  }
  return lines.join('\n');
}