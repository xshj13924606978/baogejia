import * as XLSX from 'xlsx';

/**
 * 修复 Excel 工作表中的上标字符丢失问题
 *
 * 问题：当 Excel 单元格使用富文本格式（如 "m" + 上标 "3"）或自定义数字格式（如 0"m³"）时，
 * XLSX 库解析可能丢失上标字符，导致 "40m³" 变成 "40m" 或 "40m3"。
 *
 * 本函数遍历工作表所有单元格，检测并修复：
 * 1. 富文本(rich text)中的上标字符 → 转为 Unicode 上标字符（³ → ³, ² → ²）
 * 2. 数字格式(number format)中包含 m³/m² 但格式化值丢失了上标 → 补回
 */

// 数字到 Unicode 上标字符的映射
const SUPERSCRIPT_MAP: Record<string, string> = {
  '0': '\u2070', '1': '\u00B9', '2': '\u00B2', '3': '\u00B3', '4': '\u2074',
  '5': '\u2075', '6': '\u2076', '7': '\u2077', '8': '\u2078', '9': '\u2079',
  'n': '\u207F', '-': '\u207B', '+': '\u207A',
};

/**
 * 将普通数字字符串转换为 Unicode 上标字符串
 * 例如: "3" → "³", "12" → "¹²"
 */
function toSuperscript(text: string): string {
  return text.split('').map(c => SUPERSCRIPT_MAP[c] || c).join('');
}

/**
 * 处理单个单元格，修复上标丢失问题
 */
function fixCell(cell: XLSX.CellObject): boolean {
  let fixed = false;

  // 1. 处理富文本(rich text)中的上标
  // Excel 中上标通过 r[].pr.vertAlign = 'superscript' 或 'baseline' 表示
  if (cell.r && Array.isArray(cell.r)) {
    let text = '';
    let hasSuperscript = false;

    for (const run of cell.r) {
      let runText = run.t || '';
      if (run.pr && run.pr.vertAlign === 'superscript') {
        hasSuperscript = true;
        runText = toSuperscript(runText);
      }
      text += runText;
    }

    if (hasSuperscript) {
      cell.v = text;
      cell.w = text;
      fixed = true;
    }
  }

  // 2. 处理数字格式中包含上标但格式化值丢失的情况
  // 例如：单元格值 40，格式 #,##0"m³"，XLSX 可能只输出 "40m"
  if (cell.z && typeof cell.z === 'string' && cell.w && typeof cell.w === 'string') {
    const fmt = cell.z;
    const w = cell.w;

    // 检测格式中是否包含 m³ (Unicode \u00B3 或 \u00B3 的转义形式)
    if (fmt.includes('\u00B3') || fmt.includes('m3') || fmt.includes('m\u00B3')) {
      // 如果格式化值包含 "m" 但不包含 "³"，说明上标丢失
      if (w.includes('m') && !w.includes('³')) {
        // 只替换结尾的 m → m³，避免误替换名称中的 m
        cell.w = w.replace(/m$/, 'm³');
        cell.v = cell.w;
        fixed = true;
      }
    }

    // 同理处理 m²
    if (fmt.includes('\u00B2') || fmt.includes('m2') || fmt.includes('m\u00B2')) {
      if (w.includes('m') && !w.includes('²')) {
        cell.w = w.replace(/m$/, 'm²');
        cell.v = cell.w;
        fixed = true;
      }
    }
  }

  return fixed;
}

/**
 * 修复 Excel 工作表中的上标字符丢失问题
 * 在调用 sheet_to_json 之前使用
 *
 * @param worksheet - XLSX 工作表对象
 * @returns 是否进行了修复
 */
export function fixWorksheetSuperscript(worksheet: XLSX.WorkSheet): boolean {
  if (!worksheet || !worksheet['!ref']) return false;

  const range = XLSX.utils.decode_range(worksheet['!ref']);
  let fixed = false;

  for (let R = range.s.r; R <= range.e.r; ++R) {
    for (let C = range.s.c; C <= range.e.c; ++C) {
      const addr = XLSX.utils.encode_cell({ r: R, c: C });
      const cell = worksheet[addr];
      if (cell && fixCell(cell)) {
        fixed = true;
      }
    }
  }

  if (fixed) {
    console.log('[Excel Superscript Fix] 已修复工作表中的上标字符');
  }

  return fixed;
}
