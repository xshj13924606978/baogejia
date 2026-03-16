/**
 * 增强版参数描述清洗工具
 * 提供更全面的文本清洗和修复功能
 */

import { cleanParameterDescription as baseClean } from './string-cleaner';

export interface CleanResult {
  cleaned: string;
  removedItems: string[];
  statistics: {
    originalLength: number;
    cleanedLength: number;
    removedChars: number;
  };
}

/**
 * 增强版参数清洗
 * 在基础清洗基础上，增加更多高级清洗功能
 *
 * @param text - 原始参数描述
 * @returns 清洗结果对象
 */
export function cleanParameterDescriptionEnhanced(text: string): CleanResult {
  if (!text) {
    return {
      cleaned: '',
      removedItems: [],
      statistics: {
        originalLength: 0,
        cleanedLength: 0,
        removedChars: 0,
      },
    };
  }

  console.log('🧹 [增强清洗] 开始清洗参数描述');
  console.log('📥 原始内容:', text);

  const removedItems: string[] = [];
  const original = text;
  let cleaned = text;

  // 步骤1：基础清洗（调用现有的清洗函数）
  console.log('\n  步骤1: 执行基础清洗');
  cleaned = baseClean(cleaned);
  console.log('  ✅ 基础清洗完成');

  // 步骤2：修复被拆分的品牌信息
  console.log('\n  步骤2: 修复品牌信息');
  const beforeBrandFix = cleaned;
  cleaned = fixBrokenBrands(cleaned);
  if (beforeBrandFix !== cleaned) {
    removedItems.push('修复品牌信息拆分');
    console.log('  ✅ 修复品牌:', beforeBrandFix, '→', cleaned);
  } else {
    console.log('  ℹ️ 无需修复品牌');
  }

  // 步骤3：规格去重（新增）
  console.log('\n  步骤3: 规格去重');
  const beforeSpecDedupe = cleaned;
  const specResult = removeDuplicateSpecifications(cleaned);
  cleaned = specResult.text;
  if (specResult.duplicates.length > 0) {
    removedItems.push(`规格去重: ${specResult.duplicates.join(', ')}`);
    console.log('  ✅ 移除重复规格:', specResult.duplicates);
  } else {
    console.log('  ℹ️ 无重复规格');
  }

  // 步骤4：功率去重（新增）
  console.log('\n  步骤4: 功率去重');
  const beforePowerDedupe = cleaned;
  const powerResult = removeDuplicatePower(cleaned);
  cleaned = powerResult.text;
  if (powerResult.duplicates.length > 0) {
    removedItems.push(`功率去重: ${powerResult.duplicates.join(', ')}`);
    console.log('  ✅ 移除重复功率:', powerResult.duplicates);
  } else {
    console.log('  ℹ️ 无重复功率');
  }

  // 步骤5：修复拆分的参数格式
  console.log('\n  步骤5: 修复参数格式');
  const beforeParamFix = cleaned;
  cleaned = fixBrokenParameters(cleaned);
  if (beforeParamFix !== cleaned) {
    removedItems.push('修复参数格式');
    console.log('  ✅ 修复参数:', beforeParamFix, '→', cleaned);
  } else {
    console.log('  ℹ️ 无需修复参数');
  }

  // 步骤6：移除数量信息（如果仍在参数描述中）
  console.log('\n  步骤6: 移除残留数量信息');
  const beforeQuantityRemoval = cleaned;
  const quantityRemoved = removeQuantityInfo(cleaned);
  cleaned = quantityRemoved.text;
  if (quantityRemoved.removed.length > 0) {
    removedItems.push(`数量信息: ${quantityRemoved.removed.join(', ')}`);
    console.log('  ✅ 移除数量:', quantityRemoved.removed);
  } else {
    console.log('  ℹ️ 无需移除数量');
  }

  // 步骤7：修复换行问题
  console.log('\n  步骤7: 修复换行问题');
  const beforeLineFix = cleaned;
  cleaned = fixLineBreaks(cleaned);
  if (beforeLineFix !== cleaned) {
    removedItems.push('修复换行');
    console.log('  ✅ 修复换行');
  } else {
    console.log('  ℹ️ 无需修复换行');
  }

  // 步骤8：规范化分隔符
  console.log('\n  步骤8: 规范化分隔符');
  const beforeSepNorm = cleaned;
  cleaned = normalizeSeparators(cleaned);
  if (beforeSepNorm !== cleaned) {
    removedItems.push('规范化分隔符');
    console.log('  ✅ 规范化分隔符');
  } else {
    console.log('  ℹ️ 无需规范化');
  }

  // 步骤9：最终清理
  console.log('\n  步骤9: 最终清理');
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/[；;，,。.、]+$/, '');
  console.log('  ✅ 最终清理完成');

  const statistics = {
    originalLength: original.length,
    cleanedLength: cleaned.length,
    removedChars: original.length - cleaned.length,
  };

  console.log('\n📊 清洗统计:');
  console.log(`  原始长度: ${statistics.originalLength}`);
  console.log(`  清洗后长度: ${statistics.cleanedLength}`);
  console.log(`  减少字符: ${statistics.removedChars}`);
  console.log(`  清洗项: ${removedItems.length} 项`);
  if (removedItems.length > 0) {
    console.log('  清洗内容:');
    removedItems.forEach((item, i) => {
      console.log(`    ${i + 1}. ${item}`);
    });
  }
  console.log('\n✨ 最终结果:', cleaned);
  console.log('🧹 [增强清洗] 完成\n');

  return {
    cleaned,
    removedItems,
    statistics,
  };
}

/**
 * 修复被拆分的品牌信息
 */
function fixBrokenBrands(text: string): string {
  let fixed = text;

  // 常见品牌完整名称
  const brands = [
    { parts: ['佳木斯', '电机'], full: '佳木斯电机' },
    { parts: ['宁波动力', '减速机'], full: '宁波动力减速机' },
    { parts: ['哈瓦洛', '轴承'], full: '哈瓦洛轴承' },
    { parts: ['Harbin', 'Bearing'], full: 'Harbin Bearing' },
    { parts: ['西门子', '变频器'], full: '西门子变频器' },
    { parts: ['ABB', '电机'], full: 'ABB电机' },
  ];

  for (const brand of brands) {
    // 查找被拆分的品牌
    const parts = brand.parts.map(p => p.toLowerCase());
    let found = true;
    
    for (const part of parts) {
      if (!fixed.toLowerCase().includes(part)) {
        found = false;
        break;
      }
    }

    if (found && !fixed.includes(brand.full)) {
      // 替换为完整名称
      const pattern = new RegExp(
        brand.parts.map(p => p.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')).join('[/：:：\\s]+'),
        'gi'
      );
      fixed = fixed.replace(pattern, brand.full);
    }
  }

  return fixed;
}

/**
 * 修复拆分的参数格式
 */
function fixBrokenParameters(text: string): string {
  let fixed = text;

  // 修复 "φ 4000 × 3000 mm" → "φ4000×3000mm"
  fixed = fixed.replace(/φ\s+(\d+)\s*[×*xX]\s*(\d+)\s*(mm)?/gi, 'φ$1×$2$3');
  
  // 修复 "DN 4000" → "DN4000"
  fixed = fixed.replace(/DN\s+(\d+)/gi, 'DN$1');
  
  // 修复 "Φ 4000" → "Φ4000"
  fixed = fixed.replace(/Φ\s+(\d+)/gi, 'Φ$1');
  
  // 修复 "Q235 B" → "Q235B"
  fixed = fixed.replace(/Q235\s+B/gi, 'Q235B');
  fixed = fixed.replace(/304\s+L/gi, '304L');
  fixed = fixed.replace(/316\s+L/gi, '316L');

  // 修复 "10 mm" → "10mm"
  fixed = fixed.replace(/(\d+)\s+mm/gi, '$1mm');

  return fixed;
}

/**
 * 移除数量信息
 */
function removeQuantityInfo(text: string): { text: string; removed: string[] } {
  const removed: string[] = [];
  let cleaned = text;

  // 匹配各种数量模式（更精确的模式）
  const patterns = [
    // "套3 2" 或 "套3" - 需要在词边界匹配
    /\b套\s*\d+\s*\d+\b/g,
    /\b套\s*\d+\b(?!\s*mm)/g,
    // "Qty:3" 或 "QTY:3"
    /\b(?:Qty|QTY)\s*[:：]\s*\d+\b/gi,
    // "数量:3" 或 "数量：3"
    /\b数量\s*[:：]\s*\d+\b/g,
    // 纯数字后跟单位（但排除规格中的数字，如400mm）
    /\b(\d+)\s*(套|台|个|只|条|根|件)\b/g,
  ];

  for (const pattern of patterns) {
    const matches = cleaned.match(pattern);
    if (matches) {
      matches.forEach(match => {
        // 排除包含"mm"的情况（如400mm）
        if (!match.includes('mm') && !match.includes('×')) {
          removed.push(match.trim());
          cleaned = cleaned.replace(match, '');
        }
      });
    }
  }

  return { text: cleaned, removed };
}

/**
 * 修复换行问题
 */
function fixLineBreaks(text: string): string {
  let fixed = text;

  // 修复英文单词被换行拆分（但保留英文单词之间的空格）
  // 只修复小写字母之间或大写字母之间的换行，不修复CamelCase
  fixed = fixed.replace(/([a-z])\s+([a-z])/g, '$1$2');
  
  // 修复中文和英文之间的多余空格
  fixed = fixed.replace(/([\u4e00-\u9fa5])\s+([a-zA-Z])/g, '$1$2');
  fixed = fixed.replace(/([a-zA-Z])\s+([\u4e00-\u9fa5])/g, '$1$2');
  
  // 修复数字和单位之间的空格（保留单位前的空格）
  fixed = fixed.replace(/(\d+)\s+(kW|千瓦|W|瓦|mm|cm|m|吨|kg|克)\b/gi, '$1$2');

  return fixed;
}

/**
 * 规范化分隔符
 */
function normalizeSeparators(text: string): string {
  let normalized = text;

  // 统一使用中文分号和逗号
  normalized = normalized.replace(/[,;]/g, '，');
  
  // 统一使用中文冒号
  normalized = normalized.replace(/[:]/g, '：');
  
  // 移除多余的分隔符
  normalized = normalized.replace(/[，。、；:；;]+/g, '；');
  
  // 规范化斜杠
  normalized = normalized.replace(/[／]/g, '/');

  return normalized;
}

/**
 * 提取参数摘要
 * 从参数描述中提取关键信息摘要
 */
export function extractParameterSummary(description: string): {
  size?: string;
  material?: string;
  power?: string;
  capacity?: string;
  otherFeatures: string[];
} {
  const summary: {
    size?: string;
    material?: string;
    power?: string;
    capacity?: string;
    otherFeatures: string[];
  } = {
    otherFeatures: [],
  };

  if (!description) return summary;

  // 提取尺寸
  const sizeMatch = description.match(/φ?\s*(\d+[×*]\d+)\s*(mm)?/i);
  if (sizeMatch) {
    summary.size = sizeMatch[1] + (sizeMatch[2] || '');
  }

  // 提取材质
  const materials = ['Q235B', '304', '304L', '316L', '碳钢', '不锈钢', '玻璃钢', 'PP', 'PE', 'PVC'];
  for (const material of materials) {
    if (description.includes(material)) {
      summary.material = material;
      break;
    }
  }

  // 提取功率
  const powerMatch = description.match(/(\d+(?:\.\d+)?)\s*(kW|千瓦)/i);
  if (powerMatch) {
    summary.power = powerMatch[0];
  }

  // 提取容量
  const capacityMatch = description.match(/(\d+)\s*(吨|t|立方|m³)\s*[\/每]\s*(天|日|小时|h)/i);
  if (capacityMatch) {
    summary.capacity = capacityMatch[0];
  }

  // 提取其他特征
  const features = [
    '环氧树脂防腐', '内外防腐', '带顶盖', '活动加药孔', '支腿', 
    '工艺管道', '变频器', '搅拌器', '减速机', '轴承'
  ];
  
  for (const feature of features) {
    if (description.includes(feature)) {
      summary.otherFeatures.push(feature);
    }
  }

  return summary;
}

/**
 * 移除重复的规格参数
 * 例如：φ4000×3000mm φ4000×3000 → φ4000×3000mm
 */
export function removeDuplicateSpecifications(text: string): {
  text: string;
  duplicates: string[];
} {
  const duplicates: string[] = [];
  let cleaned = text;

  // 匹配各种规格模式
  const specPatterns = [
    // φ4000×3000mm 或 φ4000×3000
    /φ\s*(\d+)\s*[×*xX]\s*(\d+)\s*(mm)?/gi,
    // DN4000
    /DN\s*(\d+)/gi,
    // Φ4000
    /Φ\s*(\d+)/gi,
  ];

  for (const pattern of specPatterns) {
    const matches = [];
    let match;

    // 收集所有匹配的规格
    while ((match = pattern.exec(cleaned)) !== null) {
      matches.push({
        full: match[0],
        value: match[0].replace(/\s+/g, ''), // 标准化：移除空格
        index: match.index,
      });
    }

    // 如果找到重复的规格
    if (matches.length > 1) {
      // 按规格值分组
      const specGroups = new Map<string, typeof matches>();
      for (const m of matches) {
        const key = m.value.toLowerCase();
        if (!specGroups.has(key)) {
          specGroups.set(key, []);
        }
        specGroups.get(key)!.push(m);
      }

      // 移除重复的规格（只保留第一个）
      for (const [key, group] of specGroups) {
        if (group.length > 1) {
          // 保留第一个，移除后续的
          for (let i = 1; i < group.length; i++) {
            const duplicate = group[i];
            duplicates.push(duplicate.full);
            // 精确替换，避免误删
            const regex = new RegExp(
              duplicate.full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
              'g'
            );
            cleaned = cleaned.replace(regex, '');
          }
        }
      }
    }
  }

  // 清理可能产生的多余空格和分隔符
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  cleaned = cleaned.replace(/[；;，,、]+/g, '；');

  return { text: cleaned, duplicates };
}

/**
 * 移除重复的功率信息
 * 例如：11kW 11kW → 11kW
 */
export function removeDuplicatePower(text: string): {
  text: string;
  duplicates: string[];
} {
  const duplicates: string[] = [];
  let cleaned = text;

  // 匹配功率模式
  const powerPattern = /(\d+(?:\.\d+)?)\s*(kW|千瓦|W|瓦)/gi;
  const matches = [];
  let match;

  // 收集所有匹配的功率
  while ((match = powerPattern.exec(cleaned)) !== null) {
    matches.push({
      full: match[0],
      value: parseFloat(match[1]),
      unit: match[2],
      normalized: `${match[1]}${match[2]}`, // 标准化：移除空格
    });
  }

  // 按功率值分组
  const powerGroups = new Map<string, typeof matches>();
  for (const m of matches) {
    const key = m.normalized.toLowerCase();
    if (!powerGroups.has(key)) {
      powerGroups.set(key, []);
    }
    powerGroups.get(key)!.push(m);
  }

  // 移除重复的功率（只保留第一个）
  for (const [key, group] of powerGroups) {
    if (group.length > 1) {
      // 保留第一个，移除后续的
      for (let i = 1; i < group.length; i++) {
        const duplicate = group[i];
        duplicates.push(duplicate.full);
        // 精确替换
        const regex = new RegExp(
          duplicate.full.replace(/[.*+?^${}()|[\]\\]/g, '\\$&'),
          'g'
        );
        cleaned = cleaned.replace(regex, '');
      }
    }
  }

  // 清理可能产生的多余空格和分隔符
  cleaned = cleaned.replace(/\s{2,}/g, ' ').trim();
  cleaned = cleaned.replace(/[；;，,、]+/g, '；');

  return { text: cleaned, duplicates };
}
