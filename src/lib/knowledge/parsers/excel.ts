/**
 * Excel 解析器：xlsx 提取所有 sheet 单元格文本 + 行列统计
 * 使用 xlsx (SheetJS)
 */
import type { ParseResult } from './types';

export async function parseExcelFile(buffer: Buffer): Promise<ParseResult> {
  try {
    const mod: any = await import('xlsx');
    const XLSX = mod?.default ?? mod;

    const workbook = XLSX.read(buffer, { type: 'buffer' });
    const sheets = workbook.SheetNames || [];

    const parts: string[] = [];
    let totalRows = 0;
    let maxCols = 0;

    for (const name of sheets) {
      const ws = workbook.Sheets[name];
      if (!ws) continue;
      const csv = XLSX.utils.sheet_to_csv(ws, { blankrows: false });
      if (csv.trim()) parts.push(`【Sheet: ${name}】\n${csv.trim()}`);
      // 统计行列（基于 !ref 范围，如 "A1:D50"）
      if (ws['!ref']) {
        const ref = String(ws['!ref']).split(':');
        if (ref.length >= 2) {
          try {
            const lastCell = ref[1];
            const colMatch = lastCell.match(/[A-Z]+/);
            const rowMatch = lastCell.match(/\d+/);
            if (colMatch) maxCols = Math.max(maxCols, colLetterToNumber(colMatch[0]));
            if (rowMatch) totalRows += Number(rowMatch[0]);
          } catch { /* ignore */ }
        }
      }
    }

    let text = parts.join('\n\n').trim();
    const characters = text.length;
    if (text.length > 100_000) text = text.slice(0, 100_000);

    return {
      ok: true,
      text,
      metadata: {
        format: 'excel',
        sheets: sheets.length,
        rows: totalRows,
        cols: maxCols,
        characters,
        textPreview: characters > 0 ? text.slice(0, 200) : '',
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      text: '',
      metadata: { format: 'excel', error: err?.message || 'Excel 解析失败' },
    };
  }
}

/** 列字母转数字（A=1, Z=26, AA=27...） */
function colLetterToNumber(letters: string): number {
  let n = 0;
  for (const ch of letters.toUpperCase()) {
    n = n * 26 + (ch.charCodeAt(0) - 64);
  }
  return n;
}
