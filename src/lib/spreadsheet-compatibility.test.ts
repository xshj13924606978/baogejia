import { describe, expect, it } from 'vitest';
import * as XLSX from 'xlsx';

describe('spreadsheet import/export compatibility', () => {
  it('round-trips Chinese quote rows, zero and decimal values through an XLSX file', () => {
    const rows = [
      { 产品: '阀门 DN50', 数量: 0, 单价: 12.35, 备注: '中文与 emoji ✅' },
      { 产品: '管材', 数量: 2, 单价: 100.5, 备注: '' },
    ];
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.json_to_sheet(rows), '报价明细');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const parsed = XLSX.read(bytes, { type: 'array' });
    expect(XLSX.utils.sheet_to_json(parsed.Sheets['报价明细'], { defval: '' })).toEqual(rows);
  });
  it('preserves separate sheets and user text beginning with an equals sign', () => {
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['备注'], ['=ordinary user text']]), '说明');
    XLSX.utils.book_append_sheet(workbook, XLSX.utils.aoa_to_sheet([['数量'], [3]]), '数量');
    const bytes = XLSX.write(workbook, { type: 'array', bookType: 'xlsx' });
    const parsed = XLSX.read(bytes, { type: 'array' });
    expect(parsed.SheetNames).toEqual(['说明', '数量']);
    expect(parsed.Sheets['说明'].A2.v).toBe('=ordinary user text');
    expect(parsed.Sheets['说明'].A2.f).toBeUndefined();
    expect(parsed.Sheets['数量'].A2.v).toBe(3);
  });
});
