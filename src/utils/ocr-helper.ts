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
   * 流程：① pdftotext -layout（文本型PDF）→ ② pdftoppm 渲染页面 + tesseract OCR（图片型PDF）
   */
  async recognizePdf(pdfBuffer: Buffer): Promise<{ text: string; isTable: boolean; products?: ExtractedProduct[]; parseSource?: string }> {
    Logger.info('[OCR] 开始处理PDF', { size: pdfBuffer.length });

    // ① 文本型 PDF：pdftotext 提取
    const text = await this.extractPdfText(pdfBuffer);
    if (text && text.trim().length > 0) {
      return { text, isTable: true };
    }

    // ② 图片型 PDF（扫描件/纯图片）：pdftoppm 渲染 + 复用图片 OCR（RapidOCR）路径
    Logger.info('[OCR] pdftotext 未提取到文本，尝试渲染页面进行 OCR...');
    const rendered = await this.ocrPdfByRendering(pdfBuffer);
    if (rendered && (rendered.text.trim().length > 0 || (rendered.products && rendered.products.length > 0))) {
      Logger.info('[OCR] PDF 渲染 OCR 成功', { textLength: rendered.text.length, productCount: rendered.products?.length || 0 });
      return { text: rendered.text, isTable: !!(rendered.products && rendered.products.length > 0), products: rendered.products, parseSource: rendered.parseSource };
    }

    Logger.warn('[OCR] 无法从PDF提取文本');
    return { text: '', isTable: false };
  }

  /**
   * 使用 pdftotext -layout 提取文本型 PDF 的文本
   */
  private async extractPdfText(pdfBuffer: Buffer): Promise<string> {
    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const tempPdf = path.join(tempDir, `pdf-${timestamp}.pdf`);
    const tempTxt = path.join(tempDir, `pdf-${timestamp}.txt`);

    try {
      fs.writeFileSync(tempPdf, pdfBuffer);

      try {
        Logger.info('[OCR] 使用pdftotext提取文本...');
        await execFileAsync('pdftotext', ['-layout', tempPdf, tempTxt]);

        if (fs.existsSync(tempTxt)) {
          const text = fs.readFileSync(tempTxt, 'utf-8');
          if (text && text.trim().length > 0) {
            Logger.info('[OCR] pdftotext提取成功', { textLength: text.length });
            return text;
          }
        }
      } catch (error) {
        Logger.error('[OCR] pdftotext失败', error);
      }

      return '';
    } catch (error) {
      Logger.error('[OCR] PDF处理失败', error);
      return '';
    } finally {
      this.cleanupTempFiles(tempPdf, tempTxt);
    }
  }

  /**
   * 图片型 PDF：pdftoppm 将每页渲染为 PNG，再复用图片 OCR（RapidOCR）识别
   * 这样图片型 PDF 与 JPG/PNG 使用同一套高质量表格识别链路
   */
  private async ocrPdfByRendering(pdfBuffer: Buffer): Promise<{ text: string; products?: ExtractedProduct[]; parseSource?: string }> {
    // 检查 pdftoppm 是否可用
    try {
      await execFileAsync('which', ['pdftoppm']);
    } catch {
      Logger.warn('[OCR] pdftoppm 不可用，无法OCR图片型PDF');
      return { text: '' };
    }

    const tempDir = os.tmpdir();
    const timestamp = Date.now();
    const tempPdf = path.join(tempDir, `pdf-render-${timestamp}.pdf`);
    const outputPrefix = path.join(tempDir, `pdf-page-${timestamp}`);

    try {
      fs.writeFileSync(tempPdf, pdfBuffer);

      // 渲染所有页面为 PNG（200 DPI 兼顾清晰度与速度）
      try {
        await execFileAsync('pdftoppm', ['-png', '-r', '200', tempPdf, outputPrefix]);
      } catch (error) {
        Logger.error('[OCR] pdftoppm 渲染失败', error);
        return { text: '' };
      }

      // 查找生成的页面图片
      const pageFiles = fs
        .readdirSync(tempDir)
        .filter((f) => f.startsWith(`pdf-page-${timestamp}`) && f.endsWith('.png'))
        .sort();

      if (pageFiles.length === 0) {
        Logger.warn('[OCR] pdftoppm 未生成页面图片');
        return { text: '' };
      }

      Logger.info('[OCR] pdftoppm 渲染完成', { pageCount: pageFiles.length });

      // 逐页复用图片 OCR 链路（优先 RapidOCR Service，退化 Tesseract.js）
      const textParts: string[] = [];
      const allProducts: ExtractedProduct[] = [];
      let parseSource = '';

      for (const pageFile of pageFiles) {
        const pagePath = path.join(tempDir, pageFile);
        try {
          const pageBuffer = fs.readFileSync(pagePath);
          const pageResult = await this.recognizeImage(pageBuffer);

          if (pageResult.text) {
            textParts.push(pageResult.text);
          }
          if (pageResult.products && pageResult.products.length > 0) {
            allProducts.push(...pageResult.products);
            if (!parseSource && pageResult.parseSource) {
              parseSource = pageResult.parseSource;
            }
          }
        } catch (error) {
          Logger.error(`[OCR] 第 ${pageFile} 页图片 OCR 失败`, error);
        }
      }

      return {
        text: textParts.join('\n\n'),
        products: this.deduplicateProducts(allProducts),
        parseSource,
      };
    } finally {
      this.cleanupTempFiles(tempPdf);
      // 清理渲染的图片
      try {
        const leftovers = fs
          .readdirSync(tempDir)
          .filter((f) => f.startsWith(`pdf-page-${timestamp}`));
        for (const f of leftovers) {
          try {
            fs.unlinkSync(path.join(tempDir, f));
          } catch {
            // 忽略清理失败
          }
        }
      } catch {
        // 忽略清理失败
      }
    }
  }

  /**
   * 清理临时文件（忽略不存在的文件）
   */
  private cleanupTempFiles(...files: string[]): void {
    for (const f of files) {
      try {
        if (f && fs.existsSync(f)) fs.unlinkSync(f);
      } catch {
        // 忽略清理失败
      }
    }
  }

  /**
   * 识别图片中的文本
   * 方案: ① OCR Service（RapidOCR，内网部署，中文识别率高）
   *       ② Tesseract.js 本地识别（降级兜底）
   */
  async recognizeImage(
    imageBuffer: Buffer
  ): Promise<{ text: string; isTable: boolean; products?: ExtractedProduct[]; parseSource?: string }> {
    Logger.info('[OCR] 开始处理图片', { size: imageBuffer.length });

    // 🔥 优先调用 OCR Service（RapidOCR），中文表格识别准确率远高于 Tesseract.js
    const serviceResult = await this.recognizeWithOCRService(imageBuffer);
    if (serviceResult) {
      return serviceResult;
    }
    Logger.warn('[OCR] OCR Service 不可用或识别失败，降级使用 Tesseract.js 本地识别');

    try {
      const Tesseract = await import('tesseract.js');
      Logger.info('[OCR] 使用 Tesseract.js 识别图片...');

      const base64Image = imageBuffer.toString('base64');
      const dataUrl = `data:image/jpeg;base64,${base64Image}`;

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
      // 动态检测可用语言包：eng.traineddata 被 .gitignore 忽略，生产服务器可能只有 chi_sim，
      // 因此仅组合实际存在的语言，避免请求不存在的语言包导致加载失败。
      const availableLangs = ['chi_sim', 'eng']
        .filter((l) => fs.existsSync(path.join(process.cwd(), `${l}.traineddata`)))
        .join('+');
      const langDir = availableLangs.length > 0 ? process.cwd() : undefined;

      // 设置 TESSDATA_PREFIX，避免 tesseract core 在初始化时因找不到 datapath 而输出乱码警告。
      // 语言包位于项目根目录，tesseract.js 已通过 langPath 显式读取，此处仅消除 stderr 警告。
      if (langDir) {
        process.env.TESSDATA_PREFIX = langDir;
      }

      // 使用 createWorker 以便通过 setParameters 设置识别参数（tessedit_pageseg_mode 属于 WorkerParams）
      // gzip: false 必须显式设置：本地语言包是未压缩的 .traineddata，
      // 默认 gzip:true 会去找 .traineddata.gz（不存在），进而转 CDN 下载导致 Docker 内语言包加载失败
      const worker = await Tesseract.createWorker(availableLangs || 'eng', Tesseract.OEM.DEFAULT, {
        workerPath,
        ...(langDir ? { langPath: langDir } : {}),
        gzip: false,
        logger: (m: any) => {
          if (m.status === 'recognizing text') {
            Logger.debug(`[OCR] 识别进度: ${(m.progress * 100).toFixed(2)}%`);
          }
        },
      });

      try {
        // 优化识别参数：PSM.SINGLE_BLOCK（单文本块模式）
        await worker.setParameters({ tessedit_pageseg_mode: Tesseract.PSM.SINGLE_BLOCK });

        const result = await Promise.race([
          worker.recognize(dataUrl),
          new Promise<never>((_, reject) =>
            setTimeout(() => reject(new Error('Tesseract.js 识别超时（120秒）')), 120000)
          ),
        ]);

        const text = result.data.text;
        if (text && text.trim().length > 0) {
          Logger.info('[OCR] Tesseract.js 识别成功', { textLength: text.length });
          // 🔥 结构化解析链：规则解析 → AI 结构化解析 → 宽松 AI 解析 → 原始文本
          if (text.length > 20) {
            const structured = await this.extractStructuredProducts(text);
            if (structured.products.length > 0) {
              Logger.info('[OCR] 结构化解析成功', {
                source: structured.source,
                productCount: structured.products.length,
              });
            }
            return {
              text,
              isTable: this.isLikelyTable(text),
              products: structured.products,
              parseSource: structured.source,
            };
          }
          return { text, isTable: this.isLikelyTable(text) };
        } else {
          Logger.warn('[OCR] Tesseract.js 识别结果为空或太短，返回空字符串');
        }
      } finally {
        await worker.terminate();
      }
    } catch (error) {
      Logger.error('[OCR] Tesseract.js 识别失败:', error);
    }

    Logger.warn('[OCR] OCR 识别失败，无法提取图片文本');
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
   * 调用 OCR Service（RapidOCR）识别图片。
   * 成功时返回与 recognizeImage 一致的完整结果；不可用/失败时返回 null（由调用方降级）。
   */
  private async recognizeWithOCRService(
    imageBuffer: Buffer
  ): Promise<{ text: string; isTable: boolean; products?: ExtractedProduct[]; parseSource?: string } | null> {
    // 可通过 ENABLE_OCR_SERVICE=false 显式禁用（例如纯离线调试场景）
    if (process.env.ENABLE_OCR_SERVICE === 'false') {
      Logger.debug('[OCR] OCR Service 已通过 ENABLE_OCR_SERVICE=false 禁用');
      return null;
    }

    const serviceUrl = process.env.OCR_SERVICE_URL || 'http://ocr-service:8000';
    Logger.info('[OCR] 调用 OCR Service', { url: serviceUrl });

    let result: {
      success: boolean;
      text: string;
      lines?: { text: string; cells: string[]; y: number }[];
      table?: {
        headers: string[];
        rows: Record<string, string>[];
      } | null;
      product_count?: number;
      error?: string;
    } | null = null;

    try {
      const formData = new FormData();
      // Buffer 需转为 Blob 才能放入 FormData（Node 18+ 全局可用）
      const blob = new Blob([new Uint8Array(imageBuffer)], { type: 'application/octet-stream' });
      formData.append('file', blob, 'image.jpg');

      const response = await fetch(`${serviceUrl}/extract`, {
        method: 'POST',
        body: formData,
        signal: AbortSignal.timeout(30000), // 30秒超时
      });

      if (!response.ok) {
        Logger.warn('[OCR] OCR Service 请求失败', { status: response.status });
        return null;
      }
      result = await response.json();
    } catch (error) {
      Logger.warn('[OCR] OCR Service 调用异常（服务未启动或网络不通）:', error);
      return null;
    }

    if (!result || !result.success || !result.text || result.text.trim().length === 0) {
      Logger.warn('[OCR] OCR Service 识别结果为空', { success: result?.success, error: result?.error });
      return null;
    }

    // 保留行结构：优先使用按行分组的文本（表格规则解析依赖换行），否则用全文
    let text = result.text.trim();
    if (Array.isArray(result.lines) && result.lines.length > 0) {
      const lineText = result.lines
        .map((l) => (l && l.text ? l.text : ''))
        .filter((t) => t && t.trim())
        .join('\n');
      if (lineText.trim().length > 0) {
        text = lineText;
      }
    }

    Logger.info('[OCR] OCR Service 识别成功', {
      textLength: text.length,
      productCount: result.product_count,
      hasTable: !!(result.table && result.table.rows && result.table.rows.length > 0),
    });

    // 🔥 优先消费 OCR 服务端基于几何坐标重建的结构化表格。
    // 文本层的行解析会丢失列坐标，且无法恢复 OCR 已合并/丢弃的单元格；
    // 服务端表格重建直接按列几何位置切分，可避免“一行被拆成多个产品”的过度拆分问题。
    if (result.table && Array.isArray(result.table.rows) && result.table.rows.length > 0) {
      const tableProducts = this.buildProductsFromTable(result.table);
      if (tableProducts.length > 0) {
        Logger.info('[OCR] 使用服务端几何表格重建产品', {
          count: tableProducts.length,
          rowCount: result.table.rows.length,
        });
        return {
          text,
          isTable: true,
          products: tableProducts,
          parseSource: 'ocr-table-geometry',
        };
      }
    }

    if (text.length > 20) {
      const structured = await this.extractStructuredProducts(text);
      if (structured.products.length > 0) {
        Logger.info('[OCR] 结构化解析成功', {
          source: structured.source,
          productCount: structured.products.length,
        });
      }
      return {
        text,
        isTable: this.isLikelyTable(text),
        products: structured.products,
        parseSource: structured.source,
      };
    }
    return { text, isTable: this.isLikelyTable(text) };
  }

  /**
   * 从 OCR 服务端重建的结构化表格（几何坐标）直接构建产品列表。
   * 每行按列几何位置切分，单元格内容已归属到 name/model/brand/unit/quantity 等列，
   * 无需再经过文本拼接 → 启发式重解析，从根本上避免行列错位导致的过度拆分。
   */
  private buildProductsFromTable(table: {
    headers: string[];
    rows: Record<string, string>[];
  }): ExtractedProduct[] {
    if (!table || !Array.isArray(table.rows) || table.rows.length === 0) return [];

    const products: ExtractedProduct[] = [];
    for (const row of table.rows) {
      let rawName = (row.name || '').trim();
      const rawModel = (row.model || '').trim();

      // 名称列可能为空（OCR 把产品名识别到了参数描述列），尝试从参数描述列补名称
      if (!rawName && (row.parameter_description || row.specs)) {
        const fallback = String(row.parameter_description || row.specs || '').trim();
        // 取第一截有意义的产品名（遇到分号/逗号截断）
        rawName = fallback.split(/[;；,，]/)[0].trim();
      }

      // 名称与型号可能在几何分配时合并到同一列（OCR 合并了宽单元格），尝试从名称中拆分
      const product: ExtractedProduct = {
        name: rawName,
        model: rawModel,
        brand: '',
        specs: '',
        quantity: 1,
        unit: '',
        price: 0,
        total: 0,
      };
      this.splitModelFromName(product);

      const name = product.name.trim();
      const model = product.model.trim();
      // 既无名称也无型号的行视为无效行（如合计行、页脚碎片）
      if (!name && !model) continue;
      if (!name) continue;

      let brand = (row.brand || '').trim();
      // OCR 的品牌列可能只识别出残缺的单字（如 "普耐尔" → "尔"），此时不足为信；
      // 从产品名称内尝试提取已知品牌覆盖（长度 ≥2 的正常品牌不受影响）
      if (brand.length < 2) {
        const nameBrand = this.extractBrand(name);
        if (nameBrand) brand = nameBrand;
      }
      const parameterDesc = String(row.parameter_description || row.specs || '').trim();
      const specs = [model, parameterDesc].filter(Boolean).join(' ').trim();

      let quantity = this.toNumber(row.quantity, 1);
      let unit = (row.unit || '').trim() || '台';
      // OCR 表格几何路径：单位与数量有时被识别在同一格（如 "套3"），拆分
      const unitQty = unit.match(/^([个套台只件组批根块米吨支瓶袋箱条桶]+)\s*(\d+)$/);
      if (unitQty && !String(row.quantity || '').trim()) {
        unit = unitQty[1];
        quantity = parseInt(unitQty[2], 10);
      }
      const price = this.toNumber(row.unit_price, 0);
      const total = this.toNumber(row.total_price, 0);

      // 名称中的品牌前缀剥离：如 "南豫羊毛轮" -> 名称"羊毛轮"、品牌"南豫"
      let finalName = name;
      if (brand && finalName.startsWith(brand)) {
        finalName = finalName.slice(brand.length).trim() || name;
      }

      products.push({
        name: finalName,
        model,
        brand,
        specs,
        quantity: quantity > 0 && quantity < 100000 ? quantity : 1,
        unit,
        price: price >= 0 ? price : 0,
        total: total >= 0 ? total : 0,
        parameter_description: parameterDesc || undefined,
      });
    }

    return this.deduplicateProducts(products);
  }

  // ═══════════════════════════════════════════════════════════════════════════
  // JPG/PNG 图片结构化解析：规则解析 → AI 结构化解析 → 宽松 AI 解析 → 原始文本
  // ═══════════════════════════════════════════════════════════════════════════

  /**
   * 结构化产品提取链：规则解析 → AI 结构化解析 → 宽松 AI 解析 → 原始文本
   * 所有解析失败时返回空数组，由调用方降级使用原始文本
   */
  async extractStructuredProducts(text: string): Promise<{ products: ExtractedProduct[]; source: string }> {
    if (!text || text.trim().length === 0) {
      return { products: [], source: 'raw-text' };
    }

    // 第一步：规则解析（分隔符表格 + 表头/关键词/序号行综合解析）
    const ruleProducts = this.parseTableWithRules(text);
    if (ruleProducts.length > 0 && !this.isLowQualityProducts(ruleProducts)) {
      return { products: ruleProducts, source: 'rule-based' };
    }
    if (ruleProducts.length > 0) {
      Logger.info('[OCR] 规则解析结果质量不佳，尝试压缩表格解析...');
    }

    // 第 1.5 步：压缩表格解析（OCR 将整张表压成一行/无分隔符时，按「单位+数量」锚点切分产品段）
    // 解决 JPG 场景"Tesseract 识别成功但规则解析 productCount=0"的问题
    const compressedProducts = this.extractProductsFromCompressedText(text);
    if (compressedProducts.length > 0 && !this.isLowQualityProducts(compressedProducts)) {
      Logger.info('[OCR] 规则解析：识别到压缩表格，按单位+数量锚点提取', {
        count: compressedProducts.length,
      });
      return { products: compressedProducts, source: 'rule-based' };
    }

    // 第二步：AI 结构化解析。
    // 默认完全跳过 AI（生产环境网络不通时会卡 60s+ 超时）；需要时可设 OCR_ENABLE_AI=1 启用，
    // 启用后仍带 12s 超时保护，网络异常时快速降级返回。
    if (this.isAIFallbackEnabled() && text.length > 20) {
      Logger.info('[OCR] 规则解析无效，调用 AI 结构化解析...');
      const aiProducts = await this.withTimeout(this.parseProductsWithAI(text), 12000, 'AI 结构化解析');
      if (aiProducts.length > 0) {
        return { products: aiProducts, source: 'ai-structured' };
      }
    }

    // 第三步：宽松 AI 解析（文本包含产品关键词时重试）
    const hasProductKeywords = /产品|报价|清单|询价|采购|设备|材料|规格|型号/.test(text);
    if (this.isAIFallbackEnabled() && hasProductKeywords) {
      Logger.info('[OCR] 首次 AI 解析失败，使用宽松提示重试...');
      const looseProducts = await this.withTimeout(this.parseProductsWithAILoose(text), 12000, '宽松 AI 解析');
      if (looseProducts.length > 0) {
        return { products: looseProducts, source: 'ai-loose' };
      }
    }

    // 第四步：规则解析全部失败时，回退规则解析结果（低质量但优于空）
    if (ruleProducts.length > 0) {
      Logger.warn('[OCR] AI 解析失败，回退规则解析结果');
      return { products: ruleProducts, source: 'rule-based' };
    }

    // 第五步：所有解析失败，返回空数组（由调用方降级为原始文本）
    Logger.warn('[OCR] 所有解析方式均失败，返回原始文本');
    return { products: [], source: 'raw-text' };
  }

  /**
   * AI 兜底解析是否启用。
   * 默认禁用（生产环境 DeepSeek/Gemini 网络不通，避免 60s+ 长时间卡顿）；
   * 网络恢复后可设置环境变量 OCR_ENABLE_AI=1 重新启用。
   */
  private isAIFallbackEnabled(): boolean {
    return process.env.OCR_ENABLE_AI === '1';
  }

  /**
   * 给异步解析加上限时保护：超时后快速失败降级，避免长时间阻塞（网络异常场景）
   */
  private withTimeout<T>(promise: Promise<T>, ms: number, label: string): Promise<T> {
    let timer: ReturnType<typeof setTimeout> | null = null;
    const timeout = new Promise<never>((_, reject) => {
      timer = setTimeout(
        () => reject(new Error(`[OCR] ${label} 超时（${ms}ms），已降级为本地规则解析`)),
        ms,
      );
    });
    return Promise.race([promise, timeout]).finally(() => {
      if (timer) clearTimeout(timer);
    });
  }

  /**
   * 判断规则解析结果是否为低质量（OCR 乱码/噪声导致），用于决定是否触发 AI 兜底
   */
  private isLowQualityProducts(products: ExtractedProduct[]): boolean {
    if (products.length === 0) return false;
    const joinedNames = products.map((p) => p.name || '').join(' ');
    // 名称含明显 OCR 噪声字符（方括号/管道符/@/#/& 等）
    const hasGarbageChars = /[[\]{}|@#&<>]/.test(joinedNames);
    // 名称过短（<2 字符）且无规格描述
    const hasShortAndEmpty = products.some((p) => (p.name || '').length < 2 && !p.specs);
    return hasGarbageChars || hasShortAndEmpty;
  }

  /**
   * 使用规则解析 OCR 文本中的表格结构（优先级高于关键词提取）
   * 支持 Tab / 竖线 / 多空格分隔的规整表格；无法识别时回退到综合规则解析
   * @param text OCR 识别的原始文本
   * @returns 产品数组，如果解析失败返回空数组
   */
  private parseTableWithRules(text: string): ExtractedProduct[] {
    const lines = text.split('\n').filter((line) => line.trim().length > 0);
    if (lines.length === 0) return [];

    const hasTabSeparator = lines.some((line) => line.includes('\t'));
    const hasPipeSeparator = lines.some((line) => line.includes('|'));
    const hasMultipleSpaces = lines.some((line) => (line.match(/\s{3,}/g) || []).length >= 2);

    // 规整分隔符表格（Tab / 竖线 / 多空格）：尝试按列提取
    if (hasTabSeparator || hasPipeSeparator || hasMultipleSpaces) {
      const sep = hasTabSeparator ? '\t' : hasPipeSeparator ? '|' : null;
      const products = this.parseSeparatorTable(lines, sep);
      if (products.length > 0) {
        Logger.info('[OCR] 规则解析：识别到分隔符表格，按列提取', { count: products.length });
        return products;
      }
    }

    // 回退到已有的综合规则解析（表头识别 / 关键词 / 序号行）
    return this.extractProductsFromTable(text);
  }

  /**
   * 压缩表格解析：OCR 将整张表格压缩为连续文本（无换行、无有效分隔符）时，
   * 以「单位+数量」为锚点切分产品段，再从段内按分句拆分产品。
   * 典型输入："...羊毛轮10mm南豫羊毛轮; 抛光蜡白色; ...个1抛光蜡白色A南豫...个1普耐尔QQ150夹子 (1.6-2.4)...个5..."
   * 解决 JPG 场景"识别成功但表格结构丢失 → 按行解析全部失效 → productCount=0"的问题。
   */
  private extractProductsFromCompressedText(text: string): ExtractedProduct[] {
    if (!text || text.trim().length < 20) return [];
    // OCR 压缩表格中的空白无有效含义，整体去空白便于锚点定位
    const raw = text.replace(/\s+/g, '');

    // 1. 移除压缩表头（含 OCR 换行/分字变体）
    let body = raw;
    const compressedHeaders = [
      '产品名称型号品牌参数描述单位数量单价总价',
      '产品名称规格型号品牌单位数量单价总价',
      '序号产品名称型号品牌参数描述单位数量单价总价',
      '产品名称型号单位数量单价总价',
      '产品名称型号规格品牌参数描述单位数量单价总价',
      '名称规格型号单位数量单价金额备注',
    ];
    for (const header of compressedHeaders) {
      body = body.replace(header, '');
    }
    if (body.length < 10) return [];

    // 2. 以「单位+数量」为锚点定位产品段边界（如 "个1"、"套3"、"1个"、"3套"）
    const anchors = this.findQuantityAnchors(body);
    if (anchors.length === 0) return [];

    // 3. 按锚点切段，段内按分句拆分产品
    const products: ExtractedProduct[] = [];
    let prevEnd = 0;
    for (let i = 0; i < anchors.length; i++) {
      const a = anchors[i];
      const segText = body.slice(prevEnd, a.index);
      products.push(...this.parseCompressedSegment(segText, a.unit, a.quantity));
      prevEnd = a.end;
    }
    // 4. 尾部残留文本（无数量锚点，如跨行的规格描述），尝试解析为最后一段
    const tailText = body.slice(prevEnd);
    if (tailText.length >= 4) {
      products.push(...this.parseCompressedSegment(tailText, '', 1));
    }

    return products;
  }

  /**
   * 定位「单位+数量」锚点位置。
   * 支持两种顺序："个1"/"套3" 与 "1个"/"3套"；数量为 1-2 位数字。
   * 通过前置断言（后跟中文/字母/左括号）排除规格中的尺寸干扰，
   * 如 "3条400mm支腿" 中 "条" 后跟数字 400（3 位）不会误判，"11kW" 中数字在单位前也不误判。
   */
  private findQuantityAnchors(body: string): { index: number; unit: string; quantity: number; end: number }[] {
    const unitClass = '个套台只件组批根块米吨支瓶袋箱条';
    const anchors: { index: number; unit: string; quantity: number; end: number }[] = [];
    const push = (index: number, unit: string, quantity: number, end: number) => {
      if (quantity >= 1 && quantity < 1000) {
        anchors.push({ index, unit, quantity, end });
      }
    };

    // 模式1：单位+数量，如 "个1抛光蜡"、"套3不锈钢"、"个5Q235"
    const re1 = new RegExp(`([${unitClass}])(\\d{1,2})(?=[\\u4e00-\\u9fa5A-Za-z(（φΦ])`, 'g');
    let m: RegExpExecArray | null;
    while ((m = re1.exec(body)) !== null) {
      push(m.index, m[1], parseInt(m[2], 10), m.index + m[0].length);
    }
    // 模式2：数量+单位，如 "1个抛光蜡"、"3套不锈钢"
    const re2 = new RegExp(`(\\d{1,2})([${unitClass}])(?=[\\u4e00-\\u9fa5A-Za-z(（φΦ])`, 'g');
    while ((m = re2.exec(body)) !== null) {
      push(m.index, m[2], parseInt(m[1], 10), m.index + m[0].length);
    }
    // 模式3：文本末尾的 "单位+数量"（后面无字符，如 "...个5" 到结尾）
    const tail = body.match(new RegExp(`([${unitClass}])(\\d{1,2})$`));
    if (tail && tail.index !== undefined) {
      push(tail.index, tail[1], parseInt(tail[2], 10), body.length);
    }

    // 按位置排序并去重（同位置只保留第一个）
    anchors.sort((a, b) => a.index - b.index);
    const unique = anchors.filter((a, i) => i === 0 || a.index !== anchors[i - 1].index);
    return unique;
  }

  /**
   * 解析一个产品段：先按 ";" 分句，再区分「产品分句」与「规格分句」，
   * 规格分句完整保留为参数描述，产品分句逐个解析为独立产品（OCR 常把多行产品压成一段）。
   */
  private parseCompressedSegment(segText: string, unit: string, quantity: number): ExtractedProduct[] {
    if (!segText || segText.length < 2) return [];

    const clauses = segText
      .split(/[;；]+/)
      .map((s) => s.trim())
      .filter((s) => s.length > 0);
    if (clauses.length === 0) return [];

    // 段级品牌：整段内出现的品牌，供无品牌分句兜底（如 "枪尾 (黄)" 继承段内 "南豫"）
    const segmentBrand = this.getKnownBrands().find((b) => segText.includes(b)) || '';

    // 规格分句特征：含 "/"（材质/工艺描述）、规格单位（mm/kW）、结构描述词等；
    // 含已知品牌的分句优先视为产品分句（如 "羊毛轮10mm南豫羊毛轮" 即使含 mm 也是产品）
    const specMarker =
      /[/／]|mm|MM|kW|KW|kw|壁厚|防腐|材质|工艺|支腿|功率|电机|减速机|轴承|耐压|内外|顶盖|加药|Φ\d|φ\d|\d+[×xX*]\d+/;
    const isProductClause = (c: string): boolean => {
      if (this.getKnownBrands().some((b) => c.includes(b))) return true;
      if (specMarker.test(c)) return false;
      if (c.length > 30) return false;
      return true;
    };

    const productClauses: string[] = [];
    const specClauses: string[] = [];
    for (const c of clauses) {
      if (isProductClause(c)) {
        productClauses.push(c);
      } else {
        specClauses.push(c);
      }
    }

    // 去重产品分句（OCR 常重复相邻单元格）
    const seen = new Set<string>();
    const uniqueProductClauses: string[] = [];
    for (const c of productClauses) {
      if (!seen.has(c)) {
        seen.add(c);
        uniqueProductClauses.push(c);
      }
    }

    const specs = specClauses.length > 0 ? specClauses.join('; ') : '';
    const products: ExtractedProduct[] = [];
    // 锚点数量只赋给段内首个产品分句（原表该行的数量），其余被 OCR 压入的分句默认 1
    uniqueProductClauses.forEach((pc, idx) => {
      const q = idx === 0 ? quantity : 1;
      const parsed = this.parseCompressedProductClause(pc, specs, unit, q, segmentBrand);
      if (parsed) products.push(parsed);
    });
    return products;
  }

  /**
   * 从单个产品分句中解析 名称/型号/品牌：
   * 例："羊毛轮10mm南豫羊毛轮" → name=羊毛轮, model=10mm, brand=南豫
   *     "抛光蜡白色A南豫抛光蜡白色" → name=抛光蜡白色, model=A, brand=南豫
   *     "普耐尔QQ150夹子 (1.6-2.4)" → name=QQ150夹子, model=1.6-2.4, brand=普耐尔
   */
  private parseCompressedProductClause(
    clause: string,
    specs: string,
    unit: string,
    quantity: number,
    segmentBrand: string,
  ): ExtractedProduct | null {
    if (!clause || clause.length < 1) return null;

    // 品牌：分句内已知品牌优先，其次用段级品牌兜底
    let brand = segmentBrand || '';
    for (const b of this.getKnownBrands()) {
      if (clause.includes(b)) {
        brand = b;
        break;
      }
    }

    // 型号：尺寸/单位规格/区间规格等模式（不抓 "QQ150" 这类名称内含编号）
    let model = '';
    const modelPatterns = [
      /(?:φ|Φ)\d+(?:\.\d+)?[×xX*]\d+(?:\.\d+)?(?:mm|MM)?/, // Φ4000×3000
      /\d+(?:\.\d+)?(?:mm|MM|kW|KW|kw|M|m|V|v|A|a|W|w|L|l)/, // 10mm / 5M / 11kW
      /\d+(?:\.\d+)?\s*[-—–]\s*\d+(?:\.\d+)?/, // 1.6-2.4
      /\d+(?:\.\d+)?[×xX*]\d+(?:\.\d+)?/, // 4000×3000
    ];
    for (const p of modelPatterns) {
      const mm = clause.match(p);
      if (mm) {
        model = mm[0];
        break;
      }
    }
    // 孤立大写字母型号（品牌移除后）：如 "抛光蜡白色A抛光蜡白色" → A；
    // 要求两侧为中文，避免误删 "QQ150夹子" 中的 Q
    if (!model) {
      const nameForSingle = brand ? clause.replaceAll(brand, '') : clause;
      const singleLetter = nameForSingle.match(/(?<=[\u4e00-\u9fa5])[A-Z](?=[\u4e00-\u9fa5])/);
      if (singleLetter) {
        model = singleLetter[0];
      }
    }

    // 名称：去掉品牌、型号、括号尾巴，再处理"名称重复"（羊毛轮羊毛轮 → 羊毛轮）
    let name = clause;
    if (brand) name = name.replaceAll(brand, '');
    if (model) name = name.replaceAll(model, '');
    name = name.replace(/[（(].*?[)）]/g, '').trim();
    // 移除名称中残留的孤立大写字母（OCR 列错位残留，如 "QQ150夹子AQQ150夹子" → 删 A）
    name = name.replace(/(?<=[\u4e00-\u9fa5])[A-Z](?=[\u4e00-\u9fa5A-Z])/g, '');
    const dup = name.match(/^(.{2,}?)\1$/);
    if (dup) name = dup[1];
    name = name.replace(/^[\d.、．:：]+/, '').trim(); // 去掉序号前缀
    if (!name || name.length < 1) return null;

    const product: ExtractedProduct = {
      name,
      model,
      brand,
      specs: specs || clause,
      quantity: quantity >= 1 && quantity < 1000 ? quantity : 1,
      unit: unit || '个',
      price: 0,
      total: 0,
      parameter_description: specs || clause,
    };
    return product;
  }

  /**
   * 已知品牌词表（供压缩表格解析等复用）
   */
  private getKnownBrands(): string[] {
    return ['南豫', '普耐尔', '杰瑞浩', '金石', '兴燊', '良工', '德力西', '得力', '前田', '永拓', '犀瑞', '史丹利'];
  }

  /**
   * 规整分隔符表格按列提取：Tab / 竖线 / 多空格分隔的表格 → 产品数组
   * 通过表头定位 名称/规格/品牌/数量/单位/单价 列，逐行提取
   */
  private parseSeparatorTable(lines: string[], sep: string | null): ExtractedProduct[] {
    const splitCells = (line: string): string[] => {
      if (sep === '\t') return line.split('\t').map((c) => c.trim()).filter(Boolean);
      if (sep === '|') {
        return line
          .split('|')
          .map((c) => c.trim())
          .filter((c) => c && c !== '-' && c !== '—');
      }
      return line.split(/\s{2,}/).map((c) => c.trim()).filter(Boolean);
    };

    const rows: string[][] = [];
    for (const line of lines) {
      const cells = splitCells(line);
      if (cells.length >= 2) rows.push(cells);
    }
    if (rows.length < 2) return [];

    // 定位表头行（前 10 行内，需同时包含名称列与其他列）
    let headerIdx = -1;
    for (let i = 0; i < Math.min(10, rows.length); i++) {
      const joined = rows[i].join('').replace(/\s+/g, '');
      const hasName = /产品名称|设备名称|项目名称|品名|名称|物料/.test(joined);
      const hasOther = /规格|型号|数量|单位|单价|金额|总价|备注/.test(joined);
      if (hasName && hasOther) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) return [];

    // 识别各列位置
    let nameCol = -1;
    let specsCol = -1;
    let brandCol = -1;
    let qtyCol = -1;
    let unitCol = -1;
    let priceCol = -1;

    rows[headerIdx].forEach((cell, idx) => {
      const cs = cell.replace(/^[\d.、\s]+/, '').replace(/\s+/g, '');
      if (nameCol === -1 && /产品名称|设备名称|项目名称|品名|名称|物料/.test(cs)) nameCol = idx;
      else if (specsCol === -1 && /规格|型号|参数|描述/.test(cs)) specsCol = idx;
      else if (brandCol === -1 && /品牌|厂家|制造商|厂商/.test(cs)) brandCol = idx;
      else if (qtyCol === -1 && /数量|台数|套数/.test(cs)) qtyCol = idx;
      else if (unitCol === -1 && /单位/.test(cs)) unitCol = idx;
      else if (priceCol === -1 && /单价|含税单价|不含税单价/.test(cs)) priceCol = idx;
    });

    if (nameCol === -1) return [];

    // 逐行提取产品数据
    const products: ExtractedProduct[] = [];
    for (let i = headerIdx + 1; i < rows.length; i++) {
      const cells = rows[i];
      const lineText = cells.join(' ');
      if (/^(合计|总计|小计|备注|说明|注[:：])/.test(lineText)) break;

      const name = (cells[nameCol] || '').trim();
      if (!name || name.length < 2) continue;

      const specs = specsCol !== -1 && cells[specsCol] ? cells[specsCol].trim() : '';
      const brand = brandCol !== -1 && cells[brandCol] ? cells[brandCol].trim() : '';
      const unit = unitCol !== -1 && cells[unitCol] ? cells[unitCol].trim() : '台';
      const qtyStr = qtyCol !== -1 && cells[qtyCol] ? cells[qtyCol] : '';
      const qtyMatch = qtyStr.match(/\d+/);
      const quantity = qtyMatch ? parseInt(qtyMatch[0], 10) : 1;
      const price = priceCol !== -1 && cells[priceCol] ? this.toNumber(cells[priceCol], 0) : 0;

      const product: ExtractedProduct = {
        name,
        model: '',
        brand: brand || this.extractBrand(name),
        specs,
        quantity: quantity > 0 && quantity < 10000 ? quantity : 1,
        unit,
        price,
        total: price > 0 ? Math.round(price * quantity * 100) / 100 : 0,
        parameter_description: specs,
      };
      if (specs) this.extractModel(product, specs);
      products.push(product);
    }

    return products;
  }

  /**
   * 使用 AI 模型将 OCR 识别的混乱文本解析为结构化产品数据
   * @param rawText OCR 识别的原始文本
   * @returns 产品数组，如果解析失败返回空数组
   */
  private async parseProductsWithAI(rawText: string): Promise<ExtractedProduct[]> {
    if (!process.env.DEEPSEEK_API_KEY) {
      Logger.warn('[OCR] AI 结构化解析不可用: DEEPSEEK_API_KEY 未配置，跳过');
      return [];
    }

    const prompt = `你是一个专业的数据提取助手。请从以下 OCR 识别的文本中，提取产品清单。

## OCR 原始文本：
${rawText}

## 文本特点说明：
- 文本来自图片 OCR 识别，表格结构已丢失，产品信息连续排列
- 每个产品可能包含：产品名称、型号、品牌、参数描述、单位、数量、单价、总价
- 参数描述通常以";"分隔，包含材质、规格、工艺等信息（如"Q235B碳钢/壁厚10mm; 环氧树脂内外防腐/带顶盖及活动加药孔"）
- 品牌名称（如"南豫""普耐尔"）通常紧邻产品名称出现（位于名称之前或附近）
- 产品名称可能与参数描述不在同一片段，需根据上下文判断归属

## 产品边界识别规则（非常重要）：
1. 相邻产品通常以";"、序号、或"单位+数量"（如"个1""套3"）作为分隔
2. 当一段参数描述结束后出现下一个产品名称（品牌+名称或名称开头）时，即为新产品起点
3. 如果产品名称未直接出现，但参数描述、数量、单位齐全，也要根据上下文推断为一个产品（例如"Q235B碳钢/壁厚10mm; ..."应归属于前文提到的"PAM搅拌罐"）
4. 每个产品独立一条记录，严禁合并多个产品，即使它们共享相同的参数描述

## 字段提取规则：
1. **产品名称（name）**：产品的主体名称（如"羊毛轮""抛光蜡白色""PAM搅拌罐"），不要包含品牌前缀和型号后缀
2. **型号（model）**：规格型号（如"10mm""5M""Φ4000×3000""11kW""1.6-2.4"），无法识别则为空字符串""
3. **品牌（brand）**：品牌名称（如"南豫""普耐尔"），没有则为空字符串""
4. **参数描述（spec）**：完整保留该产品的技术参数，不要截断、不要遗漏任何";"分隔的子项
5. **单位（unit）**：个/套/台/米/支 等，无法识别则为"个"
6. **数量（quantity）**：数字，无法识别则为 1
7. **单价（price）/总价（total）**：如原文有则填数字，没有则为 0

## 输出格式：
只输出一个 JSON 数组，不要输出任何其他内容（不要 Markdown 代码块、不要解释文字）：
[
  {
    "name": "产品名称",
    "model": "型号",
    "brand": "品牌",
    "spec": "完整参数描述",
    "unit": "单位",
    "quantity": 数量,
    "price": 单价,
    "total": 总价
  }
]

## 重要约束：
1. 参数描述必须完整，不要截断
2. 严禁合并不同产品
3. 品牌、型号若确实无法识别，使用空字符串""，不要随意编造
4. 只输出 JSON 数组`;

    try {
      Logger.info('[OCR] 调用 AI 结构化解析...');
      const response = await callDeepSeekChat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.1,
        maxTokens: 4096,
      });
      const products = this.postProcessProducts(this.parseAIProductsJSON(response.text), rawText);
      Logger.info('[OCR] AI 结构化解析完成', { count: products.length });
      return products;
    } catch (error) {
      Logger.warn('[OCR] AI 结构化解析失败:', error);
      return [];
    }
  }

  /**
   * 使用宽松提示进行 AI 解析（当首次解析失败时备用）
   * @param rawText OCR 识别的原始文本
   * @returns 产品数组，如果解析失败返回空数组
   */
  private async parseProductsWithAILoose(rawText: string): Promise<ExtractedProduct[]> {
    if (!process.env.DEEPSEEK_API_KEY) {
      Logger.warn('[OCR] 宽松 AI 解析不可用: DEEPSEEK_API_KEY 未配置，跳过');
      return [];
    }

    const prompt = `请从以下 OCR 识别文本中，尽可能提取产品信息。文本可能来自询价单、报价单、采购清单等。

## OCR 原始文本：
${rawText}

## 文本特点说明：
- 文本来自图片 OCR 识别，表格结构已丢失，产品信息连续排列
- 参数描述通常以";"分隔，包含材质/规格/工艺等信息
- 品牌名称（如"南豫""普耐尔"）通常紧邻产品名称出现

## 提取规则：
1. 每个产品独立一条记录，严禁合并多个产品
2. 字段包括：name（产品名称）、model（型号，如 10mm/5M/Φ4000×3000/11kW）、brand（品牌，如 南豫/普耐尔，无则为空字符串""）、spec（完整参数描述，不要截断）、unit（单位，如 个/套/台）、quantity（数量）、price（单价，无则为 0）
3. 如果文本中没有明确的产品信息，返回空数组 []
4. 只输出 JSON 数组，不要任何其他内容

## 示例输出：
[
  { "name": "产品A", "model": "10mm", "brand": "某品牌", "spec": "材质/工艺说明", "unit": "个", "quantity": 10, "price": 100 },
  { "name": "产品B", "model": "11kW", "brand": "", "spec": "不锈钢搅拌器/380V", "unit": "套", "quantity": 5, "price": 200 }
]`;

    try {
      Logger.info('[OCR] 调用宽松 AI 解析...');
      const response = await callDeepSeekChat({
        messages: [{ role: 'user', content: prompt }],
        temperature: 0.2,
        maxTokens: 4096,
      });
      const products = this.postProcessProducts(this.parseAIProductsJSON(response.text), rawText);
      Logger.info('[OCR] 宽松 AI 解析完成', { count: products.length });
      return products;
    } catch (error) {
      Logger.warn('[OCR] 宽松 AI 解析失败:', error);
      return [];
    }
  }

  /**
   * 解析 AI 返回的 JSON 数组，规范化为 ExtractedProduct
   * AI 可能返回 Markdown 代码块包裹或夹带说明文字，兼容处理
   */
  private parseAIProductsJSON(content: string): ExtractedProduct[] {
    if (!content || typeof content !== 'string') return [];
    const jsonMatch = content.match(/\[[\s\S]*\]/);
    if (!jsonMatch) return [];
    try {
      const parsed = JSON.parse(jsonMatch[0]);
      if (!Array.isArray(parsed)) return [];
      const products: ExtractedProduct[] = [];
      for (const item of parsed) {
        const product = this.normalizeAIProduct(item);
        if (product) products.push(product);
      }
      return products;
    } catch (error) {
      Logger.warn('[OCR] AI 返回的 JSON 解析失败:', error);
      return [];
    }
  }

  /**
   * 将 AI 输出的产品对象规范化为 ExtractedProduct
   */
  private normalizeAIProduct(item: unknown): ExtractedProduct | null {
    if (!item || typeof item !== 'object') return null;
    const obj = item as Record<string, unknown>;
    const name = String(obj.name || obj['产品名称'] || obj.productName || '').trim();
    if (!name || name.length < 1) return null;

    const specs = String(obj.spec || obj.specs || obj.parameter_description || obj['规格'] || obj['参数'] || '').trim();
    const quantity = this.toNumber(obj.quantity, 1);
    const price = this.toNumber(obj.price, 0);
    const total = this.toNumber(obj.total, 0);
    const unit = String(obj.unit || obj['单位'] || '台').trim();

    const product: ExtractedProduct = {
      name,
      model: String(obj.model || obj['型号'] || '').trim(),
      brand: String(obj.brand || obj['品牌'] || '').trim(),
      specs,
      quantity: quantity > 0 && quantity < 10000 ? quantity : 1,
      unit: unit || '台',
      price: price >= 0 ? price : 0,
      total: total >= 0 ? total : 0,
      parameter_description: specs,
    };
    return product;
  }

  /**
   * AI 解析结果后处理：修正明显错误的字段，提升整体准确率
   * 1. 品牌为空时，从原始文本中产品名称附近提取品牌
   * 2. 名称为空/过短时，从参数描述中补充
   * 3. 数量非法时，从参数描述中提取
   * 4. 名称中混杂型号时，分离到 model 字段
   * 5. 合并名称重复的产品
   */
  private postProcessProducts(products: ExtractedProduct[], rawText: string): ExtractedProduct[] {
    if (products.length === 0) return products;

    const processed = products.map((item) => {
      const p: ExtractedProduct = { ...item, specs: (item.specs || '').trim() };

      // 1. 品牌为空时，从原始文本中产品名称附近提取品牌
      if (!p.brand) {
        const brand = this.extractBrandFromContext(rawText, p.name);
        if (brand) {
          p.brand = brand;
          Logger.debug('[OCR] 后处理：补充品牌', { name: p.name, brand });
        }
      }

      // 2. 名称为空或过短且无品牌信息时，尝试从参数描述中补充
      if (p.name.length < 2 && p.specs) {
        const nameFromSpecs = this.extractNameFromSpecs(p.specs);
        if (nameFromSpecs && nameFromSpecs.length >= 2) {
          p.name = nameFromSpecs;
          Logger.debug('[OCR] 后处理：从参数描述补充产品名称', { name: p.name });
        }
      }

      // 3. 数量非法时，从参数描述中提取
      if (!p.quantity || p.quantity <= 0 || p.quantity >= 10000) {
        const qty = this.extractQuantityFromSpecs(`${p.name} ${p.specs}`.trim());
        p.quantity = qty > 0 ? qty : 1;
        if (qty > 0) {
          Logger.debug('[OCR] 后处理：从参数描述提取数量', { quantity: p.quantity });
        }
      }

      // 4. 规格与名称重复时，清除无意义的重复
      if (p.specs && p.name && p.specs === p.name) {
        p.specs = '';
      }

      // 5. 名称中混杂型号时，分离到 model 字段
      this.splitModelFromName(p);

      return p;
    });

    // 6. 合并名称重复的产品（AI 可能因 OCR 重叠输出重复行）
    return this.deduplicateProducts(processed);
  }

  /**
   * 从原始文本中产品名称附近提取品牌（品牌通常紧邻产品名称出现）
   */
  private extractBrandFromContext(rawText: string, productName: string): string {
    if (!rawText || !productName || productName.length < 2) return '';
    const name = productName.replace(/\s+/g, '');
    const searchText = rawText.replace(/\s+/g, '');
    const idx = searchText.indexOf(name);
    if (idx === -1) return '';
    // 取产品名称前后 80 字符作为上下文
    const start = Math.max(0, idx - 80);
    const end = Math.min(searchText.length, idx + name.length + 80);
    const context = searchText.slice(start, end);
    const brand = this.extractBrand(context);
    if (brand && brand !== productName) return brand;
    return '';
  }

  /**
   * 将产品名称中混入的型号分离到 model 字段
   * 如 "羊毛轮10mm" -> name="羊毛轮", model="10mm"
   *    "抛光蜡白色 A" -> name="抛光蜡白色", model="A"
   */
  private splitModelFromName(p: ExtractedProduct): void {
    if (!p.name || p.model) return;
    const name = p.name.trim();
    // 名称末尾紧贴的型号特征：Φ/φ 尺寸、数字+单位（mm/kW/M/V/A）、字母+数字型号、单字母型号
    const modelMatch = name.match(
      /^([\u4e00-\u9fa5A-Za-z0-9（）()φΦ×xX]+?)[\s]?((?:φ|Φ)?\d+(?:\.\d+)?[×xX*]\d+(?:\.\d+)?(?:mm|MM)?|\d+(?:\.\d+)?(?:mm|MM|kW|KW|kw|M|m|V|v|A|a|W|w|L|l)|[A-Z]{2,}\d+(?:[-–—]\d+)*|[A-Z])$/i
    );
    if (!modelMatch) return;
    const prefix = (modelMatch[1] || '').trim();
    const model = (modelMatch[2] || '').trim();
    if (prefix.length >= 1 && model.length >= 1 && !prefix.endsWith(model)) {
      p.name = prefix;
      p.model = model;
      Logger.debug('[OCR] 后处理：从名称分离型号', { name: prefix, model });
    }
  }

  /**
   * 从参数描述文本中提取数量（优先 "N+单位" 模式，其次 "数量:N" 模式）
   */
  private extractQuantityFromSpecs(text: string): number {
    if (!text) return 0;
    const labeled = text.match(/数量[：:\s]*(\d+)/);
    if (labeled) {
      const q = parseInt(labeled[1], 10);
      if (q > 0 && q < 10000) return q;
    }
    const withUnit = text.match(/(\d+)\s*(个|套|台|只|件|组|批|根|块|米|吨|支|瓶|袋|箱)/);
    if (withUnit) {
      const q = parseInt(withUnit[1], 10);
      if (q > 0 && q < 10000) return q;
    }
    return 0;
  }

  /**
   * 从参数描述开头提取产品名称（名称为空/过短时的兜底）
   */
  private extractNameFromSpecs(specs: string): string {
    if (!specs) return '';
    const m = specs.match(/^([\u4e00-\u9fa5A-Za-z0-9φΦ×xX（）()]{2,20})/);
    return m ? m[1] : '';
  }

  /**
   * 合并名称重复的产品
   * - 名称相同且规格相同/一方为空 → 视为同一产品，数量不同则累加，补齐缺失字段
   * - 名称相同但规格不同 → 视为不同产品，均保留
   */
  private deduplicateProducts(products: ExtractedProduct[]): ExtractedProduct[] {
    const result: ExtractedProduct[] = [];
    for (const item of products) {
      const p = { ...item };
      const key = this.productKey(p);
      if (!key) {
        result.push(p);
        continue;
      }
      const existing = result.find((e) => this.productKey(e) === key);
      if (!existing) {
        result.push(p);
        continue;
      }
      const specsSame = !existing.specs || !p.specs || existing.specs === p.specs;
      if (specsSame) {
        // 数量不同说明是同一产品被拆分为多行，累加；数量相同说明是 OCR 重叠行，保持
        if (existing.quantity !== p.quantity) {
          existing.quantity = (existing.quantity || 0) + (p.quantity || 0);
        }
        if (!existing.specs && p.specs) existing.specs = p.specs;
        if (!existing.model && p.model) existing.model = p.model;
        if (!existing.brand && p.brand) existing.brand = p.brand;
        if (!existing.price && p.price) existing.price = p.price;
        if (!existing.total && p.total) existing.total = p.total;
      } else {
        result.push(p);
      }
    }
    return result;
  }

  /**
   * 产品去重键：名称去空格
   */
  private productKey(p: ExtractedProduct): string {
    if (!p.name || p.name.length < 2) return '';
    return p.name.replace(/\s+/g, '').trim();
  }

  /**
   * 将任意值安全转为数字（支持 "1,200"、"￥100.5"、"1.5 台" 等格式）
   */
  private toNumber(value: unknown, defaultValue: number): number {
    if (value === undefined || value === null || value === '') return defaultValue;
    if (typeof value === 'number') return isNaN(value) ? defaultValue : value;
    const num = parseFloat(String(value).replace(/[,，\s元￥¥]/g, ''));
    return isNaN(num) ? defaultValue : num;
  }

  /**
   * 修复 OCR 中文分字问题：把被 Tesseract.js 错误拆成单字的中文字符合并回词
   * 例如 "序 号 产 品 名 称" -> "序号 产品 名称"
   * 保留原有词与词之间的空格（列分隔），只合并相邻单字中文片段
   */
  private normalizeChineseOCRSpacing(text: string): string {
    const chineseChar = /[\u4e00-\u9fa5]/;
    const parts = text.split(/\s+/);
    const merged: string[] = [];
    let buffer = '';

    for (const part of parts) {
      if (part.length === 1 && chineseChar.test(part)) {
        buffer += part;
      } else {
        if (buffer) {
          merged.push(buffer);
          buffer = '';
        }
        merged.push(part);
      }
    }
    if (buffer) merged.push(buffer);

    return merged.join(' ');
  }

  /**
   * 基于表头词表合并被 OCR 打散的单字：
   * 例如 ['序','号','产','品','名','称','规','格','型','号']
   * -> ['序号','产品名称','规格型号']
   */
  private mergeHeaderByDictionary(fragments: string[]): string[] {
    const headerWords = [
      '产品名称', '设备名称', '项目名称', '规格型号',
      '数量', '单位', '单价', '总价', '金额', '品牌', '厂家', '备注',
      '序号', '产品', '设备', '项目', '品名', '名称', '规格', '型号',
      '参数', '描述', '台数', '套数'
    ].sort((a, b) => b.length - a.length);

    const result: string[] = [];
    let i = 0;
    while (i < fragments.length) {
      let matched = false;
      for (const word of headerWords) {
        let combined = '';
        let j = i;
        while (j < fragments.length && combined.length < word.length) {
          combined += fragments[j];
          j++;
        }
        if (combined === word) {
          result.push(word);
          i = j;
          matched = true;
          break;
        }
      }
      if (!matched) {
        result.push(fragments[i]);
        i++;
      }
    }
    return result;
  }

  /**
   * 从文本中提取产品信息
   */
  extractProductsFromTable(text: string): ExtractedProduct[] {
    const lines = text.split('\n').filter((l) => l.trim());
    Logger.info('[OCR] 开始解析文本', { lineCount: lines.length });

    const products: ExtractedProduct[] = [];

    // 🔥 优先表头识别：含"产品名称/名称 + 规格/数量"表头的表格单据，
    // 关键词路径在"序号 名称 规格 数量 单位"行上会误解析（吞序号/合并行/数量错），
    // 因此检测到表头时直接走按列解析
    if (this.hasTableHeader(lines)) {
      const headerProducts = this.extractProductsByTableHeader(lines);
      if (headerProducts.length > 0) {
        Logger.info('[OCR] 检测到表头，通过表头识别提取到产品', {
          productCount: headerProducts.length,
        });
        return headerProducts;
      }
      Logger.info('[OCR] 检测到表头但按列解析失败，降级关键词提取');
    }

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

    // 🔥 增强：硬编码关键词未命中时，尝试通用表头识别（支持任意产品名）
    if (products.length === 0) {
      const headerProducts = this.extractProductsByTableHeader(lines);
      if (headerProducts.length > 0) {
        Logger.info('[OCR] 通过表头识别提取到产品', { productCount: headerProducts.length });
        return headerProducts;
      }
    }

    // 🔥 增强：仍无产品时，尝试"序号 + 产品名 + 数量"行模式（无表头/表头被OCR打散的单据）
    if (products.length === 0) {
      const sequenceProducts = this.extractProductsBySequence(lines);
      if (sequenceProducts.length > 0) {
        Logger.info('[OCR] 通过序号行模式提取到产品', { productCount: sequenceProducts.length });
        return sequenceProducts;
      }
    }

    Logger.info('[OCR] 提取完成', { productCount: products.length });
    return products;
  }

  /**
   * 序号行模式兜底：形如 "1. 某某设备 φ4000 3台" / "1、搅拌罐 2套" 的行，
   * 不依赖表头与硬编码关键词（适用于 OCR 将表头打散或纯文本单据）
   */
  private extractProductsBySequence(lines: string[]): ExtractedProduct[] {
    // 跳过明显非产品信息的行
    const skipPattern = /公司|地址|电话|联系|传真|邮箱|网址|www|http|银行|税号|开户|邮编|日期|询价单|报价单|序号|合计|总计|小计|备注|说明|注[:：]|单位[:：]|产品名称|规格型号|联系人|供应商|客户/;

    const products: ExtractedProduct[] = [];
    for (let i = 0; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;
      if (skipPattern.test(rawLine)) continue;

      // 修复 OCR 中文分字：产 品 名 称 -> 产品名称
      const line = this.normalizeChineseOCRSpacing(rawLine);

      // 序号开头：1-3位数字 + 点/顿号/冒号/空格（如 "1. 搅拌罐"、"1 搅拌罐"）
      const seqMatch = line.match(/^(\d{1,3})[\s.、．:：]+(.+)$/);
      if (!seqMatch) continue;

      const nameAndRest = seqMatch[2].trim();
      if (nameAndRest.length < 2) continue;

      // 提取产品名：取连续中文（或中文+字母数字）开头
      const nameMatch = nameAndRest.match(/^([\u4e00-\u9fa5A-Za-z0-9φΦ×Xx\-（）()]+?)[\s，,。;；/]+/);
      const name = nameMatch ? nameMatch[1] : nameAndRest.split(/\s+/)[0];
      if (!name || name.length < 2 || /^\d+$/.test(name)) continue;

      // 提取数量：行内 "数字+单位" 或行尾数字
      let quantity = 1;
      let unit = '';
      const qtyMatch = nameAndRest.match(/(\d+)\s*(台|套|个|只|件|组|批|根|块|米|吨)/);
      if (qtyMatch) {
        quantity = parseInt(qtyMatch[1]);
        unit = qtyMatch[2];
      } else {
        const bareNum = nameAndRest.match(/(\d+)\s*$/);
        if (bareNum) quantity = parseInt(bareNum[1]);
      }

      if (quantity <= 0 || quantity >= 1000) quantity = 1;

      products.push({
        name,
        model: '',
        brand: this.extractBrand(name),
        specs: nameAndRest.replace(name, '').trim(),
        quantity,
        unit: unit || '台',
        price: 0,
        total: 0,
        parameter_description: nameAndRest,
      });

      // 跳过可能跨行的规格描述（直到下一序号行）
      let j = i + 1;
      while (j < lines.length && j < i + 3) {
        const nl = this.normalizeChineseOCRSpacing(lines[j].trim());
        if (/^\d{1,3}[\s.、．:：]+/.test(nl)) break;
        j++;
      }
      i = j - 1;
    }

    return products;
  }

  /**
   * 通用表头识别：查找含"产品名称/名称 + 规格/数量"的表头行，
   * 按列解析后续数据行（不依赖硬编码产品关键词）
   */
  /**
   * 检测文本是否含表头（前 25 行内，"名称 + 规格/型号 或 名称 + 数量/单位"）
   */
  private hasTableHeader(lines: string[]): boolean {
    for (let i = 0; i < Math.min(25, lines.length); i++) {
      const normalized = lines[i].replace(/\s+/g, '');
      const hasName = /产品名称|设备名称|项目名称|品名|名称/.test(normalized);
      const hasSpecs = /规格|型号/.test(normalized);
      const hasQty = /数量|台数|套数|单位/.test(normalized);
      if ((hasName && hasSpecs) || (hasName && hasQty)) {
        return true;
      }
    }
    return false;
  }

  private extractProductsByTableHeader(lines: string[]): ExtractedProduct[] {
    // 1. 查找表头行（前 25 行内；OCR 可能把中文按空格打散，匹配时先去空白）
    let headerIdx = -1;
    for (let i = 0; i < Math.min(25, lines.length); i++) {
      const line = lines[i];
      const normalized = line.replace(/\s+/g, '');
      const hasName = /产品名称|设备名称|项目名称|品名|名称/.test(normalized);
      const hasSpecs = /规格|型号/.test(normalized);
      const hasQty = /数量|台数|套数|单位/.test(normalized);
      if ((hasName && hasSpecs) || (hasName && hasQty)) {
        headerIdx = i;
        break;
      }
    }
    if (headerIdx === -1) return [];

    // 2. 切分表头确定各列索引（优先 Tab/多空格，其次单空格）
    const splitCells = (line: string): string[] => {
      if (line.includes('\t')) return line.split('\t').map(c => c.trim()).filter(Boolean);
      const multi = line.split(/\s{2,}/).map(c => c.trim()).filter(Boolean);
      if (multi.length >= 2) return multi;
      return line.split(/\s+/).map(c => c.trim()).filter(Boolean);
    };

    // OCR 可能把表头每个字都拆开，先用词表合并成完整列名
    const rawHeaderCells = splitCells(lines[headerIdx]);
    const headerCells = this.mergeHeaderByDictionary(rawHeaderCells);
    if (headerCells.length < 2) return [];

    // 2.5 合并 OCR 误拆的数据碎片行
    // 表格中一个产品行应跨多列；若某行切分后列数很少（<3），
    // 且不像独立新产品行，则把它合并到上一行。
    const minValidCols = Math.max(2, Math.floor(headerCells.length / 2));
    const mergedDataLines: string[] = [];
    for (let i = headerIdx + 1; i < lines.length; i++) {
      const rawLine = lines[i].trim();
      if (!rawLine) continue;
      const line = this.normalizeChineseOCRSpacing(rawLine);
      if (/^合计|^总计|^小计|^备注|^说明|^注[:：]/.test(line)) {
        mergedDataLines.push(line);
        continue;
      }

      const cells = splitCells(line).filter(c => c.length > 0);
      const looksLikeNewProduct =
        /^\d{1,3}[.．、\s]/.test(line) || // 序号开头
        /\d+\s*[个只台套件把盒支根块米吨条]$/.test(line) || // 数量+单位结尾
        cells.length >= minValidCols;

      if (mergedDataLines.length > 0 && cells.length <= 2 && !looksLikeNewProduct) {
        mergedDataLines[mergedDataLines.length - 1] += ' ' + line;
      } else {
        mergedDataLines.push(line);
      }
    }

    let nameCol = -1;
    let specsCol = -1;
    let qtyCol = -1;
    let unitCol = -1;

    headerCells.forEach((cell, idx) => {
      const cs = cell.replace(/^[\d.、\s]+/, '').replace(/\s+/g, ''); // 去掉"序号"前缀与OCR空格
      if (/产品名称|设备名称|项目名称|品名|名称/.test(cs)) nameCol = idx;
      else if (/规格|型号|参数|描述/.test(cs)) specsCol = idx;
      else if (/数量|台数|套数/.test(cs)) qtyCol = idx;
      else if (/单位/.test(cs)) unitCol = idx;
    });

    if (nameCol === -1) return [];

    // 3. 解析表头后的数据行：合并数据行中被拆散的单字中文
    // 例如 ['普','耐','尔','QQ150',...] -> ['普耐尔','QQ150',...]
    // 例如 ['夹','子（1.6-2.4）',...] -> ['夹子（1.6-2.4）',...]
    const mergeSingleChinese = (cells: string[]): string[] => {
      const chineseChar = /[\u4e00-\u9fa5]/;
      const merged: string[] = [];
      let buffer = '';
      for (const cell of cells) {
        if (cell.length === 1 && chineseChar.test(cell)) {
          buffer += cell;
        } else {
          if (buffer) {
            if (chineseChar.test(cell.charAt(0))) {
              merged.push(buffer + cell);
            } else {
              merged.push(buffer);
              merged.push(cell);
            }
            buffer = '';
          } else {
            merged.push(cell);
          }
        }
      }
      if (buffer) merged.push(buffer);
      return merged;
    };

    const products: ExtractedProduct[] = [];
    for (let i = 0; i < mergedDataLines.length; i++) {
      const line = mergedDataLines[i];
      // 遇到合计/备注等停止
      if (/^合计|^总计|^小计|^备注|^说明|^注[:：]/.test(line)) break;

      const rowCells = mergeSingleChinese(splitCells(line));
      if (rowCells.length <= nameCol) continue;

      // 当 OCR 把长产品名拆成多列时，数据行的列数会超过表头。
      // 这种情况下从行尾重新定位数量+单位，并把名称到数量之间的单元合并。
      let rowNameCol = nameCol;
      let rowSpecsCol = specsCol;
      let rowQtyCol = qtyCol;
      let rowUnitCol = unitCol;
      const unitPattern = /^[个只台套件把盒支根块米吨条]/;
      if (rowCells.length > headerCells.length) {
        let realQtyCol = -1;
        let realUnitCol = -1;
        for (let k = rowCells.length - 1; k > nameCol; k--) {
          if (realUnitCol === -1 && unitPattern.test(rowCells[k])) {
            realUnitCol = k;
          } else if (realUnitCol !== -1 && realQtyCol === -1 && /^\d+$/.test(rowCells[k])) {
            realQtyCol = k;
            break;
          }
        }
        if (realQtyCol !== -1 && realQtyCol > nameCol) {
          const mergedName = rowCells.slice(nameCol, realQtyCol).join('');
          rowCells[nameCol] = mergedName;
          for (let k = nameCol + 1; k < realQtyCol; k++) rowCells[k] = '';
          rowQtyCol = realQtyCol;
          rowUnitCol = realUnitCol !== -1 ? realUnitCol : unitCol;
          // 紧邻数量前面的非空单元作为规格兜底
          if (realQtyCol - 1 > nameCol && rowCells[realQtyCol - 1]) {
            rowSpecsCol = realQtyCol - 1;
          }
        }
      }

      const name = (rowCells[rowNameCol] || '').trim();
      if (!name || name.length < 2) continue;

      const specs = rowSpecsCol !== -1 && rowCells[rowSpecsCol] ? rowCells[rowSpecsCol].trim() : '';
      const qtyStr = rowQtyCol !== -1 && rowCells[rowQtyCol] ? rowCells[rowQtyCol] : '';
      const unit = rowUnitCol !== -1 && rowCells[rowUnitCol] ? rowCells[rowUnitCol].trim() : '';

      const qtyMatch = qtyStr.match(/\d+/);
      const quantity = qtyMatch ? parseInt(qtyMatch[0]) : 1;

      products.push({
        name,
        model: '',
        brand: this.extractBrand(name),
        specs,
        quantity: quantity > 0 && quantity < 1000 ? quantity : 1,
        unit: unit || '台',
        price: 0,
        total: 0,
        parameter_description: specs,
      });
    }

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
    const knownBrands = ['南豫', '杰瑞浩', '金石', '兴燊', '良工', '德力西', '得力', '前田', '永拓', '犀瑞', '史丹利', '普耐尔'];
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
        if (brand.length >= 2 && !nonBrandWords.some((w) => brand.includes(w) || w.includes(brand))) {
          Logger.debug('[OCR] 提取到品牌', { brand });
          return brand;
        }
      }
    }

    // 3. 常见品牌名模式：中文品牌 + 产品关键词（排除非品牌词）
    // "普耐尔QQ150夹子" -> "普耐尔", "普耐尔氩弧焊枪5M" -> "普耐尔"
    const brandPattern = /([\u4e00-\u9fa5]{2,4})(?:QQ?\d|氩弧|焊枪|夹子|羊毛轮|抛光|枪尾|搅拌罐|储罐|反应釜|搅拌|水泵|风机|空压|电机|阀门|管道|焊机|切割|打磨|压缩机|发电机|钻机)/;
    const brandMatch = text.match(brandPattern);
    if (brandMatch && brandMatch[1]) {
      const brand = brandMatch[1].trim();
      if (brand.length >= 2 && !nonBrandWords.some((w) => brand.includes(w) || w.includes(brand))) {
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
