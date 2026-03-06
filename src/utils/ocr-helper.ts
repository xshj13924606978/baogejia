import { exec } from 'child_process';
import { promisify } from 'util';
import * as fs from 'fs';
import * as path from 'path';
import * as os from 'os';
import { Logger } from '@/lib/logger';

const execAsync = promisify(exec);

export interface ExtractedProduct {
  name: string;
  model: string;
  specs: string;
  quantity: number;
  unit: string;
  price: number;
  total: number;
}

export class OcrHelper {
  private toolsAvailable: boolean | null = null;

  /**
   * 检查系统工具是否可用
   */
  private async checkTools(): Promise<boolean> {
    if (this.toolsAvailable !== null) {
      return this.toolsAvailable;
    }

    try {
      await execAsync('which pdftotext');
      Logger.info('[OCR] pdftotext 可用');
      this.toolsAvailable = true;
      return true;
    } catch (error) {
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
        await execAsync(`pdftotext -layout ${tempPdf} ${tempTxt}`);

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
      try { fs.unlinkSync(tempPdf); } catch (e) {}
      try { fs.unlinkSync(tempTxt); } catch (e) {}
    }
  }

  /**
   * 从文本中提取产品信息
   */
  extractProductsFromTable(text: string): ExtractedProduct[] {
    const lines = text.split('\n').filter(l => l.trim());
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
      '储罐'
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
            if (nextLine.includes(keyword) && !nextLine.includes('mm') && !nextLine.includes('kW')) {
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
          Logger.debug('[OCR] 解析到产品', { name: product.name, quantity: product.quantity, unit: product.unit });
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

    const product: ExtractedProduct = {
      name: defaultName,
      model: '',
      specs: fullText,
      quantity: 1,
      unit: '台',
      price: 0,
      total: 0
    };

    // 提取数量 - 正确的逻辑，排除尺寸中的数字
    this.extractQuantity(product, fullText);

    // 提取型号
    this.extractModel(product, fullText);

    return product;
  }

  /**
   * 提取数量（排除尺寸中的数字）
   */
  private extractQuantity(product: ExtractedProduct, text: string): void {
    // 首先尝试找 "套 X" 模式（最准确）
    const quantityPatterns = [
      { pattern: /套\s*[：:]\s*(\d+)/, unit: '套' },     // 套：3
      { pattern: /套\s*(\d+)/, unit: '套' },            // 套 3
      { pattern: /(\d+)\s*套(?!\d)/, unit: '套' },      // 3 套（排除后面跟数字）
      { pattern: /数量[：:]\s*(\d+)/, unit: '套' },      // 数量：3
      { pattern: /[xX]\s*(\d+)\s*套/, unit: '套' },      // x3套
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
   * 提取型号
   */
  private extractModel(product: ExtractedProduct, text: string): void {
    // 型号模式（按优先级排序）
    const modelPatterns = [
      /φ\d+[×x]\d+(?:mm)?/i,           // φ4000×3000mm
      /\d+[×x]\d+(?:mm)?/i,             // 4000×3000mm
      /\d+kW/i,                         // 11kW
      /[A-Z0-9]+[-][A-Z0-9]+/i,         // IS150-125-250
      /[A-Z]{2,}\d+/i,                  // Q235B
      /[A-Z]+\d+[A-Z]*/i,               // DN100
      /\d+[A-Z]+[A-Z0-9]*/i,            // 304不锈钢中的304
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