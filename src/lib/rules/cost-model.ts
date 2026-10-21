/**
 * 成本估算模型（#[20260827-1030]-6 第一层：专家规则层）
 *
 * 内置行业经验系数：
 * - 成本构成比例（设备 65% / 安装 15% / 管道 8% / 电控 7% / 运输 5%）
 * - 按处理量单价估算（simple/standard/complex）+ 规模效应系数
 * - 人工费 = 设备费 × LABOR_COST_FACTOR（环境变量可调）
 *
 * 口径：预算价估算；详细报价以 knowledge/cost-estimator 设备清单法为准。
 */

export type Complexity = 'simple' | 'standard' | 'complex';

export const COST_RATIOS = {
  equipment: 0.65, // 设备费
  installation: 0.15, // 安装费
  piping: 0.08, // 管道阀门
  electrical: 0.07, // 电控
  transport: 0.05, // 运输
} as const;

export interface CostBreakdown {
  equipment: number;
  installation: number;
  piping: number;
  electrical: number;
  transport: number;
  total: number;
}

/** 单位处理量造价（元/吨·天），按复杂度 */
const UNIT_PRICE_BY_COMPLEXITY: Record<Complexity, number> = {
  simple: 1500,
  standard: 2500,
  complex: 4000,
};

/** 人工费系数（环境变量 LABOR_COST_FACTOR，默认 1.0） */
export function getLaborCostFactor(): number {
  const raw = process.env.LABOR_COST_FACTOR;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1.0;
}

/**
 * 总价快速估算：base = capacity × 单价，规模效应系数
 * @param capacityTd 处理量（t/d）
 */
export function estimateTotalCost(capacityTd: number, complexity: Complexity = 'standard'): number {
  if (capacityTd <= 0) return 0;
  const unit = UNIT_PRICE_BY_COMPLEXITY[complexity];
  const base = capacityTd * unit;
  const scaleFactor = capacityTd > 100 ? 0.8 : capacityTd > 50 ? 0.9 : 1.0;
  return Math.round(base * scaleFactor);
}

/** 按经验比例拆分总价 */
export function breakdownByRatios(total: number): CostBreakdown {
  return {
    equipment: Math.round(total * COST_RATIOS.equipment),
    installation: Math.round(total * COST_RATIOS.installation),
    piping: Math.round(total * COST_RATIOS.piping),
    electrical: Math.round(total * COST_RATIOS.electrical),
    transport: Math.round(total * COST_RATIOS.transport),
    total,
  };
}

/** 人工费估算（按设备费，可被 LABOR_COST_FACTOR 调整） */
export function estimateLaborCost(equipmentTotal: number): number {
  return Math.round(equipmentTotal * 0.06 * getLaborCostFactor());
}

/** 全量成本估算（一条龙） */
export function estimateCost(
  capacityTd: number,
  complexity: Complexity = 'standard'
): { total: number; breakdown: CostBreakdown; labor: number; ratios: typeof COST_RATIOS } {
  const total = estimateTotalCost(capacityTd, complexity);
  const breakdown = breakdownByRatios(total);
  const labor = estimateLaborCost(breakdown.equipment);
  return { total, breakdown, labor, ratios: COST_RATIOS };
}

/**
 * 按实际设备费重算成本分项（#[20260827-1030]-7）
 *
 * 设备清单价格经"产品价格库→定额库→联网→估算"解析后，以实际设备费为基准，
 * 按 65/15/8/7/5 比例重算安装/管道/电控/运输与总价，保证分项加总与总价一致。
 */
export function rebaseCostFromEquipment(
  equipmentCost: number,
  prev: { ratios: typeof COST_RATIOS; labor: number } = { ratios: COST_RATIOS, labor: 0 }
): { total: number; breakdown: CostBreakdown; labor: number; ratios: typeof COST_RATIOS } {
  const r = prev.ratios ?? COST_RATIOS;
  if (!Number.isFinite(equipmentCost) || equipmentCost <= 0) {
    const zero = breakdownByRatios(0);
    return { total: 0, breakdown: zero, labor: 0, ratios: r };
  }
  const total = Math.round(equipmentCost / r.equipment);
  const breakdown: CostBreakdown = {
    equipment: Math.round(equipmentCost),
    installation: Math.round(total * r.installation),
    piping: Math.round(total * r.piping),
    electrical: Math.round(total * r.electrical),
    transport: Math.round(total * r.transport),
    total,
  };
  const labor = estimateLaborCost(breakdown.equipment);
  return { total, breakdown, labor, ratios: r };
}