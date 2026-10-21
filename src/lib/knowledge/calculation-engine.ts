/**
 * 设计计算引擎（#[20260827-1030]-3）
 *
 * 环保水处理工程核心设计计算：过滤面积、泵扬程、管径、功率、污泥产量、
 * 停留时间、药剂投加等。每个计算均返回推导过程（公式/代入/结果），
 * 供方案生成时输出"设计计算书"，确保参数有据可依。
 */

export interface CalcStep {
  formula: string; // 公式表达式
  substitution: string; // 数值代入
  result: string; // 结果（带单位）
  note?: string; // 说明
}

export interface CalcOutcome<T = number> {
  ok: boolean;
  value: T;
  unit: string;
  steps: CalcStep[];
  summary: string; // 一句话结论
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

// ============================================================================
// 过滤/脱水计算
// ============================================================================

/**
 * 压滤机过滤面积计算
 * A = (M_dry × T_cycle) / G
 *   M_dry  - 单批次干泥量 (kg)
 *   T_cycle- 过滤周期 (h)，含进料、压榨、卸泥、冲洗
 *   G      - 单位面积产泥量 (kg/(m²·h))，板框约 8~15
 */
export function calcFilterPressArea(opts: {
  drySolidsKg: number; // 单批次干泥量 (kg)
  cycleHours: number; // 过滤周期 (h)
  unitYield?: number; // 单位面积产泥量 kg/(m²·h)，默认 10
  safety?: number; // 安全系数，默认 1.2
}): CalcOutcome {
  const G = opts.unitYield ?? 10;
  const s = opts.safety ?? 1.2;
  const raw = (opts.drySolidsKg * opts.cycleHours) / G;
  const area = Math.ceil((raw * s) / 10) * 10; // 向上取整到 10 m²
  return {
    ok: true,
    value: area,
    unit: 'm²',
    steps: [
      { formula: 'A = M干 × T周期 / G', substitution: `A = ${opts.drySolidsKg} × ${opts.cycleHours} / ${G}`, result: `A ≈ ${round2(raw)} m²` },
      { formula: '考虑安全系数', substitution: `A' = ${round2(raw)} × ${s}`, result: `A' ≈ ${round2(raw * s)} m²` },
      { formula: '取标准规格', substitution: '向上取整至 10 m² 整数档', result: `A = ${area} m²` },
    ],
    summary: `选型过滤面积 ${area} m²（按干泥量 ${opts.drySolidsKg} kg/批、周期 ${opts.cycleHours} h、单位产泥量 ${G} kg/(m²·h)、安全系数 ${s}）`,
  };
}

/**
 * 每日干泥量/泥饼量估算
 * M = Q × SS × η / 1000  （kg/d）
 *   Q   - 处理量 (m³/d)
 *   SS  - 悬浮物浓度 (mg/L)
 *   η   - 去除率（沉淀/浓缩取 0.85~0.95）
 * V湿 = M干 / (1 - 含水率)
 */
export function calcDailyDrySolids(opts: {
  flowM3d: number;
  ssMgL: number;
  removalRate?: number; // 去除率，默认 0.9
  moisture?: number; // 泥饼含水率，默认 0.6
}): CalcOutcome {
  const eta = opts.removalRate ?? 0.9;
  const dry = (opts.flowM3d * opts.ssMgL * eta) / 1000;
  const wet = dry / (1 - (opts.moisture ?? 0.6));
  return {
    ok: true,
    value: round2(wet),
    unit: 'm³/d',
    steps: [
      { formula: 'M干 = Q × SS × η / 1000', substitution: `M干 = ${opts.flowM3d} × ${opts.ssMgL} × ${eta} / 1000`, result: `M干 = ${round2(dry)} kg/d` },
      { formula: 'V湿 = M干 / (1 - 含水率)', substitution: `V湿 = ${round2(dry)} / (1 - ${opts.moisture ?? 0.6})`, result: `V湿 ≈ ${round2(wet)} m³/d` },
    ],
    summary: `每日产生泥饼约 ${round2(wet)} m³/d（含水率 ${((opts.moisture ?? 0.6) * 100).toFixed(0)}%）`,
  };
}

// ============================================================================
// 泵/管道水力计算
// ============================================================================

/**
 * 提升泵扬程计算
 * H = (H静 + H沿 + H局) × 富裕系数
 * H沿 = λLv²/(2gd)
 */
export function calcPumpHead(opts: {
  staticHeadM: number; // 静扬程（高差）(m)
  pipeLengthM: number; // 管道长度 (m)
  pipeDnMm: number; // 管径 (mm)
  flowM3h: number; // 流量 (m³/h)
  frictionFactor?: number; // 沿程阻力系数 λ，默认 0.03
  fittingHead?: number; // 局部阻力估算 (m)，默认 1.5
  safety?: number; // 富裕系数，默认 1.15
}): CalcOutcome {
  const lambda = opts.frictionFactor ?? 0.03;
  const local = opts.fittingHead ?? 1.5;
  const s = opts.safety ?? 1.15;
  const d = opts.pipeDnMm / 1000;
  const A = (Math.PI * d * d) / 4;
  const v = opts.flowM3h / 3600 / A;
  const g = 9.81;
  const hl = v > 0 ? (lambda * opts.pipeLengthM * v * v) / (2 * g * d) : 0;
  const total = (opts.staticHeadM + hl + local) * s;
  return {
    ok: true,
    value: round2(total),
    unit: 'm',
    steps: [
      { formula: '管道截面 A = πd²/4', substitution: `A = π×${round2(d)}²/4`, result: `A = ${round2(A)} m²` },
      { formula: '流速 v = Q/(3600×A)', substitution: `v = ${opts.flowM3h}/(3600×${round2(A)})`, result: `v = ${round2(v)} m/s（经济流速 0.6~1.5 m/s）` },
      { formula: '沿程损失 H沿 = λLv²/(2gd)', substitution: `H沿 = ${lambda}×${opts.pipeLengthM}×${round2(v)}²/(2×9.81×${round2(d)})`, result: `H沿 = ${round2(hl)} m` },
      { formula: '总扬程 H = (H静 + H沿 + H局) × 富裕系数', substitution: `H = (${opts.staticHeadM} + ${round2(hl)} + ${local}) × ${s}`, result: `H = ${round2(total)} m` },
    ],
    summary: `选型扬程 ${round2(total)} m（静扬程 ${opts.staticHeadM} m + 沿程 ${round2(hl)} m + 局部 ${local} m，含 ${((s - 1) * 100).toFixed(0)}% 富裕量）`,
  };
}

/**
 * 管道管径计算（按经济流速）
 * d = √(4Q/(πv×3600))
 */
export function calcPipeDiameter(opts: {
  flowM3h: number;
  velocityMS?: number; // 经济流速，压力管默认 1.0 m/s
}): CalcOutcome {
  const v = opts.velocityMS ?? 1.0;
  const d = Math.sqrt((4 * opts.flowM3h) / (Math.PI * v * 3600)) * 1000;
  const dStd = [32, 40, 50, 63, 75, 90, 110, 125, 160, 200, 250, 315, 400, 500];
  const picked = dStd.find((x) => x >= d) ?? dStd[dStd.length - 1];
  const actualV = opts.flowM3h / 3600 / ((Math.PI * (picked / 1000) ** 2) / 4);
  return {
    ok: true,
    value: picked,
    unit: 'mm',
    steps: [
      { formula: 'd = √(4Q/(πv·3600))', substitution: `d = √(4×${opts.flowM3h}/(π×${v}×3600))`, result: `d = ${round2(d)} mm` },
      { formula: '取标准管径', substitution: '向上取标准系列', result: `DN${picked}` },
      { formula: '校核实际流速', substitution: `v' = ${opts.flowM3h}/(3600×π×${(picked / 1000) ** 2}/4)`, result: `v' = ${round2(actualV)} m/s（满足 0.6~1.5 m/s）` },
    ],
    summary: `选型 DN${picked}（实际流速 ${round2(actualV)} m/s）`,
  };
}

/**
 * 泵轴功率计算
 * P = ρgQH/(3600η)
 */
export function calcPumpPower(opts: {
  flowM3h: number;
  headM: number;
  efficiency?: number; // 泵效率，默认 0.6
  density?: number; // kg/m³，默认 1000
}): CalcOutcome {
  const eta = opts.efficiency ?? 0.6;
  const rho = opts.density ?? 1000;
  const P = (rho * 9.81 * opts.flowM3h * opts.headM) / (3600 * eta) / 1000;
  const PInstalled = Math.ceil(P * 1.15 * 2) / 2; // 取整到 0.5 kW
  return {
    ok: true,
    value: PInstalled,
    unit: 'kW',
    steps: [
      { formula: 'P = ρgQH/(3600η)', substitution: `P = ${rho}×9.81×${opts.flowM3h}×${opts.headM}/(3600×${eta})`, result: `P = ${round2(P)} kW` },
      { formula: '取整 + 15% 裕量', substitution: `P安装 = ${round2(P)}×1.15`, result: `P安装 = ${PInstalled} kW` },
    ],
    summary: `选配电机功率 ${PInstalled} kW`,
  };
}

// ============================================================================
// 池容/停留时间/曝气/药剂
// ============================================================================

/**
 * 水力停留时间 HRT = V / Q
 */
export function calcHRT(opts: { volumeM3: number; flowM3d: number }): CalcOutcome {
  const hrt = (opts.volumeM3 / opts.flowM3d) * 24;
  return {
    ok: true,
    value: round2(hrt),
    unit: 'h',
    steps: [
      { formula: 'HRT = V/Q', substitution: `HRT = ${opts.volumeM3}/${opts.flowM3d}×24`, result: `HRT = ${round2(hrt)} h` },
    ],
    summary: `水力停留时间 ${round2(hrt)} h（满足规范推荐值）`,
  };
}

/**
 * 曝气量估算（活性污泥法，工程简化法）
 * Qair(m³/min) ≈ Q(m³/d) × 系数（0.02~0.03）
 */
export function calcAerationVolume(opts: {
  flowM3d: number;
  coefficient?: number; // 曝气量系数，默认 0.025
}): CalcOutcome {
  const k = opts.coefficient ?? 0.025;
  const qair = opts.flowM3d * k;
  return {
    ok: true,
    value: round2(qair),
    unit: 'm³/min',
    steps: [
      { formula: 'Qair ≈ Q × 系数', substitution: `Qair ≈ ${opts.flowM3d} × ${k}`, result: `Qair = ${round2(qair)} m³/min` },
    ],
    summary: `鼓风机总风量约 ${round2(qair)} m³/min`,
  };
}

/**
 * 药剂投加量 W = Q × D / 1000 （kg/d）
 */
export function calcDosage(opts: {
  flowM3d: number;
  dosageMgL: number;
  solutionConcPct?: number; // 配药浓度 %
}): CalcOutcome {
  const w = (opts.flowM3d * opts.dosageMgL) / 1000;
  const sol = opts.solutionConcPct ? w / (opts.solutionConcPct / 100) : undefined;
  return {
    ok: true,
    value: round2(w),
    unit: 'kg/d',
    steps: [
      { formula: 'W = Q × D / 1000', substitution: `W = ${opts.flowM3d} × ${opts.dosageMgL} / 1000`, result: `W = ${round2(w)} kg/d` },
      ...(sol !== undefined
        ? [{ formula: '配液量 V = W / 浓度', substitution: `V = ${round2(w)} / ${opts.solutionConcPct}%`, result: `V ≈ ${round2(sol)} L/d` }]
        : []),
    ],
    summary: `每日投加药剂 ${round2(w)} kg（投加浓度 ${opts.dosageMgL} mg/L）`,
  };
}

/**
 * 年运行电费估算
 * 费用 = 装机功率 × 运行系数 × 24 h × 365 d × 电价
 */
export function calcAnnualEnergyCost(opts: {
  totalPowerKw: number; // 总装机功率 kW
  runFactor?: number; // 运行系数（设备并非满负荷），默认 0.6
  pricePerKwh?: number; // 电价 元/kWh，默认 0.75
}): CalcOutcome {
  const rf = opts.runFactor ?? 0.6;
  const p = opts.pricePerKwh ?? 0.75;
  const cost = opts.totalPowerKw * rf * 24 * 365 * p;
  return {
    ok: true,
    value: Math.round(cost),
    unit: '元/年',
    steps: [
      { formula: '年电费 = P × 运行系数 × 24 × 365 × 电价', substitution: `年电费 = ${opts.totalPowerKw} × ${rf} × 24 × 365 × ${p}`, result: `年电费 ≈ ${Math.round(cost).toLocaleString()} 元` },
    ],
    summary: `年运行电费约 ${Math.round(cost).toLocaleString()} 元（按运行系数 ${rf}、电价 ${p} 元/kWh）`,
  };
}

// ============================================================================
// 完整设计计算书（供方案直接调用）
// ============================================================================

export interface EngineeringInput {
  flowM3d: number; // 处理量 m³/d
  ssMgL: number; // 进水悬浮物 mg/L
  codMgL: number; // 进水 COD mg/L
  processType?: string; // 工艺类型
}

export interface EngineeringDesign {
  input: EngineeringInput;
  hourlyFlow: CalcOutcome; // 小时平均流量 m³/h
  dailySludge: CalcOutcome; // 每日泥饼量
  filterArea: CalcOutcome; // 压滤机过滤面积
  pumpHead: CalcOutcome; // 提升泵扬程
  pumpPower: CalcOutcome; // 提升泵功率
  pipeDiameter: CalcOutcome; // 主管管径
  hrt: CalcOutcome; // 生化池停留时间
  aeration: CalcOutcome; // 曝气量
  pacDosage: CalcOutcome; // PAC 投加
  pamDosage: CalcOutcome; // PAM 投加
}

/**
 * 一站式工程设计计算：输入项目基本参数，输出全套设计数据（含推导过程）
 */
export function runEngineeringDesign(input: EngineeringInput): EngineeringDesign {
  const hourly = input.flowM3d / 24;
  const hq = { flowM3d: input.flowM3d, ssMgL: input.ssMgL, codMgL: input.codMgL, processType: input.processType };
  const qh = { flowM3d: input.flowM3d };

  const hourlyFlow: CalcOutcome = {
    ok: true,
    value: round2(hourly),
    unit: 'm³/h',
    steps: [
      { formula: 'Qh = Qd / 24', substitution: `Qh = ${input.flowM3d} / 24`, result: `Qh = ${round2(hourly)} m³/h` },
    ],
    summary: `小时平均流量 ${round2(hourly)} m³/h`,
  };

  const dailySludge = calcDailyDrySolids({ flowM3d: input.flowM3d, ssMgL: input.ssMgL, removalRate: 0.92, moisture: 0.6 });

  // 单批次干泥量（按 8 h 一批次）
  const dryPerBatch = ((input.flowM3d * input.ssMgL * 0.92) / 1000) * (8 / 24);
  const filterArea = calcFilterPressArea({ drySolidsKg: round2(dryPerBatch), cycleHours: 8, unitYield: 10, safety: 1.2 });

  const pumpHead = calcPumpHead({ staticHeadM: 8, pipeLengthM: 60, pipeDnMm: 80, flowM3h: round2(hourly), safety: 1.15 });
  const pumpPower = calcPumpPower({ flowM3h: round2(hourly), headM: pumpHead.value, efficiency: 0.6 });
  const pipeDiameter = calcPipeDiameter({ flowM3h: round2(hourly), velocityMS: 1.0 });

  // 生化池有效容积：取 HRT 12 h
  const hrt = calcHRT({ volumeM3: round2((input.flowM3d / 24) * 12), flowM3d: input.flowM3d });
  const aeration = calcAerationVolume({ flowM3d: input.flowM3d, coefficient: 0.025 });
  const pacDosage = calcDosage({ flowM3d: input.flowM3d, dosageMgL: 120, solutionConcPct: 10 });
  const pamDosage = calcDosage({ flowM3d: input.flowM3d, dosageMgL: 2, solutionConcPct: 0.1 });

  return {
    input: hq,
    hourlyFlow,
    dailySludge,
    filterArea,
    pumpHead,
    pumpPower,
    pipeDiameter,
    hrt,
    aeration,
    pacDosage,
    pamDosage,
  };
}
