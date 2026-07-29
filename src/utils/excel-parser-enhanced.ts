/**
 * Excel 增强解析器
 * 解决以下问题：
 * 1. 页脚备注被误提取为产品数据
 * 2. 产品信息提取不完整（名称和参数描述分离）
 * 3. 多行产品描述需要智能合并
 */

import * as XLSX from 'xlsx';

// 类型定义
interface ExcelParseResult {
  products: ProductInfo[];
  rawContent: string;
  parseDetails: ParseDetails;
}

interface ProductInfo {
  name: string;
  parameter_description: string;
  brand?: string;
  unit?: string;
  quantity?: string | number;
  unit_price?: string | number;
  subtotal?: string | number;
  model?: string;
  specs?: string;
}

interface ParseDetails {
  tableName: string;
  rowCount: number;
  columnCount: number;
  headerRow: number;
  dataStartRow: number;
  dataEndRow: number;
  footerRows: string[];
  mergedProducts: number;
  parseTime: number;
}

interface MergedRow {
  row: number;
  cells: any[];
  isMerged: boolean;
}

/**
 * 主解析函数
 */
export async function parseExcelEnhanced(fileBuffer: ArrayBuffer, fileName: string): Promise<ExcelParseResult> {

  const startTime = Date.now();

  try {
    // 读取 Excel
    const workbook = XLSX.read(fileBuffer, { type: 'array' });

    // 获取第一个工作表
    const sheetName = workbook.SheetNames[0];

    const worksheet = workbook.Sheets[sheetName];

    // 转换为二维数组（包含空单元格）
    const jsonData = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '', // 空单元格填充空字符串
      blankrows: true // 保留空行
    });


    // 步骤1：识别表格范围
    const range = detectTableRange(jsonData);

    // 步骤2：提取数据行
    const dataRows = jsonData.slice(range.dataStartRow, range.dataEndRow + 1);

    // 步骤3：多行内容合并
    const mergedRows = mergeMultiRowContent(dataRows as any[][], range.columnCount);

    // 步骤4：提取产品信息
    const products = mergedRows.map(row => extractProductInfo(row, range.headerMapping));

    // 步骤5：过滤无效产品
    let validProducts = products.filter(p => {
      const isValid = p.name && p.name.length > 1;
      if (!isValid) {
      }
      return isValid;
    });

    // 步骤6：后处理清洗（移除参数描述中的备注内容）
    validProducts = cleanProductDescriptions(validProducts);

    const endTime = Date.now();
    const parseTime = endTime - startTime;

    const result: ExcelParseResult = {
      products: validProducts,
      rawContent: JSON.stringify(jsonData, null, 2),
      parseDetails: {
        tableName: sheetName,
        rowCount: jsonData.length,
        columnCount: range.columnCount,
        headerRow: range.headerRow,
        dataStartRow: range.dataStartRow,
        dataEndRow: range.dataEndRow,
        footerRows: range.footerRows,
        mergedProducts: mergedRows.filter(r => r.isMerged).length,
        parseTime
      }
    };


    validProducts.forEach((p, i) => {
      if (p.parameter_description) {
      }
    });

    return result;
  } catch (error) {
    console.error('❌ Excel解析失败:', error);
    throw error;
  }
}

/**
 * 1. 表格范围智能识别
 */
function detectTableRange(jsonData: any[]): any {

  const result: any = {
    headerRow: 0,
    dataStartRow: 1,
    dataEndRow: jsonData.length - 1,
    columnCount: 0,
    headerMapping: {},
    footerRows: [] as string[]
  };

  // 1.1 找到表头行
  result.headerRow = findHeaderRow(jsonData);

  // 1.2 确定列数
  result.columnCount = determineColumnCount(jsonData, result.headerRow);

  // 1.3 识别列映射
  result.headerMapping = mapColumns(jsonData[result.headerRow], result.columnCount);

  // 1.4 找到数据结束行（排除页脚备注）
  result.dataEndRow = findDataEndRow(jsonData, result.headerRow, result.columnCount);

  // 1.5 记录页脚行
  for (let i = result.dataEndRow + 1; i < jsonData.length; i++) {
    const row = jsonData[i].filter((v: any) => v).join(' ');
    if (row.trim()) {
      result.footerRows.push(row);
    }
  }


  return result;
}

/**
 * 找到表头行
 */
function findHeaderRow(jsonData: any[]): number {
  for (let row = 0; row < Math.min(jsonData.length, 10); row++) {
    const rowData = jsonData[row];
    const values = rowData.filter((v: any) => v && v.toString().trim());

    if (values.length < 2) continue;

    const text = values.join(' ');

    // 检查是否包含典型的表头关键词
    const headerKeywords = [
      '产品名称', '名称', '型号', '规格', '品牌',
      '参数', '描述', '单位', '数量', '单价', '总价',
      '序号', 'No', 'Item', 'Name', 'Spec', 'Brand'
    ];

    const matchCount = headerKeywords.filter(kw => text.includes(kw)).length;

    if (matchCount >= 2 || text.match(/产品|名称|型号|规格/)) {
      return row;
    }
  }

  // 如果找不到，假设第一行是表头
  return 0;
}

/**
 * 确定列数
 */
function determineColumnCount(jsonData: any[], headerRow: number): number {
  const headerData = jsonData[headerRow];
  if (!headerData) return 0;

  // 统计非空列
  let count = 0;
  for (const cell of headerData) {
    if (cell && cell.toString().trim()) {
      count++;
    } else if (count > 0) {
      // 遇到空列但之前已经有数据列，可能是有空列
      // 继续检查后面是否还有数据列
      continue;
    }
  }

  // 检查前几行数据，确定最大列数
  for (let row = headerRow + 1; row < Math.min(jsonData.length, headerRow + 5); row++) {
    const rowLen = jsonData[row].filter((v: any) => v).length;
    if (rowLen > count) {
      count = rowLen;
    }
  }

  return count;
}

/**
 * 映射列名
 */
function mapColumns(headerRow: any[], columnCount: number): Record<string, number> {
  const mapping: Record<string, number> = {};

  for (let i = 0; i < Math.min(headerRow.length, columnCount); i++) {
    const cell = headerRow[i];
    if (!cell) continue;

    const text = cell.toString().toLowerCase().trim();

    // 列名映射规则
    if (text.match(/产品名称|名称|产品|item|name/i)) {
      mapping.name = i;
    } else if (text.match(/型号|型号规格|model|mod/i)) {
      mapping.model = i;
    } else if (text.match(/品牌|厂家|brand|factory/i)) {
      mapping.brand = i;
    } else if (text.match(/参数|规格|规格型号|描述|spec|description/i)) {
      mapping.parameter_description = i;
    } else if (text.match(/单位|unit/i)) {
      mapping.unit = i;
    } else if (text.match(/数量|qty|quantity/i)) {
      mapping.quantity = i;
    } else if (text.match(/单价|price/i)) {
      mapping.unit_price = i;
    } else if (text.match(/总价|小计|合计|total/i)) {
      mapping.subtotal = i;
    } else if (text.match(/序号|no|序/i)) {
      mapping.no = i;
    }
  }

  return mapping;
}

/**
 * 找到数据结束行（排除页脚备注）- 强化版
 */
function findDataEndRow(jsonData: any[], headerRow: number, columnCount: number): number {

  let consecutiveEmptyRows = 0;
  const maxEmptyRows = 2;
  let lastDataRow = headerRow;
  let foundFooter = false;

  // 打印前30行的内容用于调试
  for (let i = 0; i < Math.min(jsonData.length, 30); i++) {
    const rowData = jsonData[i];
    const values = rowData.filter((v: any) => v && v.toString().trim());
    if (values.length > 0) {
    }
  }

  for (let row = headerRow + 1; row < jsonData.length; row++) {
    const rowData = jsonData[row];
    const values = rowData.filter((v: any) => v && v.toString().trim() !== '');


    // 检查是否是页脚备注（强化识别规则）
    if (isFooterNote(values)) {
      foundFooter = true;
      lastDataRow = row - 1;
      break;
    }

    // 检查是否包含合计行（通常也是表格结束标志）
    if (isTotalRow(values)) {
      foundFooter = true;
      lastDataRow = row - 1;
      break;
    }

    // 检查空行
    if (values.length === 0) {
      consecutiveEmptyRows++;
      if (consecutiveEmptyRows >= maxEmptyRows) {
        lastDataRow = row - maxEmptyRows;
        break;
      }
    } else {
      consecutiveEmptyRows = 0;
      lastDataRow = row; // 更新最后数据行

      // 优化：检查是否是续行（第一列为空，但有其他列有内容）
      const firstCell = rowData[0] ? rowData[0].toString().trim() : '';
      if (!firstCell && values.length >= 1) {
        // 这是续行，不是备注
        continue;
      }

      // 检查是否还有足够的列数据
      // 修改：降低阈值，但有内容时继续检查
      const nonEmptyCount = rowData.filter((v: any) => v).length;
      if (nonEmptyCount >= 1 && row > headerRow + 5) {
        // 只有少量列有数据，可能是备注开始
        // 但需要检查内容是否像产品数据
        const firstNonEmpty = rowData.find((v: any) => v);
        if (firstNonEmpty && firstNonEmpty.toString().match(/以上|不含税|含运费|备注|说明|价格条款/)) {
          lastDataRow = row - 1;
          break;
        }
      }
    }
  }

  // 如果没有找到明确的结束标志，但发现了备注文本在最后几行
  if (!foundFooter) {
    // 再次扫描，查找备注文本
    for (let row = Math.max(lastDataRow + 1, jsonData.length - 5); row < jsonData.length; row++) {
      const rowData = jsonData[row];
      const values = rowData.filter((v: any) => v && v.toString().trim() !== '');

      if (values.length > 0 && isFooterNote(values)) {
        // 不修改lastDataRow，保持原有数据行数
        break;
      }
    }
  }


  return lastDataRow;
}

/**
 * 强化页脚备注识别
 */
function isFooterNote(values: any[]): boolean {
  if (!values || values.length === 0) return false;

  const text = values.join(' ').toLowerCase();

  // 扩展备注关键词列表
  const footerKeywords = [
    '以上价格不含税',
    '含运费',
    '不含运费',
    '备注',
    '注：',
    '说明',
    '合计',
    '总计',
    '小计',
    '优惠',
    '折扣',
    '付款方式',
    '交货期',
    '有效期',
    '以上报价',
    '本报价',
    '价格条款',
    '税',
    '税率',
    '增值税',
    '运费',
    '以上价格',
    '以上不含',
    '含税',
    '不含税',
    '最终价格',
    '不含',
    '含'
  ];

  // 检查是否包含任何关键词
  const hasKeyword = footerKeywords.some(keyword => text.includes(keyword));

  // 如果是单行文本且长度适中，很可能是备注
  const isLikelyFooter = hasKeyword &&
                         values.length <= 3 &&
                         text.length > 5 &&
                         text.length < 200;

  if (isLikelyFooter) {
    const matchedKeywords = footerKeywords.filter(k => text.includes(k));
  }

  return isLikelyFooter;
}

/**
 * 识别合计行
 */
function isTotalRow(values: any[]): boolean {
  if (!values || values.length === 0) return false;

  const text = values.join(' ').toLowerCase();
  const totalKeywords = ['合计', '总计', 'total', 'sum', '小计', '总额'];

  return totalKeywords.some(keyword => text.includes(keyword));
}

/**
 * 2. 多行内容合并 - 防止备注被合并
 */
function mergeMultiRowContent(dataRows: any[][], columnCount: number): MergedRow[] {

  const mergedRows: MergedRow[] = [];
  let currentProduct: MergedRow | null = null;

  for (let i = 0; i < dataRows.length; i++) {
    const rowData = dataRows[i];
    const cells = rowData.slice(0, columnCount); // 只取有效列


    // 检查是否是备注行（即使在endRow之前，也要排除）
    if (isFooterNote(cells)) {
      continue;
    }

    // 检查是否是合计行
    if (isTotalRow(cells)) {
      continue;
    }

    // 检查是否是空行
    if (!cells || cells.filter(v => v && v.toString().trim()).length === 0) {
      continue;
    }

    // 检查是否是新产品行的开始
    if (isNewProductStart(cells)) {
      // 保存上一个产品
      if (currentProduct) {
        mergedRows.push(currentProduct);
      }

      // 开始新产品
      currentProduct = {
        row: i,
        cells: [...cells],
        isMerged: false
      };
    }
    // 检查是否是当前产品的续行
    else if (currentProduct && shouldMergeWithPrevious(cells, currentProduct)) {

      // 合并内容前，先检查是否是备注内容
      const cellText = cells.join(' ').toLowerCase();
      if (isFooterNote([cellText])) {
        continue;
      }


      // 合并内容
      for (let col = 0; col < cells.length; col++) {
        if (cells[col] && cells[col].toString().trim()) {
          if (!currentProduct.cells[col]) {
            // 当前列有内容但产品列为空，直接使用
            currentProduct.cells[col] = cells[col];
          } else if (col === 2) { // 参数描述列（通常是第3列）
            // 智能合并参数描述
            const newContent = cells[col].toString().trim();
            const existingContent = currentProduct.cells[col].toString().trim();

            // 检查新内容是否可能是备注
            if (isFooterNote([newContent])) {
              continue;
            }

            currentProduct.cells[col] = smartMerge(existingContent, newContent);
          } else if (cells[col] && currentProduct.cells[col]) {
            // 两列都有内容，智能合并
            currentProduct.cells[col] = smartMerge(
              currentProduct.cells[col],
              cells[col]
            );
          }
        }
      }
      currentProduct.isMerged = true;
    }
    // 既不是新产品也不是续行，可能是游离文本
    else {
    }
  }

  // 添加最后一个产品
  if (currentProduct) {
    mergedRows.push(currentProduct);
  }


  return mergedRows;
}

/**
 * 判断是否是新产品的开始
 */
function isNewProductStart(cells: any[]): boolean {
  if (!cells || cells.length === 0) return false;

  // 获取第一列（序号或名称）
  const firstCell = cells[0] ? cells[0].toString().trim() : '';

  // 规则1：第一列为空，不是新产品
  if (!firstCell) return false;

  // 规则2：序号模式（1.、1、1、等）
  if (/^\d+[\.、]?\s*$/.test(firstCell)) return true;

  // 规则3：产品名称模式（以常见产品词开头）
  if (/^[A-Z]+[a-z]*|搅拌|发生器|泵|电机|泵体|罐|槽|塔|机|器|设备/.test(firstCell)) {
    return true;
  }

  // 规则4：有多个非空单元格（至少2列有数据）
  const nonEmptyCount = cells.filter(v => v && v.toString().trim()).length;
  if (nonEmptyCount >= 2) return true;

  return false;
}

/**
 * 判断是否应该合并
 */
function shouldMergeWithPrevious(cells: any[], previousProduct: MergedRow): boolean {
  if (!cells || cells.length === 0) return false;

  // 规则1：第一列为空（续行通常第一列为空）
  const firstCell = cells[0] ? cells[0].toString().trim() : '';
  if (firstCell) {
    // 第一列有内容，可能是新产品，检查是否是续行序号
    if (!/^\d+[\.、]?\s*$/.test(firstCell)) {
      return false;
    }
  }

  // 规则2：有内容在其他列
  const hasContent = cells.slice(1).some(v => v && v.toString().trim());
  if (!hasContent) return false;

  // 规则3：垂直距离判断
  const rowGap = 0; // 连续行，row = previousProduct.row + 1
  return true;
}

/**
 * 智能合并两个单元格的内容
 */
function smartMerge(cell1: any, cell2: any): string {
  const str1 = cell1 ? cell1.toString().trim() : '';
  const str2 = cell2 ? cell2.toString().trim() : '';

  if (!str1) return str2;
  if (!str2) return str1;

  // 情况1：str1以标点符号结束，str2是补充
  if (str1.endsWith('；') || str1.endsWith(';') || str1.endsWith('，') || str1.endsWith(',')) {
    return str1 + ' ' + str2;
  }

  // 情况2：str2以规格参数开头，直接拼接
  if (/^[φΦ\d×\*\-\+]/.test(str2)) {
    return str1 + str2;
  }

  // 情况3：品牌信息拼接
  if (isBrandPart(str1, str2)) {
    return str1 + str2;
  }

  // 情况4：参数描述拼接（避免重复）
  if (isParameterOverlap(str1, str2)) {
    // 如果str2已经在str1中，只保留str1
    return str1;
  }

  // 默认：加空格拼接
  return str1 + ' ' + str2;
}

/**
 * 判断是否是品牌信息的一部分
 */
function isBrandPart(part1: string, part2: string): boolean {
  const brands = ['佳木斯', '宁波动力', '哈瓦洛', 'Harbin', '西门子', 'ABB', '上海', '沈阳', '大连'];

  return brands.some(brand =>
    (part1 + part2).includes(brand) ||
    brand.startsWith(part1) ||
    brand.includes(part2)
  );
}

/**
 * 判断参数描述是否重叠
 */
function isParameterOverlap(str1: string, str2: string): boolean {
  // 如果str2的大部分内容已经在str1中
  const overlapRatio = calculateOverlap(str1, str2);
  return overlapRatio > 0.7;
}

/**
 * 计算重叠比例
 */
function calculateOverlap(str1: string, str2: string): number {
  if (!str1 || !str2) return 0;

  const s1 = str1.toLowerCase();
  const s2 = str2.toLowerCase();

  // 计算str2中有多少内容在str1中
  let matchCount = 0;
  for (const char of s2) {
    if (s1.includes(char)) matchCount++;
  }

  return matchCount / s2.length;
}

/**
 * 3. 产品信息提取
 */
function extractProductInfo(row: MergedRow, headerMapping: Record<string, number>): ProductInfo {

  const cells = row.cells;
  const product: ProductInfo = {
    name: '',
    parameter_description: '',
    brand: '',
    unit: '',
    quantity: '',
    unit_price: '',
    subtotal: ''
  };

  // 1. 提取产品名称
  const nameCol = headerMapping.name ?? 1; // 默认第2列（索引1）
  if (cells[nameCol]) {
    let nameText = cells[nameCol].toString().trim();

    // 去除开头的序号
    nameText = nameText.replace(/^\d+[\.、]?\s*/, '');

    // 如果名称中包含换行符，拆分处理
    if (nameText.includes('\n')) {
      const parts = nameText.split('\n');
      product.name = parts[0].trim();

      // 将换行后的内容添加到参数描述
      if (parts.length > 1) {
        const extraContent = parts.slice(1).join(' ').trim();
        if (extraContent && !product.parameter_description) {
          product.parameter_description = extraContent;
        }
      }
    } else {
      product.name = nameText;
    }
  }

  // 2. 提取参数描述
  const paramCol = headerMapping.parameter_description ?? 2; // 默认第3列
  if (cells[paramCol]) {
    let paramText = cells[paramCol].toString().trim();

    // 清洗参数描述
    product.parameter_description = cleanParameterDescription(paramText);
  }

  // 3. 提取品牌
  if (headerMapping.brand !== undefined && cells[headerMapping.brand]) {
    product.brand = cells[headerMapping.brand].toString().trim();
  }

  // 4. 提取型号
  if (headerMapping.model !== undefined && cells[headerMapping.model]) {
    product.model = cells[headerMapping.model].toString().trim();
  }

  // 5. 提取单位
  if (headerMapping.unit !== undefined && cells[headerMapping.unit]) {
    product.unit = cells[headerMapping.unit].toString().trim();
  }

  // 6. 提取数量
  if (headerMapping.quantity !== undefined && cells[headerMapping.quantity]) {
    product.quantity = parseQuantity(cells[headerMapping.quantity]);
  }

  // 7. 提取单价
  if (headerMapping.unit_price !== undefined && cells[headerMapping.unit_price]) {
    product.unit_price = parsePrice(cells[headerMapping.unit_price]);
  }

  // 8. 提取小计
  if (headerMapping.subtotal !== undefined && cells[headerMapping.subtotal]) {
    product.subtotal = parsePrice(cells[headerMapping.subtotal]);
  }

  return product;
}

/**
 * 4. 参数清洗函数
 */
function cleanParameterDescription(text: string): string {
  if (!text) return '';


  let cleaned = text;

  // 1. 去除多余的空格和换行
  cleaned = cleaned.replace(/\s+/g, ' ').trim();
  cleaned = cleaned.replace(/\n+/g, ' ');

  // 2. 合并被拆分的品牌信息
  cleaned = mergeBrandInfo(cleaned);

  // 3. 去除明显的数量信息（已在数量列体现）
  cleaned = removeQuantityInfo(cleaned);

  // 4. 去除单位信息（已单独提取）
  cleaned = removeUnitInfo(cleaned);

  // 5. 规格化参数格式
  cleaned = normalizeParameterFormat(cleaned);

  // 6. 清理特殊字符
  cleaned = cleaned.replace(/[\u200B-\u200D\uFEFF]/g, ''); // 零宽字符


  return cleaned;
}

/**
 * 合并品牌信息
 */
function mergeBrandInfo(text: string): string {
  const brandPatterns = [
    { pattern: /佳木斯\s*[\/\uff0c]\s*减速机/, replace: '佳木斯/减速机' },
    { pattern: /宁波\s*动力/, replace: '宁波动力' },
    { pattern: /哈瓦洛\s*\(\s*Harbin\s*Bearing\s*\)/gi, replace: '哈瓦洛(Harbin Bearing)' },
    { pattern: /西门子\s*[\uff0c]\s*([\w]+)/gi, replace: '西门子 $1' },
    { pattern: /ABB\s*[\uff0c]\s*([\w]+)/gi, replace: 'ABB $1' }
  ];

  brandPatterns.forEach(({ pattern, replace }) => {
    text = text.replace(pattern, replace);
  });

  return text;
}

/**
 * 去除数量信息
 */
function removeQuantityInfo(text: string): string {
  // 匹配 "数量: xx" 或 "xx台" 等模式
  let cleaned = text;
  cleaned = cleaned.replace(/数量\s*[:：]\s*\d+(\.\d+)?/gi, '');
  cleaned = cleaned.replace(/\d+\s*(台|个|套|件|只|根|条|米|kg|KG|kg)/g, (match, unit) => {
    // 如果这个数字后面跟着的是规格单位（mm、m等），则保留
    if (['mm', 'm', 'cm', 'km', 'mm²', 'm²', 'cm²'].includes(unit.toLowerCase())) {
      return match;
    }
    return '';
  });
  return cleaned.trim();
}

/**
 * 去除单位信息
 */
function removeUnitInfo(text: string): string {
  const units = ['台', '个', '套', '件', '只', '根', '条', '米'];
  units.forEach(unit => {
    // 只去除单独的单位，不作为参数一部分的单位
    const pattern = new RegExp(`\\b${unit}\\b(?!\\s*[\\d\\u4e00-\\u9fa5])`, 'g');
    text = text.replace(pattern, '');
  });
  return text;
}

/**
 * 规格化参数格式
 */
function normalizeParameterFormat(text: string): string {
  // 统一中英文标点
  let cleaned = text.replace(/[\uff0c\uff1b\uff1a]/g, (match) => {
    const map: Record<string, string> = {
      '\uff0c': ',',
      '\uff1b': ';',
      '\uff1a': ':'
    };
    return map[match] || match;
  });

  // 规格参数中的符号规范化
  cleaned = cleaned.replace(/×/g, '×'); // 乘号
  cleaned = cleaned.replace(/\*/g, '×'); // 星号改为乘号

  // 清理多余的标点
  cleaned = cleaned.replace(/[,;:]\s*[,;:]+/g, ',');
  cleaned = cleaned.replace(/[,;:]\s*$/g, '');

  // 添加必要的空格
  cleaned = cleaned.replace(/([a-zA-Z])(\d)/g, '$1 $2');
  cleaned = cleaned.replace(/(\d)([a-zA-Z])/g, '$1 $2');

  return cleaned;
}

/**
 * 解析数量
 */
function parseQuantity(value: any): string | number {
  if (!value) return '';

  const str = value.toString().trim();

  // 去除单位，只保留数字
  const match = str.match(/(\d+(?:\.\d+)?)/);
  if (match) {
    const num = parseFloat(match[1]);
    return Number.isInteger(num) ? num : num.toFixed(2);
  }

  return str;
}

/**
 * 解析价格
 */
function parsePrice(value: any): string | number {
  if (!value) return '';

  const str = value.toString().trim();

  // 去除货币符号，保留数字
  const match = str.match(/(\d+(?:,\d{3})*(?:\.\d{2})?)/);
  if (match) {
    const numStr = match[1].replace(/,/g, '');
    const num = parseFloat(numStr);
    return Number.isInteger(num) ? num : num.toFixed(2);
  }

  return str;
}

/**
 * 后处理清洗：移除参数描述中的备注内容（最后一道防线）
 */
function cleanProductDescriptions(products: ProductInfo[]): ProductInfo[] {

  return products.map((product, index) => {
    if (product.parameter_description) {
      const original = product.parameter_description;
      let cleaned = original;

      // 检查是否包含备注文本模式
      const footerPatterns = [
        /以上价格不含税[^，,；;\uff0c\uff1b]*/gi,
        /含运费[^，,；;\uff0c\uff1b]*/gi,
        /不含运费[^，,；;\uff0c\uff1b]*/gi,
        /备注[：:][^，,；;\uff0c\uff1b]*/gi,
        /注[：:][^，,；;\uff0c\uff1b]*/gi,
        /说明[：:][^，,；;\uff0c\uff1b]*/gi,
        /付款方式[：:][^，,；;\uff0c\uff1b]*/gi,
        /交货期[：:][^，,；;\uff0c\uff1b]*/gi,
        /有效期[：:][^，,；;\uff0c\uff1b]*/gi,
        /价格条款[：:][^，,；;\uff0c\uff1b]*/gi
      ];

      let hasFooter = false;
      footerPatterns.forEach(pattern => {
        if (pattern.test(cleaned)) {
          cleaned = cleaned.replace(pattern, '').trim();
          hasFooter = true;
        }
      });

      // 去除多余空格和标点
      cleaned = cleaned.replace(/\s+/g, ' ');
      cleaned = cleaned.replace(/[，,;；\uff0c\uff1b\s]+$/, '');

      if (original !== cleaned) {
        product.parameter_description = cleaned;
      } else {
      }
    }

    return product;
  });
}

/**
 * 导出：创建测试数据（用于测试）
 */
export function createTestExcel(): ArrayBuffer {
  // 创建一个测试Excel文件
  const workbook = XLSX.utils.book_new();

  const testData = [
    ['序号', '产品名称', '参数描述', '品牌', '单位', '数量', '单价', '小计'],
    ['1', 'PAM搅拌罐本体', 'φ4000×3000mm Q235B碳钢/壁厚10mm', '佳木斯/减速机', '台', '1', '50000', '50000'],
    ['', '', '环氧树脂内外防腐/带顶盖及活动加药孔', '', '', '', '', ''],
    ['', '', '3条400mm支腿/不锈钢304工艺管道', '', '', '', '', ''],
    ['2', '二氧化氯发生器', '50g', '宁波动力', '台', '2', '30000', '60000'],
    ['3', '电机', '15kw', '西门子', '台', '3', '8000', '24000'],
    ['以上价格不含税，含运费', '', '', '', '', '', '', '']
  ];

  const worksheet = XLSX.utils.aoa_to_sheet(testData);
  XLSX.utils.book_append_sheet(workbook, worksheet, '报价单');

  return XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
}
