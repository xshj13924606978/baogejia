import { LLMClient } from 'coze-coding-dev-sdk';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { exec } from 'child_process';
import { promisify } from 'util';
import { cleanParameterDescription } from '@/utils/string-cleaner';
import { cleanParameterDescriptionEnhanced, extractParameterSummary } from '@/utils/string-cleaner-enhanced';
import { PdfTableEnhancer } from '@/utils/pdf-table-enhancer';
import { pdfLogger, createTimer, parseContext, LogLevel } from '@/utils/pdf-parse-logger';

const execAsync = promisify(exec);

interface Product {
  name: string;
  model: string;
  brand: string;
  specs: string;
  parameter_description: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
  remark: string;
}

interface ParseResult {
  products: Product[];
  globalRemarks: string[];
  rawContent?: string;
  parseLevel: 'local' | 'ai' | 'fallback' | 'ocr' | 'error';
  confidence: number;
  metadata?: {
    fileType: string;
    fileName: string;
    fileSize: number;
    parseMethod: string;
    parseTime: number;
    pageCount?: number;
  };
}

export class EnhancedPdfParser {
  private llmClient: LLMClient;
  private visionClient: LLMClient;
  private tableEnhancer: PdfTableEnhancer;
  private useEnhancedCleaning: boolean = true;

  constructor(llmClient: LLMClient, visionClient: LLMClient, useEnhanced: boolean = true) {
    this.llmClient = llmClient;
    this.visionClient = visionClient;
    this.tableEnhancer = new PdfTableEnhancer();
    this.useEnhancedCleaning = useEnhanced;
    
    // 设置日志级别
    if (process.env.DEBUG_PDF_PARSE) {
      pdfLogger.setLevel(LogLevel.DEBUG);
    } else {
      pdfLogger.setLevel(LogLevel.INFO);
    }
  }

  async parse(fileInfo: any): Promise<ParseResult> {
    console.log('[PDF增强] ========== 开始解析 ==========');
    console.log('[PDF增强] 文件名:', fileInfo.name);

    const startTime = Date.now();

    try {
      // 第1层：尝试pdf-parse（适用于文本型PDF）
      if (fileInfo.buffer) {
        const textResult = await this.parseWithPdfParse(fileInfo.buffer);
        if (textResult.products.length > 0 && textResult.confidence > 70) {
          console.log('[PDF增强] 第1层解析成功，置信度:', textResult.confidence);
          return this.addMetadata(textResult, fileInfo, 'pdf-parse', startTime);
        }

        if (textResult.rawContent && textResult.rawContent.length > 100) {
          fileInfo.extractedText = textResult.rawContent;
        }
      }

      // 第2层：尝试OCR（适用于扫描件）
      if (fileInfo.buffer) {
        console.log('[PDF增强] 尝试OCR解析...');
        const ocrResult = await this.parseWithOCR(fileInfo);
        if (ocrResult.products.length > 0 && ocrResult.confidence > 60) {
          console.log('[PDF增强] OCR解析成功，置信度:', ocrResult.confidence);
          return this.addMetadata(ocrResult, fileInfo, 'ocr', startTime);
        }
      }

      // 第3层：AI增强解析
      console.log('[PDF增强] 尝试AI解析...');
      const aiResult = await this.parseWithAI(fileInfo);
      if (aiResult.products.length > 0 && aiResult.confidence > 50) {
        console.log('[PDF增强] AI解析成功，置信度:', aiResult.confidence);
        return this.addMetadata(aiResult, fileInfo, 'ai', startTime);
      }

      // 第4层：降级方案
      console.log('[PDF增强] 使用降级方案');
      const fallbackResult = this.createFallbackResult(fileInfo);
      return this.addMetadata(fallbackResult, fileInfo, 'fallback', startTime);
    } catch (error) {
      console.error('[PDF增强] 解析失败:', error);
      const errorResult = this.createErrorResult(error);
      return this.addMetadata(errorResult, fileInfo, 'error', startTime);
    }
  }

  private async parseWithPdfParse(buffer: Buffer): Promise<ParseResult> {
    const timer = createTimer('PDF解析');
    
    try {
      parseContext.startPhase('PDF文本提取');
      const pdfParse = (await import('pdf-parse')).default;
      const data = await pdfParse(buffer);
      parseContext.endPhase('PDF文本提取', {
        页数: data.numpages,
        文本长度: data.text.length,
      });

      parseContext.startPhase('表格增强解析');
      pdfLogger.info('使用表格增强模式解析PDF');
      
      // 使用表格增强器解析
      const enhancedTable = this.tableEnhancer.enhanceTable(data.text);
      const products = this.tableEnhancer.extractProductsFromEnhancedTable(enhancedTable);
      
      parseContext.endPhase('表格增强解析', {
        识别行数: enhancedTable.rows.length,
        识别列数: enhancedTable.columns.length,
        产品数量: products.length,
      });

      const confidence = this.calculateConfidence(products, data.text);
      
      timer.stop();

      return {
        products,
        globalRemarks: [],
        rawContent: data.text,
        parseLevel: 'local',
        confidence,
      };
    } catch (error) {
      timer.stop();
      parseContext.logException(error as Error, { method: 'pdf-parse' });
      return {
        products: [],
        globalRemarks: ['pdf-parse解析失败'],
        rawContent: '',
        parseLevel: 'local',
        confidence: 0,
      };
    }
  }

  private async parseWithOCR(fileInfo: any): Promise<ParseResult> {
    try {
      const tempDir = os.tmpdir();
      const tempPdf = path.join(tempDir, `ocr-${Date.now()}.pdf`);
      const tempImage = path.join(tempDir, `ocr-${Date.now()}.png`);

      fs.writeFileSync(tempPdf, fileInfo.buffer);

      try {
        await execAsync(
          `pdftoppm -png -f 1 -singlefile ${tempPdf} ${tempImage.replace('.png', '')}`
        );
      } catch (_e) {
        console.log('[PDF] pdftoppm可能未安装，跳过OCR');
        return {
          products: [],
          globalRemarks: ['OCR工具未安装'],
          parseLevel: 'ocr',
          confidence: 0,
        };
      }

      const imageBuffer = fs.readFileSync(tempImage);
      const base64Image = imageBuffer.toString('base64');

      const prompt = `请识别这张图片中的所有产品信息，返回JSON格式：
{
  "products": [
    {
      "name": "产品名称",
      "model": "型号",
      "brand": "品牌",
      "specs": "规格",
      "parameter_description": "参数描述",
      "quantity": 数量,
      "unit": "单位",
      "price": 单价
    }
  ],
  "remarks": ["备注"]
}`;

      const response = await this.visionClient.invoke(
        [
          {
            role: 'user',
            content: [
              { type: 'text', text: prompt },
              {
                type: 'image_url',
                image_url: {
                  url: `data:image/png;base64,${base64Image}`,
                  detail: 'high',
                },
              },
            ],
          },
        ],
        { temperature: 0.3 }
      );

      // 清理临时文件
      try {
        fs.unlinkSync(tempPdf);
        fs.unlinkSync(tempImage);
      } catch (_e) {}

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        const products = this.normalizeProducts(data.products || []);

        return {
          products,
          globalRemarks: data.remarks || [],
          parseLevel: 'ocr',
          confidence: products.length > 0 ? 70 : 0,
        };
      }
    } catch (error) {
      console.error('[PDF] OCR失败:', error);
    }

    return {
      products: [],
      globalRemarks: ['OCR解析失败'],
      parseLevel: 'ocr',
      confidence: 0,
    };
  }

  private async parseWithAI(fileInfo: any): Promise<ParseResult> {
    const extractedText = fileInfo.extractedText || '无法提取文本';

    const prompt = `你是一个专业的报价单解析助手。请从以下PDF内容中提取所有产品信息。

PDF文件名: ${fileInfo.name}
提取的文本内容:
${extractedText.substring(0, 3000)}

请严格按照以下格式返回JSON：
{
  "products": [
    {
      "name": "产品名称（必填）",
      "model": "型号规格",
      "brand": "品牌",
      "specs": "技术参数",
      "parameter_description": "参数描述（技术参数的详细说明）",
      "quantity": 数量（数字）,
      "unit": "单位",
      "price": 单价（数字，没有则为0）,
      "total": 总价（数字，没有则自动计算）,
      "remark": "备注"
    }
  ],
  "remarks": ["整体备注1", "整体备注2"]
}`;

    try {
      const response = await this.llmClient.invoke([{ role: 'user', content: prompt }], {
        temperature: 0.3,
      });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        const products = this.normalizeProducts(data.products || []);

        return {
          products,
          globalRemarks: data.remarks || [],
          rawContent: extractedText,
          parseLevel: 'ai',
          confidence: products.length > 0 ? 60 : 0,
        };
      }
    } catch (error) {
      console.error('[PDF] AI解析失败:', error);
    }

    return {
      products: [],
      globalRemarks: ['AI解析失败'],
      rawContent: extractedText,
      parseLevel: 'ai',
      confidence: 0,
    };
  }

  private extractProductsFromText(text: string): Product[] {
    const products: Product[] = [];
    const lines = text.split('\n').filter((line) => line.trim().length > 3);

    const patterns = [
      /(\d+)[.\s、]*([^\d]{2,30}?)[\s]+(\d+(?:\.\d+)?)\s*(个|台|套|只|件|米|公斤|吨|根|条)[\s]+(\d+(?:\.\d+)?)/,
      /([^\d]{2,20}?)[\s]+([A-Z0-9\-]+)[\s]+(\d+(?:\.\d+)?)\s*(个|台|套)/,
      /([^\d]{2,30}?)[\s]+(\d+(?:\.\d+)?)\s*(个|台|套|只|件)/,
    ];

    for (const line of lines) {
      for (const pattern of patterns) {
        const match = line.match(pattern);
        if (match) {
          const name = match[1].trim();
          const quantity = parseFloat(match[match.length === 4 ? 2 : 3]) || 1;
          const unit = match[match.length === 4 ? 3 : 4] || '个';

          if (name.length > 1 && name.length < 50 && !this.isNoise(name)) {
            products.push({
              name,
              model: '',
              brand: '',
              specs: '',
              parameter_description: '',
              quantity,
              unit,
              price: 0,
              total: 0,
              remark: '从PDF提取',
            });
            break;
          }
        }
      }

      if (products.length >= 30) break;
    }

    return products;
  }

  private isNoise(text: string): boolean {
    const noisePatterns = [
      /^[0-9\s]+$/,
      /^[a-zA-Z\s]+$/,
      /^[·•●■□▲△※→←↑↓]+$/,
      /第.{1,10}页/i,
      /www\.|http|\.com/i,
      /电话|传真|邮箱|地址/i,
      /版权所有|翻版必究/i,
      /报价单|询价单|采购单|合同/i,
    ];
    return noisePatterns.some((pattern) => pattern.test(text));
  }

  private calculateConfidence(products: Product[], _rawTextrawText: string): number {
    if (products.length === 0) return 0;

    let score = 50;
    score += Math.min(products.length * 5, 30);

    const hasPrices = products.some((p) => p.price > 0);
    if (hasPrices) score += 20;

    const hasModels = products.some((p) => p.model);
    if (hasModels) score += 15;

    const hasUnits = products.some((p) => p.unit !== '个');
    if (hasUnits) score += 10;

    return Math.min(score, 100);
  }

  private normalizeProducts(products: any[]): Product[] {
    pdfLogger.section('📦 产品数据标准化');
    pdfLogger.info(`开始标准化 ${products.length} 个产品`);
    
    return products
      .map((p, index) => {
        const rawDescription = p.parameter_description || p.specs || '';
        
        pdfLogger.debug(`\n产品 ${index + 1}: ${p.name}`);
        pdfLogger.indent();
        pdfLogger.debug('原始参数描述:', rawDescription);
        
        let cleanedDescription: string;
        
        if (this.useEnhancedCleaning) {
          // 使用增强版清洗
          const cleanResult = cleanParameterDescriptionEnhanced(rawDescription);
          cleanedDescription = cleanResult.cleaned;
          
          if (cleanResult.statistics.removedChars > 0) {
            pdfLogger.info('清洗统计:', {
              原长度: cleanResult.statistics.originalLength,
              新长度: cleanResult.statistics.cleanedLength,
              减少: cleanResult.statistics.removedChars,
              清洗项: cleanResult.removedItems.length,
            });
          }
        } else {
          // 使用基础清洗
          cleanedDescription = cleanParameterDescription(rawDescription);
        }
        
        pdfLogger.debug('清洗后描述:', cleanedDescription);
        
        // 提取参数摘要（可选）
        if (this.useEnhancedCleaning && cleanedDescription) {
          const summary = extractParameterSummary(cleanedDescription);
          if (Object.keys(summary).length > 0) {
            pdfLogger.debug('参数摘要:', summary);
          }
        }
        
        pdfLogger.dedent();
        
        return {
          name: p.name || '',
          model: p.model || '',
          brand: p.brand || '',
          specs: p.specs || '',
          parameter_description: cleanedDescription,
          quantity: Number(p.quantity) || 1,
          unit: p.unit || '个',
          price: Number(p.price) || 0,
          total: Number(p.total) || (Number(p.price) || 0) * (Number(p.quantity) || 1),
          remark: p.remark || '',
        };
      })
      .filter((p) => p.name);
  }

  private createFallbackResult(fileInfo: any): ParseResult {
    const fileName = fileInfo.name.replace(/\.pdf$/i, '');
    const parts = fileName.split(/[-\s_]+/);

    return {
      products: [
        {
          name: parts[0] || '未知产品',
          model: parts[1] || '',
          brand: '',
          specs: '请手动填写',
          parameter_description: '',
          quantity: 1,
          unit: '个',
          price: 0,
          total: 0,
          remark: 'PDF解析失败，请手动输入',
        },
      ],
      globalRemarks: ['无法自动解析PDF内容，请检查文件格式或手动输入'],
      parseLevel: 'fallback',
      confidence: 10,
    };
  }

  private createErrorResult(error: any): ParseResult {
    return {
      products: [],
      globalRemarks: [`解析错误: ${error.message || '未知错误'}`],
      parseLevel: 'error',
      confidence: 0,
    };
  }

  private addMetadata(
    result: ParseResult,
    fileInfo: any,
    method: string,
    startTime: number
  ): ParseResult {
    const duration = Date.now() - startTime;
    
    pdfLogger.section('📊 PDF解析完成报告');
    pdfLogger.info('解析方法:', method);
    pdfLogger.info('文件信息:', {
      名称: fileInfo.name,
      大小: `${(fileInfo.buffer?.length || 0) / 1024} KB`,
      解析耗时: `${duration}ms`,
      置信度: `${result.confidence}%`,
      产品数量: result.products.length,
    });

    if (result.products.length > 0) {
      pdfLogger.info('\n产品清单:');
      pdfLogger.indent();
      result.products.forEach((p, i) => {
        pdfLogger.info(`${i + 1}. ${p.name}`);
        if (p.parameter_description) {
          pdfLogger.debug(`   参数: ${p.parameter_description.substring(0, 100)}...`);
        }
        if (p.brand) {
          pdfLogger.debug(`   品牌: ${p.brand}`);
        }
      });
      pdfLogger.dedent();
    }

    if (result.globalRemarks.length > 0) {
      pdfLogger.warn('全局备注:', result.globalRemarks);
    }

    return {
      ...result,
      metadata: {
        fileType: 'application/pdf',
        fileName: fileInfo.name,
        fileSize: fileInfo.buffer?.length || 0,
        parseMethod: method,
        parseTime: duration,
      },
    };
  }
}
