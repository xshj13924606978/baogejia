/**
 * Word 解析器：docx 使用 mammoth 提取文本；旧版 .doc（OLE 二进制）优雅降级
 */
import type { ParseResult } from './types';

const OLE_MAGIC = Buffer.from([0xd0, 0xcf, 0x11, 0xe0, 0xa1, 0xb1, 0x1a, 0xe1]);

/** 检测是否为 OLE 复合文档（.doc/.xls/.ppt 旧格式） */
export function isOleDocument(buffer: Buffer): boolean {
  return buffer.length >= 8 && buffer.subarray(0, 8).equals(OLE_MAGIC);
}

export async function parseWordFile(buffer: Buffer, fileName?: string): Promise<ParseResult> {
  try {
    // 旧版 .doc：OLE 二进制，mammoth 不支持 → 优雅降级（不影响上传）
    if (isOleDocument(buffer)) {
      return {
        ok: false,
        text: '',
        metadata: {
          format: 'word',
          error: '旧版 .doc 格式暂不支持全文解析（建议另存为 .docx 后重新上传）',
        },
      };
    }

    const mammoth: any = await import('mammoth');
    const extract = mammoth?.default?.extractRawText ?? mammoth?.extractRawText;
    if (typeof extract !== 'function') {
      return { ok: false, text: '', metadata: { format: 'word', error: '解析器加载失败' } };
    }

    const result = await extract({ buffer });
    const text = (result?.value || '').trim();
    const characters = text.length;

    return {
      ok: true,
      text,
      metadata: {
        format: 'word',
        characters,
        textPreview: characters > 0 ? text.slice(0, 200) : '',
      },
    };
  } catch (err: any) {
    return {
      ok: false,
      text: '',
      metadata: { format: 'word', error: err?.message || 'Word 解析失败' },
    };
  }
}
