/**
 * 图片解析器：尺寸解析（自实现 header 解析，零依赖）+ OCR（tesseract.js，可选增强）
 * OCR 失败/超时/网络不可用时静默降级，不影响上传
 */
import type { ParseResult } from './types';

const OCR_MAX_SIZE = 3 * 1024 * 1024; // 仅 ≤3MB 图片尝试 OCR
const OCR_TIMEOUT = 15_000;
// 进程级缓存：OCR 环境不可用（CDN 不可达/初始化失败）后不再等待，后续图片直接跳过 OCR
let ocrUnavailable = false;

/** 解析图片宽高（PNG/JPEG/GIF/WebP/BMP，返回 null 表示无法识别） */
export function getImageSize(buffer: Buffer): { width: number; height: number } | null {
  try {
    // PNG
    if (buffer.length >= 24 && buffer[0] === 0x89 && buffer[1] === 0x50 && buffer[2] === 0x4e && buffer[3] === 0x47) {
      return { width: buffer.readUInt32BE(16), height: buffer.readUInt32BE(20) };
    }
    // GIF
    if (buffer.length >= 10 && buffer[0] === 0x47 && buffer[1] === 0x49 && buffer[2] === 0x46) {
      return { width: buffer.readUInt16LE(6), height: buffer.readUInt16LE(8) };
    }
    // JPEG：扫描 SOF0-SOF15 段
    if (buffer.length >= 4 && buffer[0] === 0xff && buffer[1] === 0xd8) {
      let offset = 2;
      while (offset + 9 < buffer.length) {
        if (buffer[offset] !== 0xff) { offset += 1; continue; }
        const marker = buffer[offset + 1];
        // SOF0, SOF1, SOF2(progressive) 等
        if (marker >= 0xc0 && marker <= 0xcf && marker !== 0xc4 && marker !== 0xc8 && marker !== 0xcc) {
          return { height: buffer.readUInt16BE(offset + 5), width: buffer.readUInt16BE(offset + 7) };
        }
        const segLen = buffer.readUInt16BE(offset + 2);
        offset += 2 + segLen;
      }
    }
    // WebP
    if (buffer.length >= 30 && buffer.toString('latin1', 0, 4) === 'RIFF' && buffer.toString('latin1', 8, 12) === 'WEBP') {
      const fourcc = buffer.toString('latin1', 12, 16);
      if (fourcc === 'VP8 ' && buffer.length >= 30) {
        return { width: buffer.readUInt16LE(26) & 0x3fff, height: buffer.readUInt16LE(28) & 0x3fff };
      }
      if (fourcc === 'VP8L' && buffer.length >= 25) {
        const b = buffer.subarray(21, 25);
        const width = 1 + (((b[1] & 0x3f) << 8) | b[0]);
        const height = 1 + (((b[3] & 0xf) << 10) | (b[2] << 2) | ((b[1] & 0xc0) >> 6));
        return { width, height };
      }
      if (fourcc === 'VP8X' && buffer.length >= 30) {
        const b = buffer.subarray(24, 30);
        const width = 1 + ((b[0] | (b[1] << 8) | (b[2] << 16)) & 0xffffff);
        const height = 1 + ((b[3] | (b[4] << 8) | (b[5] << 16)) & 0xffffff);
        return { width, height };
      }
    }
    // BMP
    if (buffer.length >= 26 && buffer[0] === 0x42 && buffer[1] === 0x4d) {
      return { width: buffer.readInt32LE(18), height: Math.abs(buffer.readInt32LE(22)) };
    }
    return null;
  } catch {
    return null;
  }
}

async function ocrImage(buffer: Buffer): Promise<string> {
  // 整个 OCR 流程（含 worker 下载/初始化/识别）用 Promise.race 严格限时，
  // 超时即放弃（网络受限/CDN 不可达时不让上传请求挂起）
  let worker: any = null;
  const doOcr = async (): Promise<string> => {
    const Tesseract: any = await import('tesseract.js');
    const createWorker = Tesseract?.default?.createWorker ?? Tesseract?.createWorker;
    if (typeof createWorker !== 'function') return '';
    worker = await createWorker('eng');
    const { data } = await worker.recognize(buffer);
    return (data?.text || '').trim();
  };

  const timeout = new Promise<string>((resolve) => {
    setTimeout(() => {
      try { worker?.terminate?.(); } catch { /* ignore */ }
      resolve('');
    }, OCR_TIMEOUT);
  });

  try {
    return await Promise.race([doOcr(), timeout]);
  } catch {
    return '';
  } finally {
    try { await worker?.terminate?.(); } catch { /* ignore */ }
  }
}

export async function parseImageFile(buffer: Buffer): Promise<ParseResult> {
  const size = getImageSize(buffer);
  const metadata: ParseResult['metadata'] = {
    format: 'image',
    ...(size ? { width: size.width, height: size.height } : {}),
    characters: 0,
  };

  // OCR：仅小图尝试，失败静默降级（环境不可达后跳过，避免拖慢上传）
  if (buffer.length <= OCR_MAX_SIZE && !ocrUnavailable) {
    const ocrText = await ocrImage(buffer);
    if (ocrText) {
      metadata.ocrText = ocrText.slice(0, 5000);
      metadata.characters = ocrText.length;
      metadata.textPreview = ocrText.slice(0, 200);
    } else {
      ocrUnavailable = true; // OCR 无输出 → 标记不可用（网络/CDN 受限），后续跳过
    }
  }

  return { ok: true, text: metadata.ocrText || '', metadata };
}
