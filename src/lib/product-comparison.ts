/**
 * 差异化产品对比 — 突出差异点而非平铺字段
 */

import type { IntentProduct } from './intent-understanding';

// ═══════════════════════ 接口 ═══════════════════════

export interface ComparisonPoint {
  field: string;
  values: string[];
  highlight?: string; // 差异描述，如 "产品A便宜24%"
}

export interface ComparisonResult {
  commonPoints: string[];
  differences: ComparisonPoint[];
  recommendation: string;
}

// ═══════════════════════ 参数提取 ═══════════════════════

interface ParsedParams {
  power?: number;
  pressure?: number;
  flowRate?: number;
  voltage?: string;
  controlType?: string;
  tankType?: string;
}

function parseProductParams(product: IntentProduct): ParsedParams {
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

export function generateComparison(products: IntentProduct[]): ComparisonResult {
  if (products.length < 2) {
    return {
      commonPoints: [],
      differences: [],
      recommendation: '需要至少2个产品才能进行对比。',
    };
  }

  const allParsed = products.map(p => ({ product: p, params: parseProductParams(p) }));
  const commonPoints: string[] = [];
  const differences: ComparisonPoint[] = [];

  // 1. 价格对比（最重要的差异点）
  const prices = allParsed.map(({ product }) => product.minPrice || product.price);
  const minIdx = prices.indexOf(Math.min(...prices));
  const maxIdx = prices.indexOf(Math.max(...prices));
  const priceRange = Math.max(...prices) - Math.min(...prices);
  const maxPrice = Math.max(...prices);

  if (priceRange > 0 && maxPrice > 0) {
    const savingPercent = ((priceRange / maxPrice) * 100).toFixed(0);
    differences.push({
      field: '价格',
      values: products.map((p, i) => `¥${(p.minPrice || p.price).toLocaleString('zh-CN', { minimumFractionDigits: 2 })}`),
      highlight: `${products[minIdx].name || '产品' + (minIdx + 1)} 比 ${products[maxIdx].name || '产品' + (maxIdx + 1)} 便宜 ${savingPercent}%`,
    });
  }

  // 2. 品牌
  const brands = products.map(p => p.brand || '未知');
  const uniqueBrands = new Set(brands);
  if (uniqueBrands.size > 1) {
    differences.push({
      field: '品牌',
      values: brands,
    });
  } else if (uniqueBrands.size === 1) {
    commonPoints.push(`品牌相同：${brands[0]}`);
  }

  // 3. 控制方式（工频 vs 变频）
  const controlTypes = allParsed.map(({ params }) => params.controlType || '未知');
  const hasGongpin = controlTypes.some(c => c === '工频');
  const hasBianpin = controlTypes.some(c => c.includes('变频'));
  if (hasGongpin && hasBianpin) {
    const gongpinIdx = controlTypes.indexOf('工频');
    const bianpinIdx = controlTypes.findIndex(c => c.includes('变频'));
    differences.push({
      field: '控制方式',
      values: controlTypes,
      highlight: `${products[bianpinIdx >= 0 ? bianpinIdx : 0].name || '变频产品'} 节能效果更好，适合长时间运行；${products[gongpinIdx >= 0 ? gongpinIdx : 0].name || '工频产品'} 经济实惠，适合间歇性使用`,
    });
  }

  // 4. 功率
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

  // 5. 排气量
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

  // 6. 工作压力
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

  // 7. 电压
  const voltages = allParsed.map(({ params }) => params.voltage || '未知');
  const uniqueVoltages = new Set(voltages);
  if (uniqueVoltages.size > 1) {
    differences.push({
      field: '电压',
      values: voltages,
    });
  } else if (uniqueVoltages.size === 1 && voltages[0] !== '未知') {
    commonPoints.push(`电压相同：${voltages[0]}`);
  }

  // 排序：价格 > 控制方式 > 功率 > 排气量 > 压力 > 品牌 > 电压
  const fieldOrder = ['价格', '品牌', '控制方式', '功率', '排气量', '工作压力', '电压'];
  differences.sort((a, b) => fieldOrder.indexOf(a.field) - fieldOrder.indexOf(b.field));

  // 生成推荐
  const recommendation = generateRecommendation(products, differences, commonPoints);

  return { commonPoints, differences, recommendation };
}

function generateRecommendation(
  products: IntentProduct[],
  differences: ComparisonPoint[],
  commonPoints: string[]
): string {
  if (differences.length === 0) {
    return `${products.map(p => p.name || p.model).join(' 和 ')} 参数基本一致，可根据价格偏好选择。`;
  }

  const cheapest = differences.find(d => d.field === '价格')?.highlight;
  const energySaving = differences.find(d => d.field === '控制方式')?.highlight;
  const morePower = differences.find(d => d.field === '功率')?.highlight;

  const parts: string[] = [];
  if (cheapest) parts.push(cheapest);
  if (energySaving) parts.push(energySaving);
  if (morePower) parts.push(morePower);

  if (parts.length > 0) {
    return parts.join('；') + '。';
  }

  return `以上产品各有特点，请根据实际使用场景选择。`;
}

/**
 * 将对比结果格式化为 Markdown
 */
export function formatComparisonAsMarkdown(result: ComparisonResult): string {
  if (result.differences.length === 0 && result.commonPoints.length === 0) {
    return result.recommendation;
  }

  let md = '';

  // 差异点
  if (result.differences.length > 0) {
    md += `**产品差异：**\n\n`;
    md += `| 对比项 | ${result.differences[0].values.map((_, i) => `产品${i + 1}`).join(' | ')} |\n`;
    md += `|:---|${result.differences[0].values.map(() => ':---').join('|')}|\n`;

    for (const diff of result.differences) {
      const highlight = diff.highlight ? ` *${diff.highlight}*` : '';
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
