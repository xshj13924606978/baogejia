/**
 * CAD 解析器：DXF 文本实体提取；DWG/DWF 二进制降级提取可打印字符串
 * DXF 为 ASCII 文本格式：解析 (group code, value) 对，提取 TEXT/MTEXT/LTEXT/ATTRIB 实体文本
 */
import type { ParseResult } from './types';

export function isDxfFile(buffer: Buffer): boolean {
  // DXF 是文本格式，以 "0" 开头的 section 结构
  const head = buffer.subarray(0, 1024).toString('utf8');
  return head.includes('SECTION') || head.includes('ENTITIES') || /^0\r?\n/.test(head);
}

/** 提取二进制中的可打印 ASCII 字符串（长度 ≥ 3） */
function extractPrintableStrings(buffer: Buffer, minLen = 3, maxCount = 500): string[] {
  const out: string[] = [];
  let current = '';
  for (let i = 0; i < buffer.length && out.length < maxCount; i++) {
    const b = buffer[i];
    if (b >= 32 && b < 127) {
      current += String.fromCharCode(b);
    } else {
      if (current.length >= minLen) out.push(current);
      current = '';
    }
  }
  if (current.length >= minLen) out.push(current);
  return out;
}

export async function parseCadFile(buffer: Buffer): Promise<ParseResult> {
  try {
    if (isDxfFile(buffer)) {
      // DXF 文本解析：提取 (code, value) 对中的文本实体
      const text = buffer.toString('utf8');
      const lines = text.split(/\r?\n/);
      const texts: string[] = [];
      // 记录每个 group code 后面跟的值
      for (let i = 0; i < lines.length - 1; i++) {
        const code = lines[i].trim();
        const value = lines[i + 1];
        // 文本实体 group code：1（文本值）、3（MTEXT 多行文本）
        if (code === '1' || code === '3') {
          const v = value?.trim();
          if (v && v.length > 0) texts.push(v);
        }
      }
      // 去重 + 截断
      const unique = Array.from(new Set(texts));
      let joined = unique.join('\n').trim();
      const characters = joined.length;
      if (joined.length > 100_000) joined = joined.slice(0, 100_000);

      return {
        ok: true,
        text: joined,
        metadata: {
          format: 'dxf',
          entities: unique.length,
          characters,
          textPreview: joined.slice(0, 200),
        },
      };
    }

    // DWG/DWF 二进制：降级提取可打印字符串（可能包含图块名/文字）
    const strings = extractPrintableStrings(buffer);
    let joined = strings.join('\n').trim();
    const characters = joined.length;
    if (joined.length > 50_000) joined = joined.slice(0, 50_000);

    return {
      ok: joined.length > 0,
      text: joined,
      metadata: {
        format: 'cad-binary',
        entities: strings.length,
        characters,
        textPreview: joined.slice(0, 200),
        ...(joined.length === 0 ? { error: '二进制 CAD 文件无法提取文本内容' } : {}),
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      text: '',
      metadata: { format: 'cad', error: err?.message || 'CAD 解析失败' },
    };
  }
}
