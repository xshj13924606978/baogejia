/**
 * 差异化产品对比 — 通用版
 * 自动从 parameter_description 提取所有参数维度，动态对比
 */

import type { IntentProduct } from './intent-understanding';

// ═══════════════════════ 接口 ═══════════════════════

export interface ComparisonPoint {
  field: string;
  values: string[];
  highlight?: string;
}

export interface ComparisonResult {
  commonPoints: string[];
  differences: ComparisonPoint[];
  recommendation: string;
}

// ═══════════════════════ 通用参数提取 ═══════════════════════

/**
 * 从 parameter_description 提取所有「键：值」参数对
 * 返回 Map<string, string>，如 {"功率" => "5.5KW", "工作压力" => "0.8MPa"}
 */
function extractAllParams(text: string): Map<string, string> {
  const params = new Map<string, string>();
  if (!text) return params;
  const kvRegex = /([^，,、\n]+?)\s*[：:：]\s*([^，,、\n]+)/g;
  let match;
  while ((match = kvRegex.exec(text)) !== null) {
    const key = match[1].trim();
    const value = match[2].trim();
    if (key && value) params.set(key, value);
  }
  return params;
}

/**
 * 从值字符串中提取纯数值（如 "5.5KW" → 5.5, "380V" → 380）
 */
function extractNumber(value: string): number | null {
  if (!value) return null;
  const num = parseFloat(value.replace(/[^0-9.]/g, ''));
  return !isNaN(num) && num > 0 ? num : null;
}

/**
 * 判断参数是否为数值型（值中包含数字）
 */
function isNumericParam(value: string): boolean {
  return /\d/.test(value);
}

/**
 * 根据产品类型和实际数据，自动确定关键对比维度
 */
function getKeyParameters(productType: string, products: IntentProduct[]): string[] {
  // 收集所有产品中出现的参数名
  const allKeys = new Set<string>();
  for (const product of products) {
    const params = extractAllParams(product.parameterDescription);
    for (const key of params.keys()) {
      allKeys.add(key);
    }
  }

  // 根据产品类型的已知关键参数优先排序
  const priorityMap: Record<string, string[]> = {
    '空压机': ['排气量', '工作压力', '功率', '电压', '控制方式', '储气罐容量'],
    '压缩机': ['排气量', '工作压力', '功率', '电压', '控制方式'],
    '水泵': ['流量', '扬程', '功率', '电压', '进出口径'],
    '风机': ['风量', '风压', '功率', '电压', '转速'],
    '电机': ['功率', '电压', '转速', '电流'],
    '发电机': ['功率', '电压', '频率', '转速'],
  };

  // 匹配产品类型
  let priorityKeys: string[] = [];
  for (const [type, keys] of Object.entries(priorityMap)) {
    if (productType && productType.includes(type)) {
      priorityKeys = keys;
      break;
    }
  }

  // 排序：优先级的在前，其余按出现频率排序
  const sortedKeys = Array.from(allKeys).sort((a, b) => {
    const aIdx = priorityKeys.indexOf(a);
    const bIdx = priorityKeys.indexOf(b);
    if (aIdx >= 0 && bIdx >= 0) return aIdx - bIdx;
    if (aIdx >= 0) return -1;
    if (bIdx >= 0) return 1;
    return 0;
  });

  return sortedKeys;
}

// ═══════════════════════ 旧版参数提取（降级用） ═══════════════════════

interface ParsedParams {
  power?: number;
  pressure?: number;
  flowRate?: number;
  voltage?: string;
  controlType?: string;
  tankType?: string;
}

function parseProductParamsLegacy(product: IntentProduct): ParsedParams {
  const params: ParsedParams = {};
  const text = product.parameterDescription;

  const powerMatch = text.match(/功率[：:：]\s*(\d+(?:\.\d+)?)/i);
  if (powerMatch) params.power = parseFloat(powerMatch[1]);

  const pressureMatch = text.match(/工作压力[：:：]\s*(\d+(?:\.\d+)?)/i);
  if (pressureMatch) params.pressure = parseFloat(pressureMatch[1]);

  const flowMatch = text.match(/排气量[：:：]\s*(\d+(?:\.\d+)?)/i);
  if (flowMatch) params.flowRate = parseFloat(flowMatch[1]);

  const voltageMatch = text.match(/电压[：:：]\s*(\d+V|\d+伏|三相|单相)/i);
  if (voltageMatch) params.voltage = voltageMatch[1];

  const controlMatch = text.match(/(工频|永磁变频|变频)/i);
  if (controlMatch) params.controlType = controlMatch[1];

  const tankMatch = text.match(/(单储气罐|双储气罐|无储气罐)/i);
  if (tankMatch) params.tankType = tankMatch[1];

  return params;
}

// ═══════════════════════ 核心对比 ═══════════════════════

/**
 * 通用产品对比（新逻辑）：自动从 parameter_description 提取所有参数维度
 */
function generateComparisonGeneric(products: IntentProduct[], productType?: string): ComparisonResult {
  if (!products || !Array.isArray(products) || products.length < 2) {
    return { commonPoints: [], differences: [], recommendation: '需要至少2个产品才能进行对比。' };
  }

  const commonPoints: string[] = [];
  const differences: ComparisonPoint[] = [];

  // 提取所有产品的参数
  const allParams = products.map(p => ({
    product: p,
    params: extractAllParams(p.parameterDescription),
  }));

  // 1. 价格对比（最重要的差异点）
  const prices = products.map(p => p.minPrice || p.price);
  const minIdx = prices.indexOf(Math.min(...prices));
  const maxIdx = prices.indexOf(Math.max(...prices));
  const priceRange = Math.max(...prices) - Math.min(...prices);
  const maxPrice = Math.max(...prices);

  if (priceRange > 0 && maxPrice > 0) {
    const savingPercent = ((priceRange / maxPrice) * 100).toFixed(0);
    differences.push({
      field: '价格',
      values: products.map(p => `¥${(p.minPrice || p.price).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`),
      highlight: `${products[minIdx].name || '产品' + (minIdx + 1)} 比 ${products[maxIdx].name || '产品' + (maxIdx + 1)} 便宜 ${savingPercent}%`,
    });
  }

  // 2. 品牌对比
  const brands = products.map(p => p.brand || '未知');
  const uniqueBrands = new Set(brands);
  if (uniqueBrands.size > 1) {
    differences.push({ field: '品牌', values: brands });
  } else if (uniqueBrands.size === 1) {
    commonPoints.push(`品牌相同：${brands[0]}`);
  }

  // 3. 动态对比所有参数维度
  const keyParams = getKeyParameters(productType || '', products);
  for (const paramKey of keyParams) {
    const values = allParams.map(({ params }) => params.get(paramKey) || '-');
    const validValues = values.filter(v => v !== '-');
    const uniqueValues = new Set(validValues);

    if (uniqueValues.size <= 1) {
      // 相同参数 → 共同点
      if (validValues.length >= 2) {
        commonPoints.push(`${paramKey}相同：${validValues[0]}`);
      }
      continue;
    }

    // 数值型参数：生成差异高亮
    const numericValues = validValues.map(v => extractNumber(v)).filter((v): v is number => v != null);
    let highlight: string | undefined;

    if (numericValues.length >= 2) {
      const minVal = Math.min(...numericValues);
      const maxVal = Math.max(...numericValues);
      const minValIdx = values.findIndex(v => v !== '-' && extractNumber(v) === minVal);
      const maxValIdx = values.findIndex(v => v !== '-' && extractNumber(v) === maxVal);
      const unit = validValues[0]?.replace(/[\d.]/g, '').trim() || '';
      highlight = `${products[minValIdx >= 0 ? minValIdx : 0].name || '产品'}（${minVal}${unit}）更小，${products[maxValIdx >= 0 ? maxValIdx : 0].name || '产品'}（${maxVal}${unit}）更大`;
    }

    differences.push({ field: paramKey, values, highlight });
  }

  // 排序：价格 > 品牌 > 其余参数按出现顺序
  differences.sort((a, b) => {
    const order: Record<string, number> = { '价格': 0, '品牌': 1 };
    const aOrder = order[a.field] ?? 100;
    const bOrder = order[b.field] ?? 100;
    return aOrder - bOrder;
  });


  const recommendation = generateRecommendation(products, differences, commonPoints);
  return { commonPoints, differences, recommendation };
}

/**
 * 旧版产品对比（降级方案）
 */
function generateComparisonLegacy(products: IntentProduct[]): ComparisonResult {
  if (products.length < 2) {
    return { commonPoints: [], differences: [], recommendation: '需要至少2个产品才能进行对比。' };
  }

  const allParsed = products.map(p => ({ product: p, params: parseProductParamsLegacy(p) }));
  const commonPoints: string[] = [];
  const differences: ComparisonPoint[] = [];

  // 价格
  const prices = allParsed.map(({ product }) => product.minPrice || product.price);
  const minIdx = prices.indexOf(Math.min(...prices));
  const maxIdx = prices.indexOf(Math.max(...prices));
  const priceRange = Math.max(...prices) - Math.min(...prices);
  const maxPrice = Math.max(...prices);

  if (priceRange > 0 && maxPrice > 0) {
    const savingPercent = ((priceRange / maxPrice) * 100).toFixed(0);
    differences.push({
      field: '价格',
      values: products.map(p => `¥${(p.minPrice || p.price).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`),
      highlight: `${products[minIdx].name || '产品' + (minIdx + 1)} 比 ${products[maxIdx].name || '产品' + (maxIdx + 1)} 便宜 ${savingPercent}%`,
    });
  }

  // 品牌
  const brands = products.map(p => p.brand || '未知');
  const uniqueBrands = new Set(brands);
  if (uniqueBrands.size > 1) {
    differences.push({ field: '品牌', values: brands });
  } else if (uniqueBrands.size === 1) {
    commonPoints.push(`品牌相同：${brands[0]}`);
  }

  // 控制方式
  const controlTypes = allParsed.map(({ params }) => params.controlType || '未知');
  const hasGongpin = controlTypes.some(c => c === '工频');
  const hasBianpin = controlTypes.some(c => c.includes('变频'));
  if (hasGongpin && hasBianpin) {
    const gongpinIdx = controlTypes.indexOf('工频');
    const bianpinIdx = controlTypes.findIndex(c => c.includes('变频'));
    differences.push({
      field: '控制方式',
      values: controlTypes,
      highlight: `${products[bianpinIdx >= 0 ? bianpinIdx : 0].name || '变频产品'} 节能效果更好；${products[gongpinIdx >= 0 ? gongpinIdx : 0].name || '工频产品'} 经济实惠`,
    });
  }

  // 功率
  const powers = allParsed.map(({ params }) => params.power);
  const validPowers = powers.filter((p): p is number => p != null && p > 0);
  if (validPowers.length >= 2) {
    const minPower = Math.min(...validPowers);
    const maxPower = Math.max(...validPowers);
    if (minPower < maxPower) {
      const minPIdx = powers.indexOf(minPower);
      const maxPIdx = powers.indexOf(maxPower);
      differences.push({
        field: '功率',
        values: powers.map(p => p ? `${p}KW` : '-'),
        highlight: `${products[maxPIdx >= 0 ? maxPIdx : 0].name || '产品'} 动力更强（${maxPower}KW），${products[minPIdx >= 0 ? minPIdx : 0].name || '产品'} 更省电（${minPower}KW）`,
      });
    }
  }

  // 排气量
  const flowRates = allParsed.map(({ params }) => params.flowRate);
  const validFlows = flowRates.filter((f): f is number => f != null && f > 0);
  if (validFlows.length >= 2) {
    const minFlow = Math.min(...validFlows);
    const maxFlow = Math.max(...validFlows);
    if (minFlow < maxFlow) {
      differences.push({
        field: '排气量',
        values: flowRates.map(f => f ? `${f} m³/min` : '-'),
      });
    }
  }

  // 工作压力
  const pressures = allParsed.map(({ params }) => params.pressure);
  const validPressures = pressures.filter((p): p is number => p != null && p > 0);
  if (validPressures.length >= 2) {
    const uniquePressures = new Set(validPressures);
    if (uniquePressures.size > 1) {
      differences.push({
        field: '工作压力',
        values: pressures.map(p => p ? `${p} MPa` : '-'),
      });
    } else {
      commonPoints.push(`工作压力相同：${validPressures[0]} MPa`);
    }
  }

  // 电压
  const voltages = allParsed.map(({ params }) => params.voltage || '未知');
  const uniqueVoltages = new Set(voltages);
  if (uniqueVoltages.size > 1) {
    differences.push({ field: '电压', values: voltages });
  } else if (uniqueVoltages.size === 1 && voltages[0] !== '未知') {
    commonPoints.push(`电压相同：${voltages[0]}`);
  }

  const fieldOrder = ['价格', '品牌', '控制方式', '功率', '排气量', '工作压力', '电压'];
  differences.sort((a, b) => fieldOrder.indexOf(a.field) - fieldOrder.indexOf(b.field));

  const recommendation = generateRecommendation(products, differences, commonPoints);
  return { commonPoints, differences, recommendation };
}

// ═══════════════════════ 统一入口 ═══════════════════════

/**
 * 生成产品对比（带降级开关）
 */
export function generateComparison(products: IntentProduct[], productType?: string): ComparisonResult {
  const useDynamic = process.env.ENABLE_DYNAMIC_COMPARISON !== 'false';
  if (useDynamic) {
    return generateComparisonGeneric(products, productType);
  }
  return generateComparisonLegacy(products);
}

/**
 * 生成推荐文本（通用版）
 */
function generateRecommendation(
  products: IntentProduct[],
  differences: ComparisonPoint[],
  commonPoints: string[]
): string {
  if (differences.length === 0) {
    return `${products.map(p => p.name || p.model).join(' 和 ')} 参数基本一致，可根据价格偏好选择。`;
  }

  // 价格推荐
  const priceDiff = differences.find(d => d.field === '价格');
  // 数值型参数推荐（找差异最大的）
  const numericDiffs = differences.filter(d => d.field !== '价格' && d.field !== '品牌' && d.highlight);

  const parts: string[] = [];
  if (priceDiff?.highlight) parts.push(priceDiff.highlight);
  if (numericDiffs.length > 0) parts.push(numericDiffs[0].highlight!);

  if (parts.length > 0) {
    return parts.join('；') + '。';
  }

  return `以上产品各有特点，请根据实际使用场景选择。`;
}

/**
 * 将对比结果格式化为 Markdown（通用版，动态表头）
 */
export function formatComparisonAsMarkdown(result: ComparisonResult): string {
  if (result.differences.length === 0 && result.commonPoints.length === 0) {
    return result.recommendation;
  }

  let md = '';

  // 差异点（动态列）
  if (result.differences.length > 0) {
    md += `**产品差异：**\n\n`;
    md += `| 对比项 | ${result.differences[0].values.map((_, i) => `产品${i + 1}`).join(' | ')} |\n`;
    md += `|:---|${result.differences[0].values.map(() => ':---').join('|')}|\n`;

    for (const diff of result.differences) {
      md += `| ${diff.field} | ${diff.values.join(' | ')} |\n`;
      if (diff.highlight) {
        md += `| ↳ 说明 |${diff.values.map(() => '').join('|')} ${diff.highlight} |\n`;
      }
    }
    md += '\n';
  }

  // 共同点
  if (result.commonPoints.length > 0) {
    md += `**共同点：** ${result.commonPoints.join('；')}\n\n`;
  }

  // 推荐
  md += `**推荐：** ${result.recommendation}\n`;

  return md;
}

/**
 * 导出通用参数提取函数（供其他模块复用）
 */
export { extractAllParams, extractNumber, isNumericParam, getKeyParameters };
