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
    const startTime = Date.now();

    try {
      // 第1层：尝试pdf-parse（适用于文本型PDF）
      if (fileInfo.buffer) {
        const textResult = await this.parseWithPdfParse(fileInfo.buffer);
        if (textResult.products.length > 0 && textResult.confidence > 70) {
          return this.addMetadata(textResult, fileInfo, 'pdf-parse', startTime);
        }

        if (textResult.rawContent && textResult.rawContent.length > 100) {
          fileInfo.extractedText = textResult.rawContent;
        }
      }

      // 第2层：尝试OCR（适用于扫描件）
      if (fileInfo.buffer) {
        const ocrResult = await this.parseWithOCR(fileInfo);
        if (ocrResult.products.length > 0 && ocrResult.confidence > 60) {
          return this.addMetadata(ocrResult, fileInfo, 'ocr', startTime);
        }
      }

      // 第3层：AI增强解析
      const aiResult = await this.parseWithAI(fileInfo);
      if (aiResult.products.length > 0 && aiResult.confidence > 50) {
        return this.addMetadata(aiResult, fileInfo, 'ai', startTime);
      }

      // 第4层：降级方案
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
      
      // 使用表格增强器解析
      const enhancedTable = this.tableEnhancer.enhanceTable(data.text);
      
      const products = this.tableEnhancer.extractProductsFromEnhancedTable(enhancedTable);
      
      parseContext.endPhase('表格增强解析', {
        识别行数: enhancedTable.rows.length,
        识别列数: enhancedTable.columns.length,
        产品数量: products.length,
      });

      const confidence = this.calculateLocalConfidence(products, data.text);
      
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
      console.error('❌ pdf-parse解析失败:', error);
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

    // 预处理文本：移除空白和无关信息
    const processedText = this.preprocessTextForAI(extractedText);

    const prompt = `你是一个专业的报价单和产品清单解析助手。请从以下PDF内容中提取所有产品信息。

【任务说明】
1. 仔细分析提供的文本内容，识别所有独立的产品条目
2. 每个产品通常包含：名称、型号/规格、品牌、技术参数、数量、单位、价格等
3. 有些产品的信息可能分散在多行，需要智能合并
4. 表格形式的报价单要逐行提取完整信息

【PDF文件信息】
文件名: ${fileInfo.name}

【文本内容】
${processedText.substring(0, 4000)}

【提取要求】
- 产品名称：必填，提取完整的产品名称（如"PAM搅拌罐本体"、"AO工艺污水处理系统"）
- 型号规格：如有，提取型号或规格参数（如"60吨/日"、"φ4000×3000mm"）
- 品牌：如有品牌信息，提取品牌名（如"佳木斯电机"、"宁波动力"）
- 参数描述：详细的技术参数说明（如"Q235B碳钢/壁厚10mm；环氧树脂内外防腐"）
  ⚠️ 注意：参数描述中只包含技术参数，不要包含数量、价格等信息
- 数量：提取数量字段，必须是数字
- 单位：提取单位（如"套"、"台"、"个"、"米"、"吨"等）
- 价格：提取单价（数字），如没有则为0
- 总价：如有总价则提取，否则为0

【输出格式】
必须严格按照以下JSON格式返回，不要包含任何其他文字：
\`\`\`json
{
  "products": [
    {
      "name": "产品名称",
      "model": "型号规格",
      "brand": "品牌",
      "specs": "规格参数",
      "parameter_description": "详细的参数描述",
      "quantity": 数量,
      "unit": "单位",
      "price": 单价,
      "total": 总价,
      "remark": "备注"
    }
  ],
  "remarks": ["整体备注"]
}
\`\`\`

【重要提示】
- parameter_description字段中只包含技术参数，不要包含数量、价格等信息
- 如果某个字段没有信息，留空字符串或设为0
- quantity、price、total必须是数字，不要带单位
- 确保JSON格式正确，可以被程序解析`;

    try {
      const response = await this.llmClient.invoke([{ role: 'user', content: prompt }], {
        temperature: 0.1, // 降低温度以获得更稳定的结果
      });

      const jsonMatch = response.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        const data = JSON.parse(jsonMatch[0]);
        const products = this.normalizeProducts(data.products || []);
        
        // 动态计算置信度
        const confidence = this.calculateAIConfidence(products, processedText);

        return {
          products,
          globalRemarks: data.remarks || [],
          rawContent: processedText,
          parseLevel: 'ai',
          confidence,
        };
      }
    } catch (error) {
      console.error('[PDF] AI解析失败:', error);
    }

    return {
      products: [],
      globalRemarks: ['AI解析失败'],
      rawContent: processedText,
      parseLevel: 'ai',
      confidence: 0,
    };
  }

  /**
   * 预处理文本，为AI解析做准备
   */
  private preprocessTextForAI(text: string): string {
    // 移除过短的行
    const lines = text.split('\n').filter(line => line.trim().length > 1);
    
    // 移除页眉页脚和无关信息
    const filteredLines = lines.filter(line => {
      const noisePatterns = [
        /^[0-9\s]+$/, // 纯数字
        /^[·•●■□▲△※→←↑↓]+$/, // 纯符号
        /第\s*\d+\s*页/i, // 页码
        /Page\s*\d+/i, // 英文页码
        /www\.|http|\.com|\.cn/i, // URL
        /^电话|^传真|^邮箱|^地址|^邮编/i, // 联系方式
        /版权所有|翻版必究|Confidential/i, // 版权信息
        /报价单|询价单|采购单|合同总金额/i, // 重复标题
      ];
      return !noisePatterns.some(pattern => pattern.test(line));
    });

    return filteredLines.join('\n');
  }

  /**
   * 计算本地解析的置信度
   */
  private calculateLocalConfidence(products: Product[], text: string): number {
    if (products.length === 0) return 0;

    let score = 50; // 基础分

    // 1. 产品数量得分
    score += Math.min(products.length * 5, 30);

    // 2. 产品名称质量
    const validNames = products.filter(p => 
      p.name && 
      p.name.length >= 2 && 
      p.name.length <= 50 &&
      !this.isNoise(p.name)
    );
    const nameQualityRatio = validNames.length / products.length;
    score += Math.round(nameQualityRatio * 20);

    // 3. 参数描述完整性
    const hasDescriptions = products.filter(p => 
      p.parameter_description && p.parameter_description.length > 5
    ).length;
    score += Math.round((hasDescriptions / products.length) * 15);

    // 4. 品牌信息
    const hasBrands = products.filter(p => p.brand && p.brand.length > 0).length;
    if (hasBrands > 0) {
      score += Math.round((hasBrands / products.length) * 10);
    }

    // 5. 数量信息
    const hasQuantities = products.filter(p => p.quantity > 0).length;
    score += Math.round((hasQuantities / products.length) * 10);

    // 6. 价格信息（加分项）
    const hasPrices = products.filter(p => p.price > 0).length;
    if (hasPrices > 0) {
      score += Math.round((hasPrices / products.length) * 15);
    }

    // 7. 文本利用率
    if (text.length > 0) {
      const textUtilization = Math.min(products.length * 20 / text.length * 100, 10);
      score += Math.round(textUtilization);
    }

    // 8. 单位多样性
    const uniqueUnits = new Set(products.map(p => p.unit)).size;
    if (uniqueUnits > 1) {
      score += 5;
    }

    return Math.min(score, 100);
  }

  /**
   * 计算AI解析的置信度
   */
  private calculateAIConfidence(products: Product[], text: string): number {
    if (products.length === 0) return 0;

    let score = 40; // 基础分

    // 1. 产品数量得分
    score += Math.min(products.length * 5, 30);

    // 2. 产品名称质量
    const validNames = products.filter(p => 
      p.name && 
      p.name.length >= 2 && 
      p.name.length <= 50 &&
      !this.isNoise(p.name)
    );
    const nameQualityRatio = validNames.length / products.length;
    score += Math.round(nameQualityRatio * 20);

    // 3. 参数描述完整性
    const hasDescriptions = products.filter(p => 
      p.parameter_description && p.parameter_description.length > 5
    ).length;
    score += Math.round((hasDescriptions / products.length) * 15);

    // 4. 品牌信息
    const hasBrands = products.filter(p => p.brand && p.brand.length > 0).length;
    if (hasBrands > 0) {
      score += Math.round((hasBrands / products.length) * 10);
    }

    // 5. 数量信息
    const hasQuantities = products.filter(p => p.quantity > 0).length;
    score += Math.round((hasQuantities / products.length) * 10);

    // 6. 价格信息（加分项）
    const hasPrices = products.filter(p => p.price > 0).length;
    if (hasPrices > 0) {
      score += Math.round((hasPrices / products.length) * 15);
    }

    // 7. 文本利用率
    const textUtilization = Math.min(products.length * 20 / text.length * 100, 10);
    score += Math.round(textUtilization);

    return Math.min(score, 100);
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
