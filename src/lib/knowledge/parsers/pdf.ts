/**
 * PDF 解析器：提取文本 + 页数 + 文档元数据
 *
 * 主路径：pdf-parse（pdf.js 旧版）。
 * 兜底路径：pdf-parse 对现代 PDF（对象流 XRef）可能抛 "bad XRef entry"，
 *           此时用轻量正则从 PDF 原始流提取文本操作符（Tj/TJ），零依赖兜底。
 * 扫描件（无文本层）：正常返回空文本（chars=0），不阻塞上传。
 */
import type { ParseResult } from './types';

const MAX_TEXT_LENGTH = 200_000; // 全文上限（防止超大 PDF 撑爆 content_text）

/** 从 PDF 原始字节流提取文本（兜底路径） */
function extractPdfTextRaw(buffer: Buffer): { text: string; pages: number } {
  const raw = buffer.toString('latin1');
  const chunks: string[] = [];

  // 提取文本操作符：(...) Tj  与  [(...)(...)] TJ
  const opRegex = /\(((?:[^()\\]|\\.)*)\)\s*Tj|\[((?:[^\[\]\\]|\\.)*)\]\s*TJ/g;
  let m: RegExpExecArray | null;
  while ((m = opRegex.exec(raw)) !== null) {
    const group = m[1] ?? m[2] ?? '';
    // 按括号拆分多段并解码转义
    const parts = group.split(/(?<!\\)\(|(?<!\\)\)/g).filter(Boolean);
    for (const part of parts) {
      const decoded = part
        .replace(/\\([nrtbf()\\])/g, (_s, ch: string) => {
          const map: Record<string, string> = { n: '\n', r: '\r', t: '\t', b: '\b', f: '\f' };
          return map[ch] ?? ch;
        })
        .replace(/\\\d{1,3}/g, '');
      if (decoded.trim()) chunks.push(decoded);
    }
  }

  // 页数：取 Pages 对象 Count（多个时取最大值）
  let pages = 0;
  const countRegex = /\/Count\s+(\d+)/g;
  while ((m = countRegex.exec(raw)) !== null) {
    pages = Math.max(pages, Number(m[1]));
  }

  return { text: chunks.join('\n'), pages };
}

export async function parsePdfFile(buffer: Buffer): Promise<ParseResult> {
  try {
    // 懒加载：pdf-parse 为 CJS 库且无类型定义，在 Next standalone 中按需加载
    const mod: any = await import('pdf-parse');
    const pdfParse: any = mod?.default ?? mod;
    if (typeof pdfParse === 'function') {
      try {
        const data = await pdfParse(buffer);
        let text = (data?.text || '').trim();
        const characters = text.length;
        if (text.length > MAX_TEXT_LENGTH) text = text.slice(0, MAX_TEXT_LENGTH);

        const info = data?.info || {};
        const metadata: ParseResult['metadata'] = {
          format: 'pdf',
          pages: Number(data?.numpages) || 0,
          characters,
          textPreview: characters > 0 ? text.slice(0, 200) : '',
        };

        // 补充 PDF 内部元数据（标题/作者等，存在时写入）
        const meta: Record<string, any> = {};
        if (info.Title) meta.title = String(info.Title);
        if (info.Author) meta.author = String(info.Author);
        if (info.CreationDate) meta.creationDate = String(info.CreationDate);
        if (info.ModDate) meta.modDate = String(info.ModDate);
        if (info.Producer) meta.producer = String(info.Producer);

        return {
          ok: true,
          text,
          metadata: { ...metadata, ...(Object.keys(meta).length > 0 ? { pdfMeta: meta } : {}) },
        };
      } catch (pdfErr: any) {
        // pdf-parse 失败（现代 PDF XRef 兼容问题）→ 原始流兜底
        const { text: rawText, pages } = extractPdfTextRaw(buffer);
        const characters = rawText.length;
        return {
          ok: true,
          text: rawText,
          metadata: {
            format: 'pdf',
            pages,
            characters,
            textPreview: characters > 0 ? rawText.slice(0, 200) : '',
            ...(characters === 0 ? { error: '无法提取文本（可能为扫描件或加密 PDF）' } : {}),
            fallback: true,
          },
        };
      }
    }
    return { ok: false, text: '', metadata: { format: 'pdf', error: '解析器加载失败' } };
  } catch (err: any) {
    return {
      ok: false,
      text: '',
      metadata: { format: 'pdf', error: err?.message || 'PDF 解析失败' },
    };
  }
}
