import * as XLSX from 'xlsx';
import mammoth from 'mammoth';

// 使用更稳定的 pdf-parse 1.1.1
import pdfParse from 'pdf-parse';
import { OcrHelper } from '@/utils/ocr-helper';

export type InputType = 'text' | 'image' | 'excel' | 'word' | 'pdf' | 'unknown';

export interface ProcessedInput {
  type: InputType;
  rawContent: any;
  textContent: string;
  metadata: {
    fileName?: string;
    fileSize?: number;
    mimeType?: string;
    pageCount?: number;
    imageUrl?: string;
    error?: string;
  };
}

export class InputProcessor {
  /**
   * 处理用户输入（可能是文本或文件）
   */
  async process(input: {
    type: 'text' | 'file';
    content: string | Buffer;
    mimeType?: string;
    fileName?: string;
  }): Promise<ProcessedInput> {
    
    // 情况1：纯文本输入
    if (input.type === 'text' && typeof input.content === 'string') {
      return {
        type: 'text',
        rawContent: input.content,
        textContent: input.content,
        metadata: {}
      };
    }
    
    // 情况2：文件上传
    if (input.type === 'file') {
      return this.processFile(input.content as Buffer, {
        mimeType: input.mimeType,
        fileName: input.fileName
      });
    }
    
    throw new Error('不支持的输入格式');
  }
  
  /**
   * 处理文件
   */
  private async processFile(
    fileBuffer: Buffer, 
    metadata: { mimeType?: string; fileName?: string }
  ): Promise<ProcessedInput> {
    
    const mime = metadata.mimeType || '';
    const fileName = metadata.fileName || '';
    
    // 1. 图片文件 - 使用OCR提取文本
    if (mime.startsWith('image/')) {
      try {
        console.log('[InputProcessor] 开始处理图片文件:', fileName);
        const ocrHelper = new OcrHelper();

        // 使用 OCR 识别图片中的文本
        const ocrResult = await ocrHelper.recognizeImage(fileBuffer);

        let textContent = '';
        if (ocrResult.text && ocrResult.text.trim().length > 0) {
          textContent = ocrResult.text;
          console.log('[InputProcessor] OCR 识别成功，文本长度:', textContent.length);
        } else {
          textContent = `[图片文件: ${fileName} - OCR识别失败]`;
          console.warn('[InputProcessor] OCR 识别失败，返回占位符');
        }

        return {
          type: 'image',
          rawContent: fileBuffer,
          textContent,
          metadata: {
            fileName,
            fileSize: fileBuffer.length,
            mimeType: mime,
          }
        };
      } catch (error) {
        console.error('[InputProcessor] 图片处理失败:', error);
        return {
          type: 'image',
          rawContent: fileBuffer,
          textContent: `[图片文件: ${fileName} - 处理失败]`,
          metadata: {
            fileName,
            fileSize: fileBuffer.length,
            mimeType: mime,
            error: error instanceof Error ? error.message : '处理失败'
          }
        };
      }
    }
    
    // 2. Excel文件
    if (mime.includes('spreadsheet') || mime.includes('excel') || fileName.endsWith('.xlsx') || fileName.endsWith('.xls')) {
      try {
        const workbook = XLSX.read(fileBuffer);
        let textContent = '';
        
        workbook.SheetNames.forEach(sheetName => {
          const sheet = workbook.Sheets[sheetName];
          const sheetText = XLSX.utils.sheet_to_txt(sheet);
          textContent += `【Sheet: ${sheetName}】\n${sheetText}\n\n`;
        });
        
        return {
          type: 'excel',
          rawContent: fileBuffer,
          textContent,
          metadata: { fileName, fileSize: fileBuffer.length, mimeType: mime }
        };
      } catch (error) {
        console.error('Excel解析失败:', error);
        return {
          type: 'unknown',
          rawContent: fileBuffer,
          textContent: '[Excel文件解析失败]',
          metadata: { fileName, fileSize: fileBuffer.length, mimeType: mime }
        };
      }
    }
    
    // 3. Word文件
    if (mime.includes('word') || mime.includes('document') || fileName.endsWith('.docx') || fileName.endsWith('.doc')) {
      try {
        const result = await mammoth.extractRawText({ buffer: fileBuffer });
        return {
          type: 'word',
          rawContent: fileBuffer,
          textContent: result.value,
          metadata: { fileName, fileSize: fileBuffer.length, mimeType: mime }
        };
      } catch (error) {
        console.error('Word解析失败:', error);
        return {
          type: 'unknown',
          rawContent: fileBuffer,
          textContent: '[Word文件解析失败]',
          metadata: { fileName, fileSize: fileBuffer.length, mimeType: mime }
        };
      }
    }
    
    // 4. PDF文件 - 使用 pdf-parse 1.1.1
    if (mime.includes('pdf') || fileName.endsWith('.pdf')) {
      try {
        // pdf-parse 1.1.1 版本更稳定
        const data = await pdfParse(fileBuffer);
        return {
          type: 'pdf',
          rawContent: fileBuffer,
          textContent: data.text,
          metadata: { 
            fileName, 
            fileSize: fileBuffer.length, 
            mimeType: mime,
            pageCount: data.numpages
          }
        };
      } catch (error) {
        console.error('PDF解析失败:', error);
        
        // 备选方案：尝试使用简单的文本提取
        try {
          // 如果 pdf-parse 失败，返回基本信息
          return {
            type: 'pdf',
            rawContent: fileBuffer,
            textContent: '[PDF文件已上传，但内容提取失败。文件已保存，可以手动查看。]',
            metadata: { 
              fileName, 
              fileSize: fileBuffer.length, 
              mimeType: mime,
              pageCount: 0,
              error: error instanceof Error ? error.message : '未知错误'
            }
          };
        } catch (fallbackError) {
          return {
            type: 'unknown',
            rawContent: fileBuffer,
            textContent: '[PDF文件解析失败]',
            metadata: { fileName, fileSize: fileBuffer.length, mimeType: mime }
          };
        }
      }
    }
    
    // 5. 未知类型
    return {
      type: 'unknown',
      rawContent: fileBuffer,
      textContent: `[无法解析的文件类型: ${mime}]`,
      metadata: { fileName, fileSize: fileBuffer.length, mimeType: mime }
    };
  }
}
