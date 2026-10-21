/**
 * 解析器工厂：根据文件类型（扩展名/MIME）路由到对应解析器
 * 约束：解析器失败必须优雅降级（返回 ok:false 而非抛错），不影响上传
 */
import type { ParseResult } from './types';
import { parsePdfFile } from './pdf';
import { parseWordFile, isOleDocument } from './word';
import { parseExcelFile } from './excel';
import { parseImageFile } from './image';
import { parseCadFile, isDxfFile } from './cad';

const TEXT_MAX_LENGTH = 500_000;

/** 纯文本/CSV：直接按 UTF-8 解码（含常见编码兜底） */
function parseTextFile(buffer: Buffer): ParseResult {
  let text = '';
  // 优先 UTF-8；含 BOM 时剥离
  let body = buffer;
  if (buffer.length >= 3 && buffer[0] === 0xef && buffer[1] === 0xbb && buffer[2] === 0xbf) {
    body = buffer.subarray(3);
  }
  text = body.toString('utf8');
  // 若解码后仍含大量替换字符，尝试 latin1 兜底
  if ((text.match(/\uFFFD/g) || []).length > 10) {
    text = buffer.toString('latin1');
  }
  text = text.trim();
  const characters = text.length;
  if (text.length > TEXT_MAX_LENGTH) text = text.slice(0, TEXT_MAX_LENGTH);
  return {
    ok: true,
    text,
    metadata: {
      format: 'text',
      characters,
      textPreview: characters > 0 ? text.slice(0, 200) : '',
    },
  };
}

/** 根据文件名/扩展名 + MIME 判断格式 */
function detectFormat(fileName: string, mime?: string): string {
  const ext = (fileName.split('.').pop() || '').toLowerCase();
  const mimeLower = (mime || '').toLowerCase();
  if (ext === 'pdf' || mimeLower === 'application/pdf') return 'pdf';
  if (['doc', 'docx', 'docm', 'rtf'].includes(ext)) return 'word';
  if (['xls', 'xlsx', 'xlsm', 'csv'].includes(ext)) return 'excel';
  if (['png', 'jpg', 'jpeg', 'gif', 'webp', 'bmp', 'tiff', 'tif', 'svg', 'heic'].includes(ext)) return 'image';
  if (['dxf', 'dwg', 'dwt', 'dwf'].includes(ext)) return 'cad';
  if (['txt', 'md', 'log', 'json', 'xml', 'html', 'htm'].includes(ext)) return 'text';
  if (mimeLower.startsWith('image/')) return 'image';
  if (mimeLower === 'text/plain' || mimeLower.includes('text/')) return 'text';
  return 'unknown';
}

/**
 * 统一解析入口：任何文件 → ParseResult（永不抛错）
 */
export async function parseKnowledgeFile(
  buffer: Buffer,
  fileName: string,
  mime?: string,
): Promise<ParseResult> {
  const format = detectFormat(fileName, mime);
  try {
    switch (format) {
      case 'pdf':
        return await parsePdfFile(buffer);
      case 'word':
        return await parseWordFile(buffer, fileName);
      case 'excel':
        // 旧版 .xls（OLE）xlsx 库可读，无需降级；CSV 走文本
        if (fileName.toLowerCase().endsWith('.csv')) return parseTextFile(buffer);
        return await parseExcelFile(buffer);
      case 'image':
        return await parseImageFile(buffer);
      case 'cad':
        return await parseCadFile(buffer);
      case 'text':
        return parseTextFile(buffer);
      default:
        // 未知格式：尽力而为——文本文件尝试直接解码，二进制返回空
        if (isOleDocument(buffer) && !mime) {
          // OLE 复合文档（.doc/.xls/.ppt 旧格式）按扩展名再判断
          const ext = (fileName.split('.').pop() || '').toLowerCase();
          if (['doc', 'docm'].includes(ext)) return await parseWordFile(buffer, fileName);
          if (['xls', 'xlsm'].includes(ext)) return await parseExcelFile(buffer);
        }
        return {
          ok: true,
          text: '',
          metadata: { format, characters: 0, error: '暂不支持该格式解析（上传不受影响）' },
        };
    }
  } catch (err: any) {
    // 兜底：任何解析器异常都不影响上传
    return {
      ok: false,
      text: '',
      metadata: { format, error: err?.message || '解析失败' },
    };
  }
}

export { isDxfFile, isOleDocument };
