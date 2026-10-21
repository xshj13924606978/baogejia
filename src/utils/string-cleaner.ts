/**
 * 字符串清洗工具
 * 用于清洗参数描述中的冗余信息
 */

/**
 * 清洗参数描述中的冗余信息
 * - 移除重复的型号信息
 * - 移除尾部的无意义数字组合
 * - 规范化单位格式
 *
 * @example
 * cleanParameterDescription('φ4000×3000mm套3 2搅拌罐不锈钢材质') // 'φ4000×3000mm搅拌罐不锈钢材质'
 * cleanParameterDescription('处理量50吨/天 套3 2') // '处理量50吨/天'
 *
 * @param text - 原始参数描述
 * @returns 清洗后的参数描述
 */
export function cleanParameterDescription(text: string): string {
  if (!text) return '';

  const original = text;
  let cleaned = text;


  // 1. 移除 "套X X" 模式（如 "套3 2"、"套 3 2"、"套：3 2"）
  const beforeSetRemoval = cleaned;
  cleaned = cleaned.replace(/\s*套[：:：]?\s*\d+\s*\d+/g, '');
  cleaned = cleaned.replace(/\s*套\d+\s*(?!\d)/g, '');
  if (beforeSetRemoval !== cleaned) {
  }

  // 2. 提取所有尺寸规格（φ4000×3000、φ4000×3000mm 等），比较数值去除重复
  const allSizeMatches: Array<{ text: string; value: string; start: number; end: number }> = [];
  
  // 匹配所有可能的尺寸格式（mm单位可选）
  // 修正：mm? 改为 (mm)?，使整个mm单位都是可选的
  const sizeRegex = /φ\s*(\d+)[xX×](\d+)(mm)?\b/g;
  let match;
  while ((match = sizeRegex.exec(cleaned)) !== null) {
    const value = `${match[1]}×${match[2]}`; // 标准化：4000×3000
    allSizeMatches.push({
      text: match[0],          // 原始匹配文本：φ4000×3000mm
      value: value,            // 数值：4000×3000
      start: match.index,
      end: match.index + match[0].length
    });
  }


  // 如果有重复的尺寸值，移除后续重复的
  if (allSizeMatches.length > 1) {
    const seenValues = new Set<string>();
    const toRemove: Array<{ start: number; end: number }> = [];

    for (const sizeMatch of allSizeMatches) {
      if (seenValues.has(sizeMatch.value)) {
        toRemove.push({ start: sizeMatch.start, end: sizeMatch.end });
      } else {
        seenValues.add(sizeMatch.value);
      }
    }

    // 从后往前删除，避免索引偏移
    for (const remove of toRemove.reverse()) {
      const before = cleaned;
      cleaned = cleaned.substring(0, remove.start) + cleaned.substring(remove.end);
    }
  }

  // 3. 移除重复的功率信息
  // 匹配所有功率：11kW、5.5kW、11千瓦、5.5千瓦
  const allPowerMatches: Array<{ text: string; value: number; start: number; end: number }> = [];
  const powerRegex = /(\d+(?:\.\d+)?)\s*(kW|千瓦)/gi;
  
  let powerMatch;
  while ((powerMatch = powerRegex.exec(cleaned)) !== null) {
    const value = parseFloat(powerMatch[1]);
    allPowerMatches.push({
      text: powerMatch[0],
      value: value,
      start: powerMatch.index,
      end: powerMatch.index + powerMatch[0].length
    });
  }


  // 如果有重复的功率值，移除后续重复的
  if (allPowerMatches.length > 1) {
    const seenPowerValues = new Set<number>();
    const powerToRemove: Array<{ start: number; end: number }> = [];

    for (const powerMatch of allPowerMatches) {
      if (seenPowerValues.has(powerMatch.value)) {
        powerToRemove.push({ start: powerMatch.start, end: powerMatch.end });
      } else {
        seenPowerValues.add(powerMatch.value);
      }
    }

    // 从后往前删除，避免索引偏移
    for (const remove of powerToRemove.reverse()) {
      const before = cleaned;
      cleaned = cleaned.substring(0, remove.start) + cleaned.substring(remove.end);
    }
  }

  // 4. 移除多个空格和换行，规范化为单个空格
  cleaned = cleaned.replace(/\s+/g, ' ').trim();

  // 5. 移除末尾的标点符号和多余空格
  cleaned = cleaned.replace(/[；;，,。.、\s]+$/, '');

  // 6. 移除纯数字组合（如末尾的 " 2"）
  cleaned = cleaned.replace(/\s+\d+\s*$/, '');

  // 7. 移除重复的"套"字（如"套套3" → "套3"）
  cleaned = cleaned.replace(/套+/g, '套');

  return cleaned;
}

/**
 * 规范化型号格式
 * - 统一使用小写
 * - 统一使用 '×' 作为乘号
 * - 统一 'mm' 单位
 *
 * @param model - 原始型号
 * @returns 规范化后的型号
 */
export function normalizeModel(model: string): string {
  if (!model) return '';

  let normalized = model;

  // 统一乘号
  normalized = normalized.replace(/[xX]/g, '×');

  // 统一 'mm' 单位
  normalized = normalized.replace(/mm/gi, 'mm');

  // 移除多余空格
  normalized = normalized.replace(/\s+/g, ' ').trim();

  return normalized;
}

/**
 * 提取关键参数信息
 * 从参数描述中提取关键信息（尺寸、容量等）
 *
 * @param description - 参数描述
 * @returns 提取的关键信息对象
 */
export function extractKeyParameters(description: string): {
  size?: string;
  capacity?: string;
  material?: string;
  power?: string;
} {
  const result: {
    size?: string;
    capacity?: string;
    material?: string;
    power?: string;
  } = {};

  if (!description) return result;

  // 提取尺寸：φ4000×3000mm, 4000×3000
  const sizeMatch = description.match(/φ?\s*(\d+[×x]\d+)mm?/i);
  if (sizeMatch) {
    result.size = sizeMatch[1];
  }

  // 提取容量：50吨/天, 100m³/h
  const capacityMatch = description.match(/(\d+)\s*(吨|t|立方|m³)\s*[\/每]\s*(天|日|小时|h|H)/i);
  if (capacityMatch) {
    result.capacity = capacityMatch[0];
  }

  // 提取材质：不锈钢、碳钢、玻璃钢
  const materials = ['不锈钢', '碳钢', '玻璃钢', 'PP', 'PE', 'PVC'];
  for (const material of materials) {
    if (description.includes(material)) {
      result.material = material;
      break;
    }
  }

  // 提取功率：5.5kW, 7.5kw
  const powerMatch = description.match(/(\d+(?:\.\d+)?)\s*kW/i);
  if (powerMatch) {
    result.power = powerMatch[0];
  }

  return result;
}
// test
