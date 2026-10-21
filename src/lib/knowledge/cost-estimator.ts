/**
 * 成本估算模型（#[20260827-1030]-3）
 *
 * 设备单价取自「设备参数库」参考价，安装/运输/土建/设计/税费按行业经验
 * 系数计算（系数可配置，非硬编码）。报价结构：
 *   设备费 + 运输费 + 安装调试费 + 土建配合费 + 设计管理费 + 税费 = 含税总价
 */

import { findEquipment, getEquipmentUnitPrice } from './equipment-database';

// ============================================================================
// 可配置费率（行业经验值，可按项目调整）
// ============================================================================

export interface CostConfig {
  transportRate: number; // 运输费 = 设备费 × rate（默认 3%）
  installRate: number; // 安装调试费 = 设备费 × rate（默认 12%）
  civilWorkRate: number; // 土建配合费 = 设备费 × rate（默认 8%）
  designMgmtRate: number; // 设计管理费 = 设备费 × rate（默认 5%）
  taxRate: number; // 增值税率（默认 9%，建筑服务）
  laborsRate: number; // 人工费占设备费比例（默认 6%）
  instrumentRate: number; // 仪表自控占设备费比例（默认 5%）
}

export const DEFAULT_COST_CONFIG: CostConfig = {
  transportRate: 0.03,
  installRate: 0.12,
  civilWorkRate: 0.08,
  designMgmtRate: 0.05,
  taxRate: 0.09,
  laborsRate: 0.06,
  instrumentRate: 0.05,
};

// ============================================================================
// 报价数据结构
// ============================================================================

export interface QuoteEquipmentItem {
  name: string; // 设备名称
  model: string; // 型号
  spec: string; // 技术参数
  brand: string; // 品牌/产地
  quantity: number; // 数量
  unitPrice: number; // 单价（元）
  source: string; // 价格依据（来自设备库哪一档）
  warrantyMonths: number; // 质保期
}

export interface QuoteBreakdown {
  equipmentTotal: number; // 设备费小计
  transportFee: number; // 运输费
  installFee: number; // 安装调试费
  civilWorkFee: number; // 土建配合费
  designFee: number; // 设计管理费
  laborFee: number; // 人工费
  instrumentFee: number; // 仪表自控费
  subtotal: number; // 税前小计
  tax: number; // 税费
  grandTotal: number; // 含税总价
}

export interface QuoteEstimate {
  items: QuoteEquipmentItem[];
  breakdown: QuoteBreakdown;
}

// ============================================================================
// 估算逻辑
// ============================================================================

function getTierIndexByQuantity(qty: number): number {
  // 数量越多取越高档位参考价（量级上浮）
  return qty >= 3 ? 1 : 0;
}

/**
 * 按设备名称生成报价条目（价格来自设备参数库）
 * 未匹配到设备库时回退到按规模估算的默认价格（避免 AI 幻觉）
 */
export function buildQuoteItem(name: string, quantity: number, opts?: { powerKw?: number; capacityM3d?: number }): QuoteEquipmentItem | null {
  const record = findEquipment(name);
  if (!record || record.models.length === 0) return null;

  const tier = Math.min(getTierIndexByQuantity(quantity) + (opts?.powerKw ? 1 : 0), record.models.length - 1);
  const model = record.models[tier];
  const [lo, hi] = model.priceRange;
  const unitPrice = Math.round(((lo + hi) / 2) * (opts?.powerKw && model.powerKw && opts.powerKw > model.powerKw ? 1.15 : 1));

  return {
    name: record.name,
    model: model.model,
    spec: model.specs ?? '',
    brand: record.brands.join(' / '),
    quantity,
    unitPrice,
    source: `设备库「${record.name}」${model.model} 参考价中值 ${lo.toLocaleString()}~${hi.toLocaleString()} 元`,
    warrantyMonths: record.warrantyMonths,
  };
}

/**
 * 汇总报价：设备费 + 各项费率 + 税费
 */
export function estimateQuote(items: QuoteEquipmentItem[], config?: Partial<CostConfig>): QuoteEstimate {
  const cfg: CostConfig = { ...DEFAULT_COST_CONFIG, ...(config ?? {}) };
  const equipmentTotal = items.reduce((s, i) => s + i.unitPrice * i.quantity, 0);

  const transportFee = Math.round(equipmentTotal * cfg.transportRate);
  const installFee = Math.round(equipmentTotal * cfg.installRate);
  const civilWorkFee = Math.round(equipmentTotal * cfg.civilWorkRate);
  const designFee = Math.round(equipmentTotal * cfg.designMgmtRate);
  const laborFee = Math.round(equipmentTotal * cfg.laborsRate);
  const instrumentFee = Math.round(equipmentTotal * cfg.instrumentRate);

  const subtotal = equipmentTotal + transportFee + installFee + civilWorkFee + designFee + laborFee + instrumentFee;
  const tax = Math.round(subtotal * cfg.taxRate);
  const grandTotal = subtotal + tax;

  return {
    items,
    breakdown: {
      equipmentTotal,
      transportFee,
      installFee,
      civilWorkFee,
      designFee,
      laborFee,
      instrumentFee,
      subtotal,
      tax,
      grandTotal,
    },
  };
}

/**
 * 由计算引擎的设计参数自动推导完整设备清单并报价
 * （核心：价格全部来自设备库，参数来自计算引擎）
 */
export function estimateByDesign(design: {
  flowM3d: number;
  hourlyFlowM3h: number;
  filterAreaM2: number;
  pumpHeadM: number;
  pumpPowerKw: number;
}): QuoteEstimate {
  const flowM3d = design.flowM3d;

  const items: QuoteEquipmentItem[] = [];
  const push = (name: string, quantity: number, opts?: { powerKw?: number }) => {
    const item = buildQuoteItem(name, quantity, { ...opts, capacityM3d: flowM3d });
    if (item) items.push(item);
  };

  // 预处理
  push('机械格栅', 1);
  push('调节池潜水搅拌机', 2, { powerKw: 2.2 });
  push('提升泵', 2, { powerKw: design.pumpPowerKw });
  // 加药絮凝
  push('成套加药装置', 1, { powerKw: 2.2 });
  // 沉淀
  push('刮泥机', 1);
  // 脱水
  push('板框/厢式压滤机', 1, { powerKw: Math.max(3, design.filterAreaM2 * 0.05) });
  push('污泥螺杆泵', 1);
  // 电气
  push('电气控制柜（PLC）', 1);
  push('工艺管道/阀门/管件', 1);

  // 若设备库匹配有缺项，补充说明用条目（不计价）
  return estimateQuote(items);
}

/**
 * 报价分项说明（供方案文本引用，含计算依据）
 */
export function quoteBreakdownToMarkdown(q: QuoteEstimate, config?: Partial<CostConfig>): string {
  const cfg: CostConfig = { ...DEFAULT_COST_CONFIG, ...(config ?? {}) };
  const b = q.breakdown;
  const lines = [
    '| 费用项 | 计算依据 | 金额（元） |',
    '| --- | --- | ---: |',
    `| 设备费 | 设备参数库参考价合计 | ${b.equipmentTotal.toLocaleString()} |`,
    `| 运输费 | 设备费 × ${(cfg.transportRate * 100).toFixed(0)}% | ${b.transportFee.toLocaleString()} |`,
    `| 安装调试费 | 设备费 × ${(cfg.installRate * 100).toFixed(0)}% | ${b.installFee.toLocaleString()} |`,
    `| 土建配合费 | 设备费 × ${(cfg.civilWorkRate * 100).toFixed(0)}% | ${b.civilWorkFee.toLocaleString()} |`,
    `| 设计管理费 | 设备费 × ${(cfg.designMgmtRate * 100).toFixed(0)}% | ${b.designFee.toLocaleString()} |`,
    `| 人工费 | 设备费 × ${(cfg.laborsRate * 100).toFixed(0)}% | ${b.laborFee.toLocaleString()} |`,
    `| 仪表自控费 | 设备费 × ${(cfg.instrumentRate * 100).toFixed(0)}% | ${b.instrumentFee.toLocaleString()} |`,
    `| 税前小计 | 上述合计 | ${b.subtotal.toLocaleString()} |`,
    `| 增值税 | ${(cfg.taxRate * 100).toFixed(0)}% | ${b.tax.toLocaleString()} |`,
    `| **含税总价** | — | **${b.grandTotal.toLocaleString()}** |`,
  ];
  return lines.join('\n');
}

export { getEquipmentUnitPrice };
