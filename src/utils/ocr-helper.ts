import { execFile } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import OpenAI from 'openai';
import { Logger } from '@/lib/logger';
import { callDeepSeekChat } from '@/lib/deepseek-client';
import { cleanParameterDescriptionEnhanced } from '@/utils/string-cleaner-enhanced';

const execFileAsync = promisify(execFile);

export interface ExtractedProduct {
  name: string;
  model: string;
  brand: string;
  specs: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
  parameter_description?: string;  // 添加参数描述字段
}

export class OcrHelper {
  private toolsAvailable: boolean | null = null;
  private imageToolsAvailable: boolean | null = null;

  /**
   * 检查系统工具是否可用
   */
  private async checkTools(): Promise<boolean> {
    if (this.toolsAvailable !== null) {
      return this.toolsAvailable;
    }

    try {
      await execFileAsync('which', ['pdftotext']);
      Logger.info('[OCR] pdftotext 可用');
      this.toolsAvailable = true;
      return true;
    } catch (_error) {
      Logger.warn('[OCR] pdftotext 不可用，建议安装 poppler-utils');
      this.toolsAvailable = false;
      return false;
    }
  }

  /**
   * 将PDF转换为文本（使用系统命令）
   */
  async recognizePdf(pdfBuffer: Buffer): Promise<{ text: string; isTable: boolean }> {
    Logger.info('[OCR] 开始处理PDF', { size: pdfBuffer.length });

    const toolsAvailable = await this.checkTools();

    if (!toolsAvailable) {
      Logger.warn('[OCR] 系统工具不可用，无法提取PDF文本');
      return { text: '', isTable: false };
    }

    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const tempPdf = path.join(tempDir, `pdf-${timestamp}.pdf`);
    const tempTxt = path.join(tempDir, `pdf-${timestamp}.txt`);

    try {
      // 保存PDF到临时文件
      fs.writeFileSync(tempPdf, pdfBuffer);
      Logger.debug(`[OCR] 临时PDF文件: ${tempPdf}`);

      // 使用pdftotext提取文本
      try {
        Logger.info('[OCR] 使用pdftotext提取文本...');

        // 使用-layout参数保留原始布局
        await execFileAsync('pdftotext', ['-layout', tempPdf, tempTxt]);

        if (fs.existsSync(tempTxt)) {
          const text = fs.readFileSync(tempTxt, 'utf-8');
          if (text && text.trim().length > 0) {
            Logger.info('[OCR] pdftotext提取成功', { textLength: text.length });
            return { text, isTable: true };
          }
        }
      } catch (error) {
        Logger.error('[OCR] pdftotext失败', error);
      }

      Logger.warn('[OCR] 无法提取文本');
      return { text: '', isTable: false };
    } catch (error) {
      Logger.error('[OCR] PDF处理失败', error);
      return { text: '', isTable: false };
    } finally {
      // 清理临时文件
      try {
        fs.unlinkSync(tempPdf);
      } catch {
        // 临时文件可能已被清理，忽略删除失败
      }
      try {
        fs.unlinkSync(tempTxt);
      } catch {
        // 临时文件可能已被清理，忽略删除失败
      }
    }
  }

  /**
   * 识别图片中的文本
   * 方案1: 系统 tesseract（快速）
   * 方案2: AI Vision（Gemini 多模态，质量高）
   * 方案3: Tesseract.js（带超时，最后兜底）
   */
  async recognizeImage(imageBuffer: Buffer): Promise<{ text: string; isTable: boolean }> {
    Logger.info('[OCR] 开始处理图片', { size: imageBuffer.length });

    // 方案1: 优先使用系统 tesseract 命令（速度极快）
    try {
      await execFileAsync('which', ['tesseract']);
      Logger.info('[OCR] 使用系统 tesseract 命令识别图片...');

      const tempDir = os.tmpdir();
      const timestamp = Date.now();
      const tempImage = path.join(tempDir, `image-${timestamp}.png`);
      const tempTxt = path.join(tempDir, `image-${timestamp}.txt`);

      try {
        // 保存图片到临时文件
        fs.writeFileSync(tempImage, imageBuffer);
        Logger.debug(`[OCR] 临时图片文件: ${tempImage}`);

        // 使用 tesseract 识别
        await execFileAsync('tesseract', [tempImage, tempTxt.replace('.txt', ''), '-l', 'chi_sim+eng']);

        if (fs.existsSync(tempTxt)) {
          const text = fs.readFileSync(tempTxt, 'utf-8');
          if (text && text.trim().length > 0) {
            Logger.info('[OCR] 系统 tesseract 识别成功', { textLength: text.length });
            // 检测 OCR 质量，如果质量差则降级到 AI Vision
            if (!this.isOCRQualityAcceptable(text)) {
              Logger.info('[OCR] tesseract 识别质量较差，尝试 AI Vision...');
              const aiResult = await this.recognizeImageWithAI(imageBuffer);
              if (aiResult.text.trim().length > 0) {
                return aiResult;
              }
            }
            return { text, isTable: this.isLikelyTable(text) };
          }
        }
      } catch (error) {
        Logger.error('[OCR] 系统 tesseract 失败', error);
      } finally {
        // 清理临时文件
        try { fs.unlinkSync(tempImage); } catch { /* 临时文件清理 */ }
        try { fs.unlinkSync(tempTxt); } catch { /* 临时文件清理 */ }
      }
    } catch (_error) {
      Logger.warn('[OCR] 系统 tesseract 不可用');
    }

    // 方案2: AI Vision（Gemini 多模态模型）
    try {
      const aiResult = await this.recognizeImageWithAI(imageBuffer);
      if (aiResult.text.trim().length > 0) {
        return aiResult;
      }
    } catch (error) {
      Logger.warn('[OCR] AI Vision 识别失败', error);
    }

    // 方案3: Tesseract.js（带超时保护，最后兜底）
    try {
      const Tesseract = await import('tesseract.js');
      Logger.info('[OCR] 降级使用 Tesseract.js 识别图片...');

      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:image/png;base64,${base64Image}`;

      // 显式指定 workerPath：Next.js 打包时 __dirname 会被改写，
      // 若不指定会解析到不存在的 .next/dev/worker-script/node/index.js
      const workerPath = path.join(
        process.cwd(),
        'node_modules',
        'tesseract.js',
        'src',
        'worker-script',
        'node',
        'index.js'
      );

      // 语言包（chi_sim.traineddata / eng.traineddata）位于项目根目录。
      // dev 下 cwd 即项目根；standalone 部署时语言包由 outputFileTracingIncludes 复制到运行目录。
      // 显式指定 langPath 可避免 tesseract.js 走 jsdelivr CDN 下载（网络不通时会失败）。
      const langDir = fs.existsSync(path.join(process.cwd(), 'chi_sim.traineddata'))
        ? process.cwd()
        : undefined;

      const result = await Promise.race([
        Tesseract.recognize(dataUrl, 'chi_sim+eng', {
          workerPath,
          ...(langDir ? { langPath: langDir } : {}),
          logger: (m: any) => {
            if (m.status === 'recognizing text') {
              Logger.debug(`[OCR] 识别进度: ${(m.progress * 100).toFixed(2)}%`);
            }
          },
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Tesseract.js 识别超时（120秒）')), 120000)
        ),
      ]);

      const text = result.data.text;
      if (text && text.trim().length > 0) {
        Logger.info('[OCR] Tesseract.js 识别成功', { textLength: text.length });
        return { text, isTable: this.isLikelyTable(text) };
      }
    } catch (error) {
      Logger.warn('[OCR] Tesseract.js 识别失败', error);
    }

    Logger.warn('[OCR] 所有 OCR 方法都失败，无法提取图片文本');
    return { text: '', isTable: false };
  }

  /**
   * 检测 OCR 文本质量
   * 评估中文/英文字符比例、乱码特征、行级中文覆盖等
   */
  private isOCRQualityAcceptable(text: string): boolean {
    const trimmed = text.trim();
    if (trimmed.length < 10) return false;

    const totalChars = trimmed.replace(/\s/g, '').length;
    const chineseChars = (trimmed.match(/[\u4e00-\u9fff]/g) || []).length;
    const chineseRatio = totalChars > 0 ? chineseChars / totalChars : 0;

    // 检查1: 中文字符比例过低 — 中文询价单应至少 30% 是中文
    if (chineseRatio < 0.3 && totalChars > 20) {
      Logger.debug('[OCR] 质量检测: 中文比例过低', { chineseRatio: (chineseRatio * 100).toFixed(1) + '%', chineseChars, totalChars });
      return false;
    }

    // 检查2: 含中文行占比过低 — 多数行应包含中文
    const lines = trimmed.split('\n').filter(l => l.trim());
    if (lines.length >= 3) {
      const linesWithChinese = lines.filter(l => /[\u4e00-\u9fff]/.test(l)).length;
      const chineseLineRatio = linesWithChinese / lines.length;
      if (chineseLineRatio < 0.5) {
        Logger.debug('[OCR] 质量检测: 含中文行比例过低', { chineseLineRatio: (chineseLineRatio * 100).toFixed(1) + '%', linesWithChinese, totalLines: lines.length });
        return false;
      }
    }

    // 检查3: 乱码特征 — 非法字符比例过高
    const garbagePattern = /[^\u4e00-\u9ffa-zA-Z0-9\s\u3000-\u303f\uff00-\uffef.,;:!?()（）【】《》、\-——\/\\@#%+*=<>「」]/g;
    const garbageChars = (trimmed.match(garbagePattern) || []).length;
    const garbageRatio = totalChars > 0 ? garbageChars / totalChars : 0;

    if (garbageRatio > 0.2) {
      Logger.debug('[OCR] 质量检测: 乱码比例过高', { garbageRatio: (garbageRatio * 100).toFixed(1) + '%', garbageChars, totalChars });
      return false;
    }

    return true;
  }

  /**
   * 使用 AI Vision（Gemini 多模态）识别图片中的文字和产品信息
   */
  private async recognizeImageWithAI(imageBuffer: Buffer): Promise<{ text: string; isTable: boolean }> {
    const apiKey = process.env.LAOZHANG_API_KEY;
    const baseURL = process.env.LAOZHANG_BASE_URL || 'https://api.laozhang.ai/v1';

    if (!apiKey) {
      Logger.warn('[OCR] AI Vision 不可用: LAOZHANG_API_KEY 未配置');
      return { text: '', isTable: false };
    }

    Logger.info('[OCR] 使用 AI Vision 识别图片...');

    // 增加超时（120秒）与自动重试（最多2次），避免连接失败/超时直接中断图片解析
    const client = new OpenAI({
      apiKey,
      baseURL,
      timeout: 120000,
      maxRetries: 2,
      dangerouslyAllowBrowser: false,
    });
    const base64Image = imageBuffer.toString('base64');

    // 检测图片类型
    const mimeType = this.detectMimeType(imageBuffer);
    const dataUrl = `data:${mimeType};base64,${base64Image}`;

    const prompt = `请仔细识别这张图片中的所有文字内容，这是一张产品询价单。

要求：
1. 逐字逐行完整提取所有文字，不要遗漏
2. 保持原有的行列结构
3. 不要自行推测或补充内容
4. 如果是表格，请保留表格结构（使用制表符分隔列）
5. 如果有品牌列（品牌、厂家、制造商等），请保留该列信息
6. 如果品牌信息嵌入在产品名称中（如"普耐尔氩弧焊枪"），请原样保留，不要分离
7. 只输出识别到的原始文字，不要添加任何解释或分析

请直接输出图片中的文字内容：`;

    const response = await client.chat.completions.create({
      model: process.env.LAOZHANG_MODEL || 'gemini-2.5-flash',
      messages: [
        {
          role: 'user',
          content: [
            { type: 'text', text: prompt },
            { type: 'image_url', image_url: { url: dataUrl } },
          ],
        },
      ],
      temperature: 0.1,
      max_tokens: 8192,
    });

    const text = response.choices?.[0]?.message?.content || '';

    if (text.trim().length > 0) {
      Logger.info('[OCR] AI Vision 识别成功', { textLength: text.length });
      return { text, isTable: this.isLikelyTable(text) };
    }

    Logger.warn('[OCR] AI Vision 未识别到文字');
    return { text: '', isTable: false };
  }

  /**
   * 检测图片 MIME 类型
   */
  private detectMimeType(buffer: Buffer): string {
    if (buffer[0] === 0xFF && buffer[1] === 0xD8) return 'image/jpeg';
    if (buffer[0] === 0x89 && buffer[1] === 0x50) return 'image/png';
    if (buffer[0] === 0x47 && buffer[1] === 0x49) return 'image/gif';
    if (buffer[0] === 0x42 && buffer[1] === 0x4D) return 'image/bmp';
    if (buffer[0] === 0x52 && buffer[1] === 0x49) return 'image/webp';
    return 'image/png'; // 默认
  }

  /**
   * 判断文本是否像表格
   */
  private isLikelyTable(text: string): boolean {
    // 检查是否包含表格特征
    const tableFeatures = [
      /\|\|/, // 双竖线（Markdown表格）
      /\t/,   // Tab分隔
      /\s{3,}/, // 多个空格
      /产品名称|规格型号|数量|单价/, // 表头关键词
    ];

    return tableFeatures.some((feature) => feature.test(text));
  }

  /**
   * 从文本中提取产品信息
   */
  extractProductsFromTable(text: string): ExtractedProduct[] {
    const lines = text.split('\n').filter((l) => l.trim());
    Logger.info('[OCR] 开始解析文本', { lineCount: lines.length });

    const products: ExtractedProduct[] = [];

    // 产品关键词（按优先级排序）
    const productKeywords = [
      'PAM搅拌罐本体',
      '药剂搅拌系统',
      '搅拌罐本体',
      '搅拌罐',
      '搅拌系统',
      '反应釜',
      '储罐',
    ];

    for (let i = 0; i < lines.length; i++) {
      const line = lines[i].trim();
      if (!line || line.includes('产品名称') || line.includes('规格型号')) continue;

      // 检查是否是产品行
      let isProductLine = false;
      let productName = '';

      for (const keyword of productKeywords) {
        if (line.includes(keyword)) {
          isProductLine = true;
          productName = keyword;
          break;
        }
      }

      if (isProductLine) {
        Logger.debug('[OCR] 找到产品行', { preview: line.substring(0, 50) });

        // 收集这个产品的所有相关行
        const productLines = [line];
        let j = i + 1;

        while (j < lines.length) {
          const nextLine = lines[j].trim();
          let isNextProduct = false;

          // 检查下一行是否是新产品
          for (const keyword of productKeywords) {
            if (
              nextLine.includes(keyword) &&
              !nextLine.includes('mm') &&
              !nextLine.includes('kW')
            ) {
              isNextProduct = true;
              break;
            }
          }

          if (isNextProduct) break;

          // 如果下一行不是空行且不包含表头，则属于当前产品
          if (nextLine && !nextLine.includes('产品名称') && !nextLine.includes('规格型号')) {
            productLines.push(nextLine);
          }
          j++;
        }

        // 解析这个产品的信息
        const product = this.parseProductLines(productLines, productName);
        if (product) {
          products.push(product);
          Logger.debug('[OCR] 解析到产品', {
            name: product.name,
            quantity: product.quantity,
            unit: product.unit,
          });
        }

        i = j - 1; // 跳过已处理的行
      }
    }

    Logger.info('[OCR] 提取完成', { productCount: products.length });
    return products;
  }

  /**
   * 解析产品行组
   */
  private parseProductLines(lines: string[], defaultName: string): ExtractedProduct | null {
    if (lines.length === 0) return null;

    const fullText = lines.join(' ').replace(/\s+/g, ' ');
    Logger.debug('[OCR] 解析产品文本', { preview: fullText.substring(0, 100) });
    
    // 使用增强版清洗函数处理参数描述
    const cleanResult = cleanParameterDescriptionEnhanced(fullText);
    const cleanedText = cleanResult.cleaned;
    
    // 记录清洗统计
    if (cleanResult.statistics.removedChars > 0) {
      Logger.info('[OCR] 参数清洗统计', {
        originalLength: cleanResult.statistics.originalLength,
        cleanedLength: cleanResult.statistics.cleanedLength,
        removedChars: cleanResult.statistics.removedChars,
        removedItems: cleanResult.removedItems,
      });
    }

    const product: ExtractedProduct = {
      name: defaultName,
      model: '',
      brand: this.extractBrand(cleanedText),
      specs: cleanedText,  // 使用清洗后的文本
      quantity: 1,
      unit: '台',
      price: 0,
      total: 0,
      parameter_description: cleanedText,  // 清洗后的参数描述
    };

    // 提取数量 - 正确的逻辑，排除尺寸中的数字
    this.extractQuantity(product, cleanedText);

    // 提取型号
    this.extractModel(product, cleanedText);

    return product;
  }

  /**
   * 提取数量（排除尺寸中的数字）
   */
  private extractQuantity(product: ExtractedProduct, text: string): void {
    // 首先尝试找 "套 X" 模式（最准确）
    const quantityPatterns = [
      { pattern: /套\s*[：:]\s*(\d+)/, unit: '套' }, // 套：3
      { pattern: /套\s*(\d+)/, unit: '套' }, // 套 3
      { pattern: /(\d+)\s*套(?!\d)/, unit: '套' }, // 3 套（排除后面跟数字）
      { pattern: /数量[：:]\s*(\d+)/, unit: '套' }, // 数量：3
      { pattern: /[xX]\s*(\d+)\s*套/, unit: '套' }, // x3套
    ];

    for (const { pattern, unit } of quantityPatterns) {
      const match = text.match(pattern);
      if (match) {
        const qty = parseInt(match[1]);
        // 确保数量是合理的（1-100之间）
        if (qty > 0 && qty < 100) {
          product.quantity = qty;
          product.unit = unit;
          Logger.debug('[OCR] 提取到数量', { quantity: qty, unit });
          return;
        }
      }
    }

    // 如果没有找到，尝试找单独的数字后面跟"套"
    const fallbackMatch = text.match(/(\d+)\s*套/);
    if (fallbackMatch) {
      const qty = parseInt(fallbackMatch[1]);
      if (qty > 0 && qty < 100) {
        product.quantity = qty;
        product.unit = '套';
        Logger.debug('[OCR] 通过备用模式提取到数量', { quantity: qty });
        return;
      }
    }

    // 最后尝试找可能的数量（排除尺寸数字）
    const possibleQuantities = text.match(/\b([2-9]|1[0-9]|20)\b/g);
    if (possibleQuantities) {
      // 取最大的合理数量
      const maxQty = Math.max(...possibleQuantities.map(Number));
      if (maxQty > 1 && maxQty < 100) {
        product.quantity = maxQty;
        Logger.debug('[OCR] 通过可能数量提取到', { quantity: maxQty });
      }
    }
  }

  /**
   * 提取品牌（从产品文本中识别品牌名）
   * 匹配常见品牌模式：连续2-4个中文字符后跟产品名关键词
   */
  private extractBrand(text: string): string {
    // 常见品牌列表（优先精确匹配，避免正则误识别）
    const knownBrands = ['杰瑞浩', '金石', '兴燊', '良工', '德力西', '得力', '前田', '永拓', '犀瑞', '史丹利', '普耐尔'];
    // 非品牌词黑名单（避免将「工艺」「药剂」等误识别为品牌）
    const nonBrandWords = ['工艺', '药剂', '材质', '耐压', '防腐', '过滤', '氧化', '催化', '发酵', '萃取', '污水', '废水', '不锈钢', '碳钢', '玻璃钢', '铝合金', '通用', '标准', '高效', '新型', '优质', '成套'];

    // 1. 优先匹配已知品牌列表
    for (const brand of knownBrands) {
      if (text.includes(brand)) {
        Logger.debug('[OCR] 提取到品牌（已知品牌列表）', { brand });
        return brand;
      }
    }

    // 2. 品牌/厂家/制造商标识模式
    const labeledPatterns = [
      // "品牌：XXX" 或 "品牌:XXX" 模式
      /品牌[\s：:]*([\u4e00-\u9fa5a-zA-Z0-9]{2,20})/,
      // "厂家：XXX" 模式
      /厂家[\s：:]*([\u4e00-\u9fa5a-zA-Z0-9]{2,20})/,
      // "制造商：XXX" 模式
      /制造商[\s：:]*([\u4e00-\u9fa5a-zA-Z0-9]{2,20})/,
    ];

    for (const pattern of labeledPatterns) {
      const match = text.match(pattern);
      if (match && match[1]) {
        const brand = match[1].trim();
        if (brand.length >= 2 && !nonBrandWords.includes(brand)) {
          Logger.debug('[OCR] 提取到品牌', { brand });
          return brand;
        }
      }
    }

    // 3. 常见品牌名模式：中文品牌 + 产品关键词（排除非品牌词）
    // "普耐尔QQ150夹子" -> "普耐尔", "普耐尔氩弧焊枪5M" -> "普耐尔"
    const brandPattern = /([\u4e00-\u9fa5]{2,4})(?:QQ?\d|氩弧|焊枪|夹子|搅拌|水泵|风机|空压|电机|阀门|管道|焊机|切割|打磨|抛光|压缩机|发电机|钻机)/;
    const brandMatch = text.match(brandPattern);
    if (brandMatch && brandMatch[1]) {
      const brand = brandMatch[1].trim();
      if (brand.length >= 2 && !nonBrandWords.includes(brand)) {
        Logger.debug('[OCR] 提取到品牌', { brand });
        return brand;
      }
    }

    return '';
  }

  /**
   * 提取型号
   */
  private extractModel(product: ExtractedProduct, text: string): void {
    // 型号模式（按优先级排序）
    const modelPatterns = [
      /φ\d+[×x]\d+(?:mm)?/i, // φ4000×3000mm
      /\d+[×x]\d+(?:mm)?/i, // 4000×3000mm
      /\d+kW/i, // 11kW
      /[A-Z0-9]+[-][A-Z0-9]+/i, // IS150-125-250
      /[A-Z]{2,}\d+/i, // Q235B
      /[A-Z]+\d+[A-Z]*/i, // DN100
      /\d+[A-Z]+[A-Z0-9]*/i, // 304不锈钢中的304
    ];

    for (const pattern of modelPatterns) {
      const match = text.match(pattern);
      if (match) {
        product.model = match[0];
        Logger.debug('[OCR] 提取到型号', { model: match[0] });
        break;
      }
    }
  }
}
