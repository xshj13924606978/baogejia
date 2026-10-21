/**
 * 设备参数库（#[20260827-1030]-3）
 *
 * 内置环保水处理常用设备的标准规格、技术参数与参考价格区间。
 * 所有价格均为市场参考区间（元/台/套），供成本估算模型调用；
 * 不依赖任何外部 API，纯静态数据。
 */

export interface EquipmentModelSpec {
  model: string; // 型号/规格档位
  powerKw?: number; // 装机功率 (kW)
  specs?: string; // 关键技术参数描述
  priceRange: [number, number]; // 参考价区间（元）
  note?: string; // 备注
}

export interface EquipmentRecord {
  id: string;
  name: string; // 显示名称
  category: string; // 分类（设备/电控/管阀件）
  keywords: string[]; // 匹配关键词（用于按设备名检索）
  brands: string[]; // 常见品牌/产地
  warrantyMonths: number; // 质保期（月）
  models: EquipmentModelSpec[]; // 规格档位
  selectionRule?: string; // 选型依据说明
}

// ============================================================================
// 设备库数据
// ============================================================================

const EQUIPMENT_DB: EquipmentRecord[] = [
  {
    id: 'filter-press',
    name: '板框/厢式压滤机',
    category: '设备',
    keywords: ['压滤', '板框', '厢式', '隔膜'],
    brands: ['国产一线（景津/兴源/中大贝莱特）', '国产优质'],
    warrantyMonths: 12,
    selectionRule: '按污泥干固量及批次过滤周期选型，过滤面积 A = 干泥量×周期/单位面积产泥量，工作压力 0.5~1.6 MPa',
    models: [
      { model: 'XAY-320/800-U（30 m²）', powerKw: 2.2, specs: '过滤面积 30 m²，滤板 800×800，工作压力 ≤1.0 MPa', priceRange: [78000, 96000], note: '小型站/泥浆处理' },
      { model: 'XAY-500/1000-U（50 m²）', powerKw: 3.0, specs: '过滤面积 50 m²，滤板 1000×1000，工作压力 ≤1.2 MPa', priceRange: [115000, 142000], note: '60 t/d 级泥浆/污泥脱水' },
      { model: 'XAY-800/1250-U（80 m²）', powerKw: 4.0, specs: '过滤面积 80 m²，滤板 1250×1250，自动拉板', priceRange: [168000, 205000], note: '中型站' },
      { model: 'XAY-1000/1250-U（100 m²）', powerKw: 5.5, specs: '过滤面积 100 m²，自动拉板+翻板接液', priceRange: [210000, 258000], note: '中型站' },
      { model: 'XAY-1500/1500-U（150 m²）', powerKw: 7.5, specs: '过滤面积 150 m²，全自动液压', priceRange: [320000, 398000], note: '大型站' },
    ],
  },
  {
    id: 'belt-press',
    name: '带式浓缩脱水一体机',
    category: '设备',
    keywords: ['带式', '浓缩脱水', '带机'],
    brands: ['国产优质', '合资品牌'],
    warrantyMonths: 12,
    selectionRule: '按进泥量及脱水后泥饼含水率选型，处理量 5~30 m³/h',
    models: [
      { model: 'DYQ-1000（带宽 1.0 m）', powerKw: 3.0, specs: '处理量 5~10 m³/h，泥饼含水率 ≤80%', priceRange: [158000, 196000] },
      { model: 'DYQ-1500（带宽 1.5 m）', powerKw: 4.0, specs: '处理量 8~15 m³/h，泥饼含水率 ≤80%', priceRange: [228000, 285000] },
    ],
  },
  {
    id: 'lift-pump',
    name: '提升泵/潜污泵',
    category: '设备',
    keywords: ['提升泵', '潜污泵', '污水泵', '提升'],
    brands: ['南方泵业/凯泉/连成', '国产一线'],
    warrantyMonths: 12,
    selectionRule: '按设计流量 1.2 倍安全系数、扬程含 15% 富裕水头选型',
    models: [
      { model: 'WQ15-15-1.5（15 m³/h, 15 m）', powerKw: 1.5, specs: '流量 15 m³/h，扬程 15 m，铸铁/不锈钢叶轮', priceRange: [3200, 5200] },
      { model: 'WQ25-20-3.0（25 m³/h, 20 m）', powerKw: 3.0, specs: '流量 25 m³/h，扬程 20 m', priceRange: [4800, 7800] },
      { model: 'WQ40-25-5.5（40 m³/h, 25 m）', powerKw: 5.5, specs: '流量 40 m³/h，扬程 25 m', priceRange: [8200, 12600] },
      { model: 'WQ60-30-7.5（60 m³/h, 30 m）', powerKw: 7.5, specs: '流量 60 m³/h，扬程 30 m', priceRange: [11200, 16800] },
      { model: 'WQ100-25-11（100 m³/h, 25 m）', powerKw: 11.0, specs: '流量 100 m³/h，扬程 25 m', priceRange: [15800, 22600] },
    ],
  },
  {
    id: 'sludge-pump',
    name: '污泥螺杆泵/转子泵',
    category: '设备',
    keywords: ['污泥泵', '螺杆泵', '转子泵', '污泥输送'],
    brands: ['耐驰/西派克', '国产优质'],
    warrantyMonths: 12,
    selectionRule: '输送含固率 ≤20% 污泥，按流量与压力选型，橡胶定子寿命约 3000 h',
    models: [
      { model: 'G35-1（5 m³/h, 0.6 MPa）', powerKw: 2.2, specs: '流量 5 m³/h，压力 0.6 MPa', priceRange: [12800, 18600] },
      { model: 'G40-2（8 m³/h, 0.6 MPa）', powerKw: 4.0, specs: '流量 8 m³/h，压力 0.6 MPa', priceRange: [18600, 25600] },
      { model: 'G50-2（15 m³/h, 0.8 MPa）', powerKw: 7.5, specs: '流量 15 m³/h，压力 0.8 MPa', priceRange: [28600, 36800] },
    ],
  },
  {
    id: 'dosing-pump',
    name: '加药计量泵',
    category: '设备',
    keywords: ['加药泵', '计量泵', '药剂泵', '加药'],
    brands: ['米顿罗/帕斯菲达', '国产优质'],
    warrantyMonths: 12,
    selectionRule: '按药剂投加量与浓度选型，隔膜式计量泵精度 ±1%',
    models: [
      { model: 'JZ-25/1.0（25 L/h, 1.0 MPa）', powerKw: 0.25, specs: '流量 25 L/h，压力 1.0 MPa，隔膜式', priceRange: [2600, 4600] },
      { model: 'JZ-60/1.0（60 L/h, 1.0 MPa）', powerKw: 0.37, specs: '流量 60 L/h，压力 1.0 MPa', priceRange: [3800, 6800] },
      { model: 'JZ-120/0.6（120 L/h, 0.6 MPa）', powerKw: 0.75, specs: '流量 120 L/h，压力 0.6 MPa', priceRange: [5600, 9600] },
    ],
  },
  {
    id: 'blower',
    name: '罗茨鼓风机',
    category: '设备',
    keywords: ['风机', '罗茨', '曝气', '鼓风'],
    brands: ['章鼓/百事德/锦工', '国产一线'],
    warrantyMonths: 12,
    selectionRule: '按曝气需氧量与水深选型，风量含 20% 富余，出口压力按水深+管路损失',
    models: [
      { model: 'SSR-80（3.6 m³/min, 0.05 MPa）', powerKw: 5.5, specs: '风量 3.6 m³/min，压力 49 kPa', priceRange: [15800, 22600] },
      { model: 'SSR-125（8.5 m³/min, 0.06 MPa）', powerKw: 11.0, specs: '风量 8.5 m³/min，压力 58.8 kPa', priceRange: [26800, 35600] },
      { model: 'SSR-150（14 m³/min, 0.06 MPa）', powerKw: 18.5, specs: '风量 14 m³/min，压力 58.8 kPa', priceRange: [36800, 46800] },
    ],
  },
  {
    id: 'membrane',
    name: '中空纤维膜组件（MBR）',
    category: '设备',
    keywords: ['膜', 'MBR', '中空纤维', '膜组件'],
    brands: ['碧水源/津膜/三菱丽阳', '国产一线'],
    warrantyMonths: 24,
    selectionRule: '按设计通量 15~20 L/(m²·h) 选型，含 1.2 倍余量，反洗周期 8~12 min',
    models: [
      { model: 'MBBR-10（10 m²/组）', specs: '有效膜面积 10 m²/组，PVDF 材质', priceRange: [6500, 9800] },
      { model: 'MBBR-20（20 m²/组）', specs: '有效膜面积 20 m²/组，PVDF 材质', priceRange: [11800, 17600] },
      { model: 'MBBR-50（50 m²/组）', specs: '有效膜面积 50 m²/组，PVDF 材质', priceRange: [26800, 38600] },
    ],
  },
  {
    id: 'mixer',
    name: '潜水搅拌机/框式搅拌机',
    category: '设备',
    keywords: ['搅拌', '推流', '搅拌机'],
    brands: ['国产优质', '合资'],
    warrantyMonths: 12,
    selectionRule: '按池容与搅拌功率密度（4~8 W/m³）选型',
    models: [
      { model: 'QJB1.5/8（1.5 kW）', powerKw: 1.5, specs: '叶轮直径 260 mm，功率密度 4~8 W/m³', priceRange: [6800, 9800] },
      { model: 'QJB2.2/8（2.2 kW）', powerKw: 2.2, specs: '叶轮直径 320 mm', priceRange: [8800, 12600] },
      { model: 'QJB4.0/12（4.0 kW）', powerKw: 4.0, specs: '叶轮直径 400 mm', priceRange: [13800, 19600] },
    ],
  },
  {
    id: 'scraper',
    name: '刮泥机/吸泥机',
    category: '设备',
    keywords: ['刮泥', '吸泥', '刮渣', '沉淀池'],
    brands: ['国产优质'],
    warrantyMonths: 12,
    selectionRule: '按池径与池型选型，周边传动/中心传动',
    models: [
      { model: 'XG-6（池径 6 m）', powerKw: 0.75, specs: '周边传动刮泥机，池径 6 m', priceRange: [28600, 38600] },
      { model: 'XG-10（池径 10 m）', powerKw: 1.5, specs: '周边传动刮泥机，池径 10 m', priceRange: [46800, 62800] },
    ],
  },
  {
    id: 'dosing-system',
    name: '成套加药装置',
    category: '设备',
    keywords: ['加药装置', 'PAC', 'PAM', '絮凝', '药剂'],
    brands: ['国产成套', '国产优质'],
    warrantyMonths: 12,
    selectionRule: '按药剂种类与投加量选型，含溶药箱/搅拌/计量泵/管路',
    models: [
      { model: 'JY-1.5（1.5 m³ 两箱两泵）', powerKw: 1.5, specs: '溶药箱 1.5 m³×2，计量泵 2 台，PAC/PAM 各一', priceRange: [28600, 42600] },
      { model: 'JY-3.0（3.0 m³ 三箱三泵）', powerKw: 2.2, specs: '溶药箱 3.0 m³×3，计量泵 3 台', priceRange: [46800, 66800] },
    ],
  },
  {
    id: 'electrical-cabinet',
    name: '电气控制柜（PLC）',
    category: '电控',
    keywords: ['电控', 'PLC', '控制柜', '自控'],
    brands: ['国产成套（西门子/施耐德/正泰元件）', '国产成套'],
    warrantyMonths: 18,
    selectionRule: '按控制点数与自动化等级选型，含手动/自动/远程三种模式',
    models: [
      { model: 'PLC-16（16 点 DI/DO）', specs: 'PLC 控制柜，16 点开关量，含触摸屏', priceRange: [18600, 28600] },
      { model: 'PLC-32（32 点 DI/DO）', specs: 'PLC 控制柜，32 点开关量+4AI，含触摸屏与云盒', priceRange: [28600, 42600] },
      { model: 'PLC-64（64 点 DI/DO）', specs: 'PLC 控制柜，64 点开关量+8AI，含远程监控', priceRange: [46800, 68800] },
    ],
  },
  {
    id: 'grit-screen',
    name: '机械格栅/格栅除污机',
    category: '设备',
    keywords: ['格栅', '拦污', '除污机'],
    brands: ['国产优质'],
    warrantyMonths: 12,
    selectionRule: '按栅条间距（10~20 mm）与过栅流速（≤0.9 m/s）选型',
    models: [
      { model: 'GS-800（栅宽 800 mm）', powerKw: 1.1, specs: '耙齿式格栅除污机，栅条间距 15 mm', priceRange: [18600, 28600] },
      { model: 'GS-1200（栅宽 1200 mm）', powerKw: 1.5, specs: '耙齿式格栅除污机，栅条间距 20 mm', priceRange: [26800, 38600] },
    ],
  },
  {
    id: 'daf',
    name: '溶气气浮装置（DAF）',
    category: '设备',
    keywords: ['气浮', 'DAF', '溶气'],
    brands: ['国产优质'],
    warrantyMonths: 12,
    selectionRule: '按表面负荷 5~8 m³/(m²·h) 选型，回流比 20~30%',
    models: [
      { model: 'DAF-10（10 m³/h）', powerKw: 3.0, specs: '处理量 10 m³/h，含溶气罐/释放器/刮渣机', priceRange: [86800, 116800] },
      { model: 'DAF-25（25 m³/h）', powerKw: 5.5, specs: '处理量 25 m³/h，含溶气罐/释放器/刮渣机', priceRange: [156800, 206800] },
    ],
  },
  {
    id: 'sand-filter',
    name: '砂滤罐/多介质过滤器',
    category: '设备',
    keywords: ['砂滤', '过滤罐', '多介质', '过滤器'],
    brands: ['国产优质'],
    warrantyMonths: 12,
    selectionRule: '按滤速 8~12 m/h 选型，反洗强度 12~15 L/(m²·s)',
    models: [
      { model: 'GL-800（φ800）', specs: '碳钢衬胶，滤速 8~12 m/h', priceRange: [8600, 12600] },
      { model: 'GL-1200（φ1200）', specs: '碳钢衬胶，含自动反洗', priceRange: [15600, 22600] },
      { model: 'GL-2000（φ2000）', specs: '碳钢衬胶，含自动反洗阀门组', priceRange: [36800, 52600] },
    ],
  },
  {
    id: 'piping-valves',
    name: '工艺管道/阀门/管件',
    category: '管阀件',
    keywords: ['管道', '管件', '阀门', '管路', 'UPVC'],
    brands: ['国产（联塑/中财 UPVC，铸钢阀）', '国产'],
    warrantyMonths: 12,
    selectionRule: '按经济流速（压力管 0.6~1.5 m/s）计算管径，含阀门/法兰/支架/防腐',
    models: [
      { model: '成套管阀件（按设计）', specs: 'UPVC/碳钢管道、阀门、法兰、支架、防腐', priceRange: [8600, 18600] },
    ],
  },
  {
    id: 'sludge-concentrator',
    name: '污泥浓缩设备',
    category: '设备',
    keywords: ['浓缩', '污泥浓缩'],
    brands: ['国产优质'],
    warrantyMonths: 12,
    selectionRule: '按浓缩时间 12~24 h 与固体负荷选型',
    models: [
      { model: '浓缩机/浓缩池成套', powerKw: 2.2, specs: '重力浓缩池配套刮泥机与排泥系统', priceRange: [38600, 58600] },
    ],
  },
];

// ============================================================================
// 查询接口
// ============================================================================

/** 按设备名关键词匹配设备库条目 */
export function findEquipment(name: string): EquipmentRecord | null {
  if (!name) return null;
  const key = name.toLowerCase();
  for (const record of EQUIPMENT_DB) {
    if (record.keywords.some((kw) => key.includes(kw.toLowerCase()))) {
      return record;
    }
  }
  return null;
}

/** 按设备名获取参考单价（取价格区间中值，可选档位 index） */
export function getEquipmentUnitPrice(
  name: string,
  tierIndex = 0,
  quantity = 1
): { price: number; source: string; record: EquipmentRecord | null } | null {
  const record = findEquipment(name);
  if (!record || record.models.length === 0) return null;
  const idx = Math.min(tierIndex, record.models.length - 1);
  const [lo, hi] = record.models[idx].priceRange;
  const price = Math.round((lo + hi) / 2 / Math.max(1, quantity));
  return { price, source: `设备参数库「${record.name}」${record.models[idx].model} 参考价中值`, record };
}

/** 按设备名获取推荐型号档位（按规模/功率自动匹配） */
export function pickEquipmentModel(
  name: string,
  options?: { powerKw?: number; capacity?: number }
): { model: EquipmentModelSpec; record: EquipmentRecord } | null {
  const record = findEquipment(name);
  if (!record || record.models.length === 0) return null;
  // 有功率需求时选择最接近且不小于需求的档位
  if (options?.powerKw) {
    const sorted = [...record.models].sort(
      (a, b) => Math.abs((a.powerKw ?? 0) - options.powerKw!) - Math.abs((b.powerKw ?? 0) - options.powerKw!)
    );
    return { model: sorted[0], record };
  }
  // 按处理规模选择档位（粗略：规模越大取高档）
  const cap = options?.capacity ?? 0;
  const idx = cap > 200 ? record.models.length - 1 : cap > 80 ? Math.min(2, record.models.length - 1) : 0;
  return { model: record.models[idx], record };
}

/** 获取全部设备条目（用于排障/调试） */
export function getAllEquipment(): EquipmentRecord[] {
  return EQUIPMENT_DB.map((r) => ({ ...r, models: [...r.models] }));
}
