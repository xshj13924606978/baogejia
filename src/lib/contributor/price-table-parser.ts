/**
 * 价格表文件解析工具（资料贡献上传页面使用）
 *
 * - 支持 .xlsx / .xls：XLSX 库解析 + 上标字符修复
 * - 支持 .csv：编码自动检测 + 手动解析（避免中文乱码）
 *
 * 实现与 src/components/knowledge-center/price-library.tsx 保持一致
 * 创建时间: 2026-08-19
 */

import { fixWorksheetSuperscript } from '@/utils/excel-superscript-fix';

export interface ParsedPriceTable {
  headers: string[];
  rows: Record<string, string>[];
}

// 检测文本编码并解码（按优先级尝试，fatal 模式失败则换下一个）
const decodeWithEncoding = (buffer: ArrayBuffer): string => {
  const encodings = ['UTF-8', 'GBK', 'GB2312', 'BIG5', 'UTF-16LE', 'UTF-16BE'];

  for (const encoding of encodings) {
    try {
      const decoder = new TextDecoder(encoding, { fatal: true });
      const text = decoder.decode(buffer);

      // 检查解码后的文本是否有效
      if (isValidText(text)) {
        return text;
      }
    } catch (e) {
      // 该编码解码失败，尝试下一个
      continue;
    }
  }

  // 如果所有编码都失败，使用 UTF-8 的 non-fatal 模式
  console.warn('[price-table-parser] 所有编码检测失败，使用 UTF-8 宽松模式');
  return new TextDecoder('UTF-8', { fatal: false }).decode(buffer);
};

// 检查文本是否有效（不包含过多乱码字符）
const isValidText = (text: string): boolean => {
  if (!text || text.length === 0) return false;

  // 计算无效字符的比例
  let invalidCount = 0;
  const checkLength = Math.min(text.length, 1000);

  for (let i = 0; i < checkLength; i++) {
    const charCode = text.charCodeAt(i);

    // 检查是否是常见的无效字符
    if (
      charCode === 65533 || // 替换字符 (�)
      (charCode >= 0xdc00 && charCode <= 0xdfff) || // 低代理项
      (charCode >= 0xd800 && charCode <= 0xdbff)
    ) {
      // 高代理项
      invalidCount++;
    }
  }

  // 如果无效字符比例超过5%，认为解码失败
  const invalidRatio = invalidCount / checkLength;
  return invalidRatio < 0.05;
};

// 修复乱码字符 - 增强版
// 处理 UTF-8 被错误解码为 Latin-1 (ISO-8859-1) 的情况
const fixMojibake = (text: string): string => {
  if (!text || typeof text !== 'string') return text;

  // 如果已经是正常中文（包含常见中文字符范围），直接返回
  if (/[\u4e00-\u9fa5]/.test(text)) {
    return text;
  }

  let fixed = text;
  let attempts = 0;
  const maxAttempts = 3;

  while (attempts < maxAttempts) {
    try {
      // 尝试将字符串按 Latin-1 编码转回字节，再用 UTF-8 解码
      // 这是最常见的乱码情况：UTF-8 字节被当作 Latin-1 解读
      const latin1Bytes = new Uint8Array(fixed.length);
      for (let i = 0; i < fixed.length; i++) {
        latin1Bytes[i] = fixed.charCodeAt(i) & 0xff;
      }

      // 尝试用 UTF-8 解码
      const decoder = new TextDecoder('utf-8', { fatal: false });
      const utf8Result = decoder.decode(latin1Bytes);

      // 检查解码后是否包含中文
      if (/[\u4e00-\u9fa5]/.test(utf8Result)) {
        // 如果包含中文且不是全是乱码，接受这个结果
        const mojibakeRatio = (utf8Result.match(/[Ãâ¡¢£¤¥¦§¨©ª«¬­®¯°±²³´µ¶·¸¹º»¼½¾¿ÀÁÂÃÄÅÆÇÈÉÊËÌÍÎÏÐÑÒÓÔÕÖ×ØÙÚÛÜÝÞßàáâãäåæçèéêëìíîïðñòóôõö÷øùúûüýþÿ]/g) || []).length;
        const totalChars = utf8Result.length;

        // 如果乱码字符比例低于30%，认为是有效修复
        if (mojibakeRatio / totalChars < 0.3) {
          fixed = utf8Result;
          break;
        }
      }
    } catch (e) {
      console.warn('[price-table-parser] fixMojibake attempt failed:', e);
    }

    attempts++;

    // 如果没有进展，跳出循环
    if (fixed === text) break;
  }

  // 最后清理残留的乱码字符
  // 匹配 UTF-8 伪序列（高字节+后续字节），以及孤立的 Latin 扩展乱码首字节
  // 但保留合法字符：³²°µ×÷¼½¾±§¤¥¦©®«»¶·¸¹º¨¬¯等
  const validLatinChars = new Set([
    '×', '÷', 'µ', '°', '²', '³', '¼', '½', '¾', '±', '§', '¤', '¥', '¦', '©', '®', '«', '»', '¶', '·', '¸', '¹', 'º', '¨', '¬', '¯', '¡', '¿',
  ]);
  return fixed
    .replace(
      /(?:[\u00C0-\u00FF][\u0080-\u00BF]{1,2})+|[\u00C0-\u00C6\u00C8-\u00CF\u00D0-\u00D6\u00D8-\u00DE\u00E0-\u00F6\u00F8-\u00FF]/g,
      (match) => (match.length === 1 && validLatinChars.has(match) ? match : '')
    )
    .trim();
};

// 递归修复数据中的所有字符串乱码 - 增强版
// 处理对象、数组和字符串
const fixDataMojibake = (data: any): any => {
  if (Array.isArray(data)) {
    return data.map((item) => fixDataMojibake(item));
  } else if (data && typeof data === 'object') {
    const result: any = {};
    for (const key in data) {
      if (Object.prototype.hasOwnProperty.call(data, key)) {
        // 修复键名和键值
        const fixedKey = fixMojibake(key);
        result[fixedKey] = fixDataMojibake(data[key]);
      }
    }
    return result;
  } else if (typeof data === 'string') {
    // 如果是字符串，进行深度修复
    let fixed = fixMojibake(data);

    // 针对特别长的文本，进行分段修复
    if (fixed.length > 100 && fixed.includes('Ã') && !/[\u4e00-\u9fa5]/.test(fixed)) {
      // 尝试更激进的修复：将字符串按字节重新解释
      try {
        const bytes = new Uint8Array(fixed.length);
        for (let i = 0; i < fixed.length; i++) {
          bytes[i] = fixed.charCodeAt(i) & 0xff;
        }
        const alternative = new TextDecoder('utf-8', { fatal: false }).decode(bytes);
        if (/[\u4e00-\u9fa5]/.test(alternative)) {
          fixed = alternative;
        }
      } catch (e) {
        // 忽略错误
      }
    }

    return fixed;
  }
  return data;
};

// 手动解析 CSV，避免 XLSX 库的编码问题
const parseCSV = (csvText: string): { headers: string[]; data: any[] } => {
  if (!csvText) return { headers: [], data: [] };

  // 按行分割
  const lines = csvText.split(/\r?\n/).filter((line) => line.trim() !== '');
  if (lines.length === 0) return { headers: [], data: [] };

  // 解析 CSV 行（处理引号内的逗号）
  const parseCSVLine = (line: string): string[] => {
    const result: string[] = [];
    let current = '';
    let inQuotes = false;

    for (let i = 0; i < line.length; i++) {
      const char = line[i];

      if (char === '"') {
        // 处理引号
        if (inQuotes && line[i + 1] === '"') {
          // 转义的引号
          current += '"';
          i++;
        } else {
          inQuotes = !inQuotes;
        }
      } else if (char === ',' && !inQuotes) {
        // 逗号分隔符
        result.push(current);
        current = '';
      } else {
        current += char;
      }
    }

    result.push(current);
    return result;
  };

  // 第一行是标题
  const headers = parseCSVLine(lines[0]);

  // 解析数据行
  const data: any[] = [];
  for (let i = 1; i < lines.length; i++) {
    const values = parseCSVLine(lines[i]);
    if (values.length === headers.length && values.some((v) => v.trim() !== '')) {
      const row: any = {};
      headers.forEach((header, index) => {
        // 这里不进行修复，后面统一修复
        row[header] = values[index] || '';
      });
      data.push(row);
    }
  }

  return { headers, data };
};

/**
 * 解析价格表文件（.xls / .xlsx / .csv）
 * @throws 解析失败时抛出错误
 */
export const parsePriceTableFile = async (file: File): Promise<ParsedPriceTable> => {
  const fileName = file.name.toLowerCase();
  const buffer = await file.arrayBuffer();

  if (fileName.endsWith('.csv')) {
    // CSV：编码自动检测 + 手动解析
    const text = decodeWithEncoding(buffer);
    const parsed = parseCSV(text);
    return { headers: parsed.headers, rows: fixDataMojibake(parsed.data) };
  }

  // .xls / .xlsx：XLSX 库解析
  const XLSX = await import('xlsx');
  const workbook = XLSX.read(buffer, { type: 'array', cellDates: true, cellText: true, codepage: 65001 });
  const sheet = workbook.Sheets[workbook.SheetNames[0]];
  if (!sheet) {
    throw new Error('无法解析文件内容');
  }

  fixWorksheetSuperscript(sheet);
  const jsonData = XLSX.utils.sheet_to_json<Record<string, unknown>>(sheet, {
    defval: '',
    raw: false,
    dateNF: 'yyyy-mm-dd',
    blankrows: false,
  });

  const headers = jsonData.length > 0 ? Object.keys(jsonData[0] || {}) : [];
  return { headers, rows: fixDataMojibake(jsonData) };
};
