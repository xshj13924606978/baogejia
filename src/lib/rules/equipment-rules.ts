/**
 * 设备选型规则引擎（#[20260827-1030]-6 第一层：专家规则层）
 *
 * 确定性规则，不依赖任何外部资料/API：处理量(t/d) → 设备规格 → 参考价格。
 * 价格以"规则估算（内置经验值）"为兜底基线（标注 rule_estimate），
 * 实际定价由 price-resolver 按决策链路覆盖：
 *   ①产品价格库 → ②定额库 → ③联网搜索 → ④规则估算
 * 规则层仅输出基线价（设备库参考价/内置规则价），并标注"估算价，待核实"。
 */

import { findEquipment, type EquipmentModelSpec } from '../knowledge/equipment-database';
import type { PriceSource } from '../data/price-resolver';

/**
 * 从设备库中按面积/规格匹配最接近档位，返回区间中值价
 * @param keyword 设备关键词
 * @param targetArea 目标面积（m²），用于压滤机等面积分档设备
 * @param fallback 内置规则价
 */
function pickModelPriceByArea(keyword: string, targetArea: number, fallback: number): { price: number; modelName?: string; detail: string } {
  const kb = findEquipment(keyword);
  if (!kb || kb.models.length === 0) return { price: fallback, detail: '规则内置参考价' };
  let best: EquipmentModelSpec | null = null;
  let bestDiff = Infinity;
  for (const m of kb.models) {
    const areaMatch = (m.specs ?? '').match(/面积\s*(\d+(?:\.\d+)?)\s*m²/) ?? m.model.match(/\((\d+)\s*m²\)/);
    if (!areaMatch) continue;
    const area = parseFloat(areaMatch[1]);
    const diff = Math.abs(area - targetArea);
    if (diff < bestDiff) {
      bestDiff = diff;
      best = m;
    }
  }
  if (!best) return { price: fallback, detail: '规则内置参考价' };
  return {
    price: Math.round((best.priceRange[0] + best.priceRange[1]) / 2),
    modelName: best.model,
    detail: `设备库「${keyword}」${best.model} 参考价中值（区间 ${best.priceRange[0].toLocaleString()}~${best.priceRange[1].toLocaleString()} 元）`,
  };
}

/** 通用：取设备库第一个档位的区间中值价 */
function pickModelPriceMid(keyword: string, fallback: number): { price: number; modelName?: string; detail: string } {
  const kb = findEquipment(keyword);
  const m = kb?.models?.[0];
  if (!m) return { price: fallback, detail: '规则内置参考价' };
  return {
    price: Math.round((m.priceRange[0] + m.priceRange[1]) / 2),
    modelName: m.model,
    detail: `设备库「${keyword}」${m.model} 参考价中值（区间 ${m.priceRange[0].toLocaleString()}~${m.priceRange[1].toLocaleString()} 元）`,
  };
}

export interface SelectedEquipment {
  name: string; // 设备名称
  model: string; // 型号
  specs: string; // 技术参数
  quantity: number; // 数量
  unitPrice: number; // 单价（元）
  powerKw?: number; // 功率
  priceSource: PriceSource; // 价格来源（rule_estimate=规则估算兜底；其余由价格解析器覆盖）
  /** 价格依据说明（来源详情，由价格解析器填充） */
  priceDetail?: string;
  remark?: string;
}

/** 价格缩放因子（环境变量 EQUIPMENT_PRICE_FACTOR，默认 1.0） */
export function getPriceFactor(): number {
  const raw = process.env.EQUIPMENT_PRICE_FACTOR;
  const n = raw ? Number(raw) : NaN;
  return Number.isFinite(n) && n > 0 ? n : 1.0;
}

// ============================================================================
// 确定性选型表（内置规则，口径与 knowledge/equipment-database 参考价一致）
// ============================================================================

interface PressRule {
  maxTd: number; // 日处理量上限 (t/d)
  area: number; // 过滤面积 (m²)
  model: string; // 型号
  powerKw: number;
  plate: string; // 滤板规格
  price: number; // 规则参考价（元）
}

/** 压滤机选型：按日处理量（干泥/高浊度泥浆水，含固率按经验折算） */
const FILTER_PRESS_RULES: PressRule[] = [
  { maxTd: 20, area: 30, model: 'XMY30/800-UB', powerKw: 3, plate: '800×800', price: 38000 },
  { maxTd: 50, area: 60, model: 'XMY60/900-UB', powerKw: 4, plate: '900×900', price: 58000 },
  { maxTd: 100, area: 100, model: 'XMY100/1000-UB', powerKw: 5.5, plate: '1000×1000', price: 85000 },
  { maxTd: 200, area: 150, model: 'XMY150/1250-UB', powerKw: 7.5, plate: '1250×1250', price: 120000 },
  { maxTd: 300, area: 200, model: 'XMY200/1250-UB', powerKw: 11, plate: '1250×1250', price: 160000 },
  { maxTd: Number.POSITIVE_INFINITY, area: 300, model: 'XMY300/1500-UB', powerKw: 15, plate: '1500×1500', price: 220000 },
];

export function selectFilterPress(capacityTd: number) {
  const rule = FILTER_PRESS_RULES.find((r) => capacityTd <= r.maxTd) ?? FILTER_PRESS_RULES[FILTER_PRESS_RULES.length - 1];
  const priced = pickModelPriceByArea('板框/厢式压滤机', rule.area, rule.price);
  return {
    area: rule.area,
    model: rule.model,
    plate: rule.plate,
    powerKw: rule.powerKw,
    quantity: 1,
    unitPrice: priced.price,
    priceSource: 'rule_estimate' as const,
    priceDetail: priced.detail,
    remark: `按处理量 ${capacityTd} t/d 选型，过滤面积 ${rule.area} m²`,
  };
}

interface PumpRule {
  maxTd: number;
  flow: number; // m³/h
  head: number; // m
  powerKw: number;
  price: number;
}

/** 进料泵（螺杆泵）选型：按处理量 */
const FEED_PUMP_RULES: PumpRule[] = [
  { maxTd: 20, flow: 10, head: 40, powerKw: 5.5, price: 4500 },
  { maxTd: 50, flow: 15, head: 50, powerKw: 7.5, price: 6800 },
  { maxTd: 100, flow: 25, head: 60, powerKw: 11, price: 12000 },
  { maxTd: 200, flow: 35, head: 70, powerKw: 15, price: 18000 },
  { maxTd: Number.POSITIVE_INFINITY, flow: 50, head: 80, powerKw: 22, price: 28000 },
];

export function selectFeedPump(capacityTd: number) {
  const rule = FEED_PUMP_RULES.find((r) => capacityTd <= r.maxTd) ?? FEED_PUMP_RULES[FEED_PUMP_RULES.length - 1];
  const priced = pickModelPriceMid('污泥螺杆泵', rule.price);
  return {
    model: `G50-${rule.flow}${rule.head}`,
    specs: `流量 ${rule.flow} m³/h，扬程 ${rule.head} m`,
    flow: rule.flow,
    head: rule.head,
    powerKw: rule.powerKw,
    quantity: 2, // 一用一备
    unitPrice: priced.price,
    priceSource: 'rule_estimate' as const,
    priceDetail: priced.detail,
    remark: `按处理量 ${capacityTd} t/d 选型，一用一备`,
  };
}

/** 加药装置选型（PAC/PAM 成套） */
export function selectDosingUnit(capacityTd: number) {
  const size = capacityTd <= 50 ? 500 : capacityTd <= 200 ? 1000 : 2000;
  const priced = pickModelPriceMid('成套加药装置', 12000);
  return {
    model: `JY-${size}`,
    specs: `有效容积 ${size} L，PAC/PAM 双罐双泵`,
    powerKw: 2.2,
    quantity: 1,
    unitPrice: priced.price,
    priceSource: 'rule_estimate' as const,
    priceDetail: priced.detail,
    remark: `按处理量 ${capacityTd} t/d 选型`,
  };
}

/** 潜水搅拌机选型（调节池/絮凝池） */
export function selectSubmersibleMixer(capacityTd: number) {
  const powerKw = capacityTd <= 50 ? 2.2 : capacityTd <= 200 ? 4 : 7.5;
  const qty = capacityTd <= 100 ? 2 : 3;
  const priced = pickModelPriceMid('调节池潜水搅拌机', 8000);
  return {
    model: `QJB${powerKw}/8`,
    specs: `功率 ${powerKw} kW，转速 740 r/min`,
    powerKw,
    quantity: qty,
    unitPrice: priced.price,
    priceSource: 'rule_estimate' as const,
    priceDetail: priced.detail,
    remark: `调节池/絮凝池搅拌，按池容配置 ${qty} 台`,
  };
}

/** 罗茨鼓风机选型（生化曝气，按气水比） */
export function selectBlower(capacityTd: number) {
  const air = Math.ceil(capacityTd * 0.025); // m³/min，气水比经验值
  const powerKw = air <= 1.5 ? 3 : air <= 3 ? 5.5 : 7.5;
  const priced = pickModelPriceMid('罗茨鼓风机', 15000);
  return {
    model: `SSR-${Math.max(50, air * 60)}`,
    specs: `风量 ${air} m³/min，风压 39.2 kPa`,
    powerKw,
    quantity: 2,
    unitPrice: priced.price,
    priceSource: 'rule_estimate' as const,
    priceDetail: priced.detail,
    remark: `按气水比 0.025 选型，一用一备`,
  };
}

// ============================================================================
// 配套关系规则：主机 → 自动生成配套清单
// ============================================================================

export interface SupportingItems {
  platform: SelectedEquipment;
  piping: SelectedEquipment;
  control: SelectedEquipment;
}

export function generateSupporting(area: number): SupportingItems {
  const small = area <= 60;
  const control = pickModelPriceMid('电气控制柜（PLC）', small ? 8500 : 12000);
  const piping = pickModelPriceMid('工艺管道/阀门/管件', small ? 5000 : 8000);
  return {
    platform: {
      name: '操作平台（钢制）',
      model: small ? 'PT-2000' : 'PT-3500',
      specs: `钢结构平台，含护栏爬梯${small ? '' : '，防滑格栅'}，承重 300 kg/m²`,
      quantity: 1,
      unitPrice: small ? 12000 : 18000,
      priceSource: 'rule_estimate' as const,
      remark: `按过滤面积 ${area} m² 配置（规则估算价，待核实）`,
    },
    piping: {
      name: '工艺管道/阀门/管件',
      model: 'UPVC/碳钢',
      specs: '进料/出水/回流管线及配套阀门仪表',
      quantity: 1,
      unitPrice: piping.price,
      priceSource: 'rule_estimate' as const,
      remark: piping.detail,
    },
    control: {
      name: '电气控制柜（PLC）',
      model: 'PLC 自控',
      specs: '全自动控制，含液位/压力联锁，远程监控接口',
      quantity: 1,
      unitPrice: control.price,
      priceSource: 'rule_estimate' as const,
      remark: control.detail,
    },
  };
}

// ============================================================================
// 完整设备清单（规则层一键生成）
// ============================================================================

export interface EquipmentSelectionResult {
  items: SelectedEquipment[];
  equipmentTotal: number; // 设备费小计（元）
  note: string; // 选型依据说明
}

/**
 * 按处理量与工艺类型生成完整设备清单（纯规则，不依赖 AI）
 * @param capacityTd 处理量（t/d）
 * @param processType 工艺类型（含"生化/AO/MBR"等则附带曝气设备）
 */
export function selectAllEquipment(capacityTd: number, processType?: string): EquipmentSelectionResult {
  const factor = getPriceFactor();
  const applyFactor = (e: SelectedEquipment): SelectedEquipment => ({ ...e, unitPrice: Math.round(e.unitPrice * factor) });
  // 合并价格依据说明
  const withDetail = (e: SelectedEquipment & { priceDetail?: string }): SelectedEquipment => ({
    ...e,
    remark: [e.remark, e.priceDetail].filter(Boolean).join('；'),
  });

  const items: SelectedEquipment[] = [];
  const press = selectFilterPress(capacityTd);
  items.push(
    applyFactor(
      withDetail({
        name: '板框/厢式压滤机',
        model: press.model,
        specs: `过滤面积 ${press.area} m²，滤板 ${press.plate}，自动拉板`,
        quantity: press.quantity,
        unitPrice: press.unitPrice,
        powerKw: press.powerKw,
        priceSource: press.priceSource,
        remark: press.remark,
        priceDetail: press.priceDetail,
      })
    )
  );
  const pump = selectFeedPump(capacityTd);
  items.push(
    applyFactor(
      withDetail({
        name: '污泥螺杆泵',
        model: pump.model,
        specs: pump.specs,
        quantity: pump.quantity,
        unitPrice: pump.unitPrice,
        powerKw: pump.powerKw,
        priceSource: pump.priceSource,
        remark: pump.remark,
        priceDetail: pump.priceDetail,
      })
    )
  );
  const dosing = selectDosingUnit(capacityTd);
  items.push(
    applyFactor(
      withDetail({
        name: '成套加药装置',
        model: dosing.model,
        specs: dosing.specs,
        quantity: dosing.quantity,
        unitPrice: dosing.unitPrice,
        powerKw: dosing.powerKw,
        priceSource: dosing.priceSource,
        remark: dosing.remark,
        priceDetail: dosing.priceDetail,
      })
    )
  );
  const mixer = selectSubmersibleMixer(capacityTd);
  items.push(
    applyFactor(
      withDetail({
        name: '调节池潜水搅拌机',
        model: mixer.model,
        specs: mixer.specs,
        quantity: mixer.quantity,
        unitPrice: mixer.unitPrice,
        powerKw: mixer.powerKw,
        priceSource: mixer.priceSource,
        remark: mixer.remark,
        priceDetail: mixer.priceDetail,
      })
    )
  );
  // 生化工艺附带曝气
  if (processType && /(生化|AO|MBR|SBR|A2O|脱氮|除磷|曝气)/i.test(processType)) {
    const blower = selectBlower(capacityTd);
    items.push(
      applyFactor(
        withDetail({
          name: '罗茨鼓风机',
          model: blower.model,
          specs: blower.specs,
          quantity: blower.quantity,
          unitPrice: blower.unitPrice,
          powerKw: blower.powerKw,
          priceSource: blower.priceSource,
          remark: blower.remark,
          priceDetail: blower.priceDetail,
        })
      )
    );
  }
  // 配套
  const supporting = generateSupporting(press.area);
  items.push(applyFactor(supporting.platform), applyFactor(supporting.piping), applyFactor(supporting.control));

  const equipmentTotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);
  return {
    items,
    equipmentTotal,
    note: `设备选型依据处理量 ${capacityTd} t/d 与工艺类型${processType || '（未指定，按物化）'}，由专家规则层自动匹配；单价为参考价（口径：预算价），来源标注于各条目。`,
  };
}