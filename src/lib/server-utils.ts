/**
 * 服务器端工具库
 * 集中管理所有Node.js原生模块，仅在服务器端使用
 */

import * as fs from 'fs';
import * as path from 'path';
import * as crypto from 'crypto';
import { exec } from 'child_process';
import { promisify } from 'util';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export const execAsync = promisify(exec);

/**
 * 文件操作工具类
 */
export class ServerFileUtils {
  /**
   * 读取文件
   */
  static readFile(filePath: string): Buffer {
    try {
      return fs.readFileSync(filePath);
    } catch (error) {
      console.error(`[ServerFileUtils] 读取文件失败: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 写入文件
   */
  static writeFile(filePath: string, data: Buffer | string): void {
    try {
      // 确保目录存在
      const dir = path.dirname(filePath);
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
      fs.writeFileSync(filePath, data);
    } catch (error) {
      console.error(`[ServerFileUtils] 写入文件失败: ${filePath}`, error);
      throw error;
    }
  }

  /**
   * 检查文件是否存在
   */
  static exists(filePath: string): boolean {
    return fs.existsSync(filePath);
  }

  /**
   * 删除文件
   */
  static deleteFile(filePath: string): void {
    try {
      if (fs.existsSync(filePath)) {
        fs.unlinkSync(filePath);
      }
    } catch (error) {
      console.error(`[ServerFileUtils] 删除文件失败: ${filePath}`, error);
    }
  }

  /**
   * 创建临时文件路径
   */
  static createTempPath(prefix: string = 'tmp', ext: string = ''): string {
    const tempDir = path.join(process.cwd(), 'tmp');
    if (!fs.existsSync(tempDir)) {
      fs.mkdirSync(tempDir, { recursive: true });
    }
    const timestamp = Date.now();
    const random = crypto.randomBytes(4).toString('hex');
    const fileName = `${prefix}-${timestamp}-${random}${ext}`;
    return path.join(tempDir, fileName);
  }

  /**
   * 生成MD5哈希
   */
  static md5(data: string | Buffer): string {
    return crypto.createHash('md5').update(data).digest('hex');
  }

  /**
   * 获取文件扩展名
   */
  static getExtension(fileName: string): string {
    return path.extname(fileName).toLowerCase();
  }

  /**
   * 获取文件名（不含扩展名）
   */
  static getBaseName(fileName: string): string {
    return path.basename(fileName, path.extname(fileName));
  }

  /**
   * 安全地连接路径
   */
  static joinPaths(...paths: string[]): string {
    return path.join(...paths);
  }
}

/**
 * 系统进程工具类
 */
export class ServerProcessUtils {
  /**
   * 执行系统命令
   */
  static async execCommand(command: string): Promise<{ stdout: string; stderr: string }> {
    try {
      console.log(`[ServerProcess] 执行命令: ${command}`);
      const { stdout, stderr } = await execAsync(command);
      if (stderr) {
        console.warn(`[ServerProcess] 命令 stderr: ${stderr}`);
      }
      return { stdout, stderr };
    } catch (error) {
      console.error(`[ServerProcess] 命令执行失败: ${command}`, error);
      throw error;
    }
  }

  /**
   * 检查系统命令是否存在
   */
  static async checkCommand(command: string): Promise<boolean> {
    try {
      await execAsync(`which ${command}`);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * 使用 pdftotext 提取PDF文本
   */
  static async extractPdfText(pdfPath: string, outputPath: string): Promise<string> {
    const hasPdftotext = await this.checkCommand('pdftotext');
    if (!hasPdftotext) {
      throw new Error('pdftotext 未安装，请执行: sudo apt-get install poppler-utils');
    }

    await this.execCommand(`pdftotext -layout "${pdfPath}" "${outputPath}"`);
    
    if (fs.existsSync(outputPath)) {
      return fs.readFileSync(outputPath, 'utf-8');
    }
    return '';
  }

  /**
   * 使用 tesseract 进行OCR识别
   */
  static async ocrImage(imagePath: string, outputPath: string): Promise<string> {
    const hasTesseract = await this.checkCommand('tesseract');
    if (!hasTesseract) {
      throw new Error('tesseract 未安装，请执行: sudo apt-get install tesseract-ocr tesseract-ocr-chi-sim');
    }

    await this.execCommand(`tesseract "${imagePath}" "${outputPath}" -l chi_sim+eng`);
    
    const resultFile = `${outputPath}.txt`;
    if (fs.existsSync(resultFile)) {
      return fs.readFileSync(resultFile, 'utf-8');
    }
    return '';
  }
}

/**
 * 数据库操作工具类
 */
export class ServerDatabaseUtils {
  // 跟踪已输出的错误，避免重复输出
  private static loggedErrors: Set<string> = new Set();
  
  private static shouldLogError(error: any): boolean {
    const errorKey = `${error.code}-${error.message}`;
    if (this.loggedErrors.has(errorKey)) {
      return false;
    }
    this.loggedErrors.add(errorKey);
    return true;
  }

  /**
   * 获取数据库客户端
   */
  static getDb() {
    return getSupabaseClient();
  }

  /**
   * 搜索产品（带智能匹配）
   */
  static async searchProducts(productName: string, brand: string = '', model: string = '') {
    const db = this.getDb();
    
    // 清理和规范化搜索关键词
    const searchTerms: string[] = [];
    
    // 提取核心产品名称（去掉规格参数）
    let coreName = productName
      .replace(/[φΦ]/g, '')
      .replace(/\d+[×x]\d+/g, '')
      .replace(/\d+mm/g, '')
      .replace(/\d+kW/g, '')
      .replace(/[（）()]/g, '')
      .replace(/[、，,;；]/g, ' ')
      .trim();
    
    // 如果清理后太短，使用原名称
    if (coreName.length < 2) {
      coreName = productName;
    }
    
    searchTerms.push(coreName);

    if (brand && brand.length > 1) {
      searchTerms.push(brand);
    }

    if (model && model.length > 1 && !model.match(/^\d+$/)) {
      searchTerms.push(model);
    }

    console.log('[ServerDatabase] 搜索词:', searchTerms);

    let query = db
      .from('products')
      .select('*');

    // 构建OR条件
    const orConditions = [];
    
    for (const term of searchTerms) {
      if (term.length > 1) {
        orConditions.push(`name.ilike.%${term}%`);
        orConditions.push(`model.ilike.%${term}%`);
        orConditions.push(`keywords.ilike.%${term}%`);
      }
    }

    if (orConditions.length > 0) {
      query = query.or(orConditions.join(','));
    }

    const { data, error } = await query
      .order('verified', { ascending: false })
      .limit(10);

    if (error) {
      // 只在第一次遇到此错误时输出，避免重复
      if (this.shouldLogError(error)) {
        console.log('[ServerDatabase] 查询失败:', error);
      }
      return [];
    }

    if (data && data.length > 0) {
      // 计算匹配得分
      const scored = data.map((product: any) => {
        let score = 0;
        for (const term of searchTerms) {
          const termLower = term.toLowerCase();
          if (product.name.toLowerCase().includes(termLower)) score += 10;
          if (product.model?.toLowerCase().includes(termLower)) score += 8;
          if (product.keywords?.toLowerCase().includes(termLower)) score += 5;
        }
        return { ...product, score };
      });
      
      scored.sort((a, b) => b.score - a.score);
      return scored.slice(0, 5);
    }

    return [];
  }

  /**
   * 保存上传记录
   */
  static async saveUploadRecord(userId: string, fileName: string, fileKey: string, fileSize: number, fileType: string, publicUrl: string) {
    const db = this.getDb();
    
    const { data, error } = await db
      .from('user_uploads')
      .insert({
        user_id: userId,
        file_name: fileName,
        file_key: fileKey,
        file_size: fileSize,
        file_type: fileType,
        public_url: publicUrl,
        status: 'uploaded',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[ServerDatabase] 保存上传记录失败:', error);
      return null;
    }
    return data;
  }

  /**
   * 保存报价单
   */
  static async saveQuote(userId: string, quoteData: any) {
    const db = this.getDb();
    
    const { data, error } = await db
      .from('quotes')
      .insert({
        user_id: userId,
        quote_number: quoteData.quoteNumber,
        products: quoteData.products,
        subtotal: quoteData.subtotal,
        tax_amount: quoteData.taxAmount,
        total_amount: quoteData.totalAmount,
        supplier_info: quoteData.supplierInfo,
        customer_info: quoteData.customerInfo,
        terms: quoteData.terms,
        status: 'draft',
        created_at: new Date().toISOString()
      })
      .select()
      .single();

    if (error) {
      console.error('[ServerDatabase] 保存报价单失败:', error);
      return null;
    }
    return data;
  }

  /**
   * 获取用户上传记录
   */
  static async getUserUploads(userId: string, limit: number = 50) {
    const db = this.getDb();
    
    const { data, error } = await db
      .from('user_uploads')
      .select('*')
      .eq('user_id', userId)
      .order('created_at', { ascending: false })
      .limit(limit);

    if (error) {
      console.error('[ServerDatabase] 获取上传记录失败:', error);
      return [];
    }
    return data;
  }
}

/**
 * 缓存工具类
 */
export class ServerCacheUtils {
  private static cacheDir = path.join(process.cwd(), '.cache');

  static init() {
    if (!fs.existsSync(this.cacheDir)) {
      fs.mkdirSync(this.cacheDir, { recursive: true });
    }
  }

  /**
   * 获取缓存文件路径
   */
  static getCachePath(key: string): string {
    const hash = crypto.createHash('md5').update(key).digest('hex');
    return path.join(this.cacheDir, hash);
  }

  /**
   * 从缓存读取
   */
  static get(key: string): Buffer | null {
    const cachePath = this.getCachePath(key);
    if (fs.existsSync(cachePath)) {
      try {
        return fs.readFileSync(cachePath);
      } catch (error) {
        console.error('[ServerCache] 读取缓存失败:', error);
      }
    }
    return null;
  }

  /**
   * 写入缓存
   */
  static set(key: string, data: Buffer): void {
    const cachePath = this.getCachePath(key);
    try {
      fs.writeFileSync(cachePath, data);
    } catch (error) {
      console.error('[ServerCache] 写入缓存失败:', error);
    }
  }

  /**
   * 清除缓存
   */
  static clear(key?: string): void {
    if (key) {
      const cachePath = this.getCachePath(key);
      if (fs.existsSync(cachePath)) {
        fs.unlinkSync(cachePath);
      }
    } else {
      // 清除所有缓存
      if (fs.existsSync(this.cacheDir)) {
        const files = fs.readdirSync(this.cacheDir);
        for (const file of files) {
          fs.unlinkSync(path.join(this.cacheDir, file));
        }
      }
    }
  }
}

// 初始化缓存目录
ServerCacheUtils.init();