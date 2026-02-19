import { NextRequest, NextResponse } from 'next/server';
import { LLMClient, Config, HeaderUtils, S3Storage } from 'coze-coding-dev-sdk';
import { KnowledgeClient, DataSourceType } from 'coze-coding-dev-sdk';
import { SearchClient } from 'coze-coding-dev-sdk';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { generateQuoteNumber } from '@/lib/quote-utils';
import * as XLSX from 'xlsx';

// 辅助函数：从文件名推断文件类型
function getFileTypeFromName(fileName: string): string {
  // 添加空值检查
  if (!fileName || typeof fileName !== 'string') {
    console.warn('[Chat] 文件名为空，使用默认类型');
    return 'application/octet-stream';
  }
  
  const ext = fileName.toLowerCase().split('.').pop();
  const typeMap: Record<string, string> = {
    'jpg': 'image/jpeg',
    'jpeg': 'image/jpeg',
    'png': 'image/png',
    'gif': 'image/gif',
    'webp': 'image/webp',
    'pdf': 'application/pdf',
    'doc': 'application/msword',
    'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
    'xls': 'application/vnd.ms-excel',
    'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
    'txt': 'text/plain',
    'csv': 'text/csv',
    'zip': 'application/zip',
    'rar': 'application/vnd.rar',
  };
  return typeMap[ext || ''] || 'application/octet-stream';
}

// 辅助函数：处理上传的文件对象，防止undefined错误
function processUploadedFile(file: any) {
  // 情况1：file是URL字符串
  if (typeof file === 'string') {
    console.log('[Chat] 收到文件URL字符串:', file);
    
    // 从URL中提取文件名
    let fileName = '上传文件';
    try {
      // 尝试从URL中提取文件名
      const urlParts = file.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      if (lastPart && lastPart.includes('.')) {
        fileName = decodeURIComponent(lastPart.split('?')[0]);
        console.log('[Chat] 从URL提取文件名:', fileName);
      }
    } catch (e) {
      console.warn('[Chat] 从URL提取文件名失败:', e);
    }
    
    // 根据文件扩展名推断类型
    const ext = fileName.split('.').pop()?.toLowerCase();
    const typeMap: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'txt': 'text/plain',
      'csv': 'text/csv',
    };
    const fileType = typeMap[ext || ''] || 'application/octet-stream';
    
    return { 
      name: fileName, 
      type: fileType, 
      url: file 
    };
  }
  
  // 情况2：file是对象但没有name属性
  if (!file) {
    console.warn('[Chat] 收到空文件对象');
    return { name: '空文件', type: 'application/octet-stream', url: '' };
  }
  
  // 情况3：file是对象，有URL属性
  if (file.url) {
    console.log('[Chat] 收到文件对象（有URL）:', file);
    
    // 如果有name属性，直接使用
    if (file.name) {
      const fileName = file.name;
      const fileType = file.type || file.mimeType || getFileTypeFromName(fileName) || 'application/octet-stream';
      return { name: fileName, type: fileType, url: file.url };
    }
    
    // 没有name属性，从URL提取
    console.log('[Chat] 文件对象没有name属性，从URL提取');
    let fileName = '上传文件';
    try {
      const urlParts = file.url.split('/');
      const lastPart = urlParts[urlParts.length - 1];
      if (lastPart && lastPart.includes('.')) {
        fileName = decodeURIComponent(lastPart.split('?')[0]);
        console.log('[Chat] 从URL提取文件名:', fileName);
      }
    } catch (e) {
      console.warn('[Chat] 从URL提取文件名失败:', e);
    }
    
    const ext = fileName.split('.').pop()?.toLowerCase();
    const typeMap: Record<string, string> = {
      'jpg': 'image/jpeg',
      'jpeg': 'image/jpeg',
      'png': 'image/png',
      'gif': 'image/gif',
      'webp': 'image/webp',
      'pdf': 'application/pdf',
      'doc': 'application/msword',
      'docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
      'xls': 'application/vnd.ms-excel',
      'xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
      'txt': 'text/plain',
      'csv': 'text/csv',
    };
    const fileType = typeMap[ext || ''] || 'application/octet-stream';
    
    return { name: fileName, type: fileType, url: file.url };
  }
  
  // 情况4：file是对象，没有URL但有其他属性
  const fileName = file.name || file.fileName || file.originalName || '未知文件';
  const fileType = file.type || file.mimeType || getFileTypeFromName(fileName) || 'application/octet-stream';
  console.log('[Chat] 处理文件对象（无URL）:', { name: fileName, type: fileType });
  
  return { name: fileName, type: fileType, url: '' };
}

// 辅助函数：查找包含数据的第一个工作表
function findFirstDataSheet(workbook: XLSX.WorkBook): string | null {
  for (const sheetName of workbook.SheetNames) {
    const worksheet = workbook.Sheets[sheetName];
    const range = XLSX.utils.decode_range(worksheet['!ref'] || 'A1:A1');

    // 检查是否有超过2行数据
    if (range.e.r > 1) {
      console.log(`[Excel] 在Sheet "${sheetName}" 找到数据，行数: ${range.e.r + 1}`);
      return sheetName;
    }
  }

  // 都没找到，返回第一个Sheet
  return workbook.SheetNames[0];
}

// 辅助函数：清理单元格内容
function cleanCellContent(cell: any): string {
  if (!cell) return '';

  let content = cell.toString().trim();

  // 处理换行符
  content = content.replace(/<br\s*\/?>/gi, ' ');  // HTML换行转空格
  content = content.replace(/[\n\r]+/g, ' ');      // 换行符转空格
  content = content.replace(/\s+/g, ' ');          // 多个空格合并

  return content;
}

// 辅助函数：判断是否是有效产品名称（不是序号，不是纯数字）
function isValidProductName(name: string): boolean {
  if (!name || name.trim() === '') return false;

  const trimmed = name.trim();

  // 如果是纯数字且长度小于3，可能是序号
  if (/^\d+$/.test(trimmed) && trimmed.length < 3) return false;

  // 如果包含常见产品关键词，认为是有效的
  const productKeywords = ['罐', '泵', '机', '器', '搅拌', '电机', '钢材', '管道', '装置', '系统', '设备', '仪', '阀'];
  if (productKeywords.some(k => trimmed.includes(k))) return true;

  // 如果包含中文字符且长度大于1，认为是有效的
  if (/[\u4e00-\u9fa5]/.test(trimmed) && trimmed.length > 1) return true;

  // 默认认为是有效的（防止误判）
  return true;
}

// 辅助函数：解析Excel文件
async function parseExcelFile(file: any) {
  try {
    let data: Uint8Array;
    if (file.content) {
      data = new Uint8Array(file.content);
    } else if (file.buffer) {
      data = new Uint8Array(file.buffer);
    } else {
      throw new Error('没有可读取的文件内容');
    }

    // 读取工作簿
    const workbook = XLSX.read(data, { type: 'array' });
    console.log(`[Excel] 工作表列表:`, workbook.SheetNames);

    // 查找有数据的Sheet
    const targetSheetName = findFirstDataSheet(workbook);
    if (!targetSheetName) {
      throw new Error('没有找到有效的工作表');
    }

    console.log(`[Excel] 使用工作表: ${targetSheetName}`);
    const worksheet = workbook.Sheets[targetSheetName];

    // 转换为二维数组
    const rows = XLSX.utils.sheet_to_json(worksheet, {
      header: 1,
      defval: '',
      blankrows: false
    }) as any[][];

    console.log(`[Excel] 总行数: ${rows.length}`);
    if (rows.length === 0) return { products: [], globalRemarks: [] };

    // 打印前3行用于调试
    console.log(`[Excel] 前3行:`, rows.slice(0, 3));

    // 表头关键词映射
    const headerKeywords = {
      name: ['产品名称', '商品名称', '物料名称', '产品', '名称', '品名'],
      model: ['型号', '规格型号', '规格', '型号规格'],
      brand: ['品牌', '商标', '厂家'],
      specs: ['参数', '描述', '参数描述', '说明', '备注'],
      unit: ['单位'],
      quantity: ['数量', '采购量', '需求数量'],
      price: ['单价', '价格', '报价'],
      total: ['总价', '合计'],
      serial: ['序号', '编号', 'No.']
    };

    // 检测表头行
    let headerRowIndex = -1;
    for (let i = 0; i < Math.min(5, rows.length); i++) {
      const row = rows[i];
      const rowStr = row.map((c: any) => (c || '').toString()).join(' ').toLowerCase();

      // 检查是否包含表头关键词
      const hasNameKeyword = headerKeywords.name.some(k => rowStr.includes(k));
      const hasModelKeyword = headerKeywords.model.some(k => rowStr.includes(k));
      const hasQuantityKeyword = headerKeywords.quantity.some(k => rowStr.includes(k));

      if ((hasNameKeyword && (hasModelKeyword || hasQuantityKeyword)) ||
          rowStr.includes('产品名称') ||
          rowStr.includes('商品名称') ||
          (rowStr.includes('名称') && rowStr.includes('规格'))) {
        headerRowIndex = i;
        console.log(`[Excel] 在第${i+1}行检测到表头: ${rowStr}`);
        break;
      }
    }

    // 如果没找到表头，尝试分析结构
    if (headerRowIndex === -1) {
      // 检查第一列是否是序号（1,2,3...）
      const firstCol = rows.map((r: any[]) => r[0]).filter((v: any) => v);
      const isSerial = firstCol.every((v: any, i: number) => {
        const val = parseInt(v);
        return !isNaN(val) && val === i + 1;
      });

      if (isSerial && firstCol.length > 2) {
        console.log(`[Excel] 检测到序号列，第1行是数据，无表头`);
        headerRowIndex = -1; // 无表头
      } else {
        // 默认第一行是表头
        headerRowIndex = 0;
        console.log(`[Excel] 未检测到明显表头，默认第1行为表头`);
      }
    }

    // 获取表头（如果有）
    const headers = headerRowIndex >= 0 ? rows[headerRowIndex] : [];
    console.log(`[Excel] 表头:`, headers);

    // 识别列索引
    const columnIndices = {
      nameColIndex: -1,
      modelColIndex: -1,
      brandColIndex: -1,
      specsColIndex: -1,
      unitColIndex: -1,
      quantityColIndex: -1,
      priceColIndex: -1,
      totalColIndex: -1,
      serialColIndex: -1
    };

    // 根据表头识别列
    headers.forEach((header: any, index: number) => {
      const headerStr = (header || '').toString().toLowerCase();

      // 优先检查产品名称
      if (headerKeywords.name.some(k => headerStr.includes(k))) {
        columnIndices.nameColIndex = index;
      }
      // 型号和规格
      else if (headerKeywords.model.some(k => headerStr.includes(k))) {
        columnIndices.modelColIndex = index;
      }
      // 品牌
      else if (headerKeywords.brand.some(k => headerStr.includes(k))) {
        columnIndices.brandColIndex = index;
      }
      // 参数和描述
      else if (headerKeywords.specs.some(k => headerStr.includes(k))) {
        columnIndices.specsColIndex = index;
      }
      // 单位
      else if (headerKeywords.unit.some(k => headerStr.includes(k))) {
        columnIndices.unitColIndex = index;
      }
      // 数量
      else if (headerKeywords.quantity.some(k => headerStr.includes(k))) {
        columnIndices.quantityColIndex = index;
      }
      // 单价
      else if (headerKeywords.price.some(k => headerStr.includes(k))) {
        columnIndices.priceColIndex = index;
      }
      // 总价
      else if (headerKeywords.total.some(k => headerStr.includes(k))) {
        columnIndices.totalColIndex = index;
      }
      // 序号
      else if (headerKeywords.serial.some(k => headerStr.includes(k))) {
        columnIndices.serialColIndex = index;
      }
    });

    // 如果没有找到产品名称列，尝试使用第一列
    if (columnIndices.nameColIndex === -1 && rows.length > headerRowIndex + 1) {
      // 检查第一列是否可能是产品名称（不是序号）
      const firstColSample = rows[headerRowIndex + 1]?.[0];
      if (firstColSample && !/^\d+$/.test(firstColSample.toString())) {
        columnIndices.nameColIndex = 0;
        console.log(`[Excel] 未找到产品名称列，使用第1列作为产品名称`);
      }
    }

    console.log(`[Excel] 列索引:`, columnIndices);

    // 解析产品行
    const products: any[] = [];
    const globalRemarks: string[] = [];

    const startRow = headerRowIndex >= 0 ? headerRowIndex + 1 : 0;

    for (let i = startRow; i < rows.length; i++) {
      const row = rows[i];
      if (!row || row.length === 0) continue;

      // 获取产品名称
      let productName = '';
      if (columnIndices.nameColIndex >= 0) {
        productName = cleanCellContent(row[columnIndices.nameColIndex]);
      } else if (row[0] && !/^\d+$/.test(row[0].toString())) {
        productName = cleanCellContent(row[0]);
      }

      // 检查是否是有效产品
      if (!isValidProductName(productName)) {
        // 可能是备注行
        const remarkText = row.filter((c: any) => c && c.toString().trim() !== '').join(' ');
        if (remarkText && remarkText.length > 1) {
          globalRemarks.push(remarkText);
        }
        continue;
      }

      // 获取数量
      let quantity = 1;
      if (columnIndices.quantityColIndex >= 0 && row[columnIndices.quantityColIndex]) {
        const qty = parseFloat(row[columnIndices.quantityColIndex]);
        if (!isNaN(qty) && qty > 0) quantity = qty;
      }

      // 构建产品对象
      const product = {
        name: productName,
        model: columnIndices.modelColIndex >= 0 ? cleanCellContent(row[columnIndices.modelColIndex]) : '',
        brand: columnIndices.brandColIndex >= 0 ? cleanCellContent(row[columnIndices.brandColIndex]) : '',
        specs: columnIndices.specsColIndex >= 0 ? cleanCellContent(row[columnIndices.specsColIndex]) : '',
        unit: columnIndices.unitColIndex >= 0 ? (cleanCellContent(row[columnIndices.unitColIndex]) || '个') : '个',
        quantity: quantity,
        price: 0,
        total: 0,
        remark: ''
      };

      // 如果规格为空但产品名包含参数，可以拆分（可选）
      if (!product.specs && product.name.includes('；')) {
        const parts = product.name.split('；');
        if (parts.length > 1) {
          product.name = parts[0];
          product.specs = parts.slice(1).join('；');
        }
      }

      // 如果产品名包含冒号，尝试拆分名称和规格
      if (!product.specs && product.name.includes('：')) {
        const parts = product.name.split('：');
        if (parts.length > 1) {
          product.name = parts[0];
          product.specs = parts.slice(1).join('：');
        }
      }

      products.push(product);

      // 打印第一个产品的详细信息用于调试
      if (products.length === 1) {
        console.log('[Chat] 第一个产品数据:', JSON.stringify(product, null, 2));
      }
    }

    console.log(`[Excel] 解析到 ${products.length} 个产品`);
    if (products.length > 0) {
      console.log('[Excel] 前3个产品:', products.slice(0, 3).map(p => ({
        name: p.name,
        model: p.model,
        quantity: p.quantity
      })));
    }

    return {
      products,
      globalRemarks: globalRemarks.join('\n')
    };

  } catch (error) {
    console.error('[Excel] 解析失败:', error);
    throw error;
  }
}

// 辅助函数：生成报价单数据（复用现有逻辑）
// 辅助函数：提取关键词
function extractKeywords(text: string): string[] {
  // 常见停用词
  const stopWords = ['的', '了', '在', '是', '和', '与', '及', '型号', '品牌', '规格', '产品', '设备', '机器', '个', '只', '台', '套'];

  // 提取中文词和英文数字
  const words = text.match(/[\u4e00-\u9fa5]{2,}|[a-zA-Z0-9]+/g) || [];

  // 过滤停用词和过短的词
  return words.filter(w =>
    w.length > 1 &&
    !stopWords.includes(w) &&
    !/^\d+$/.test(w) // 纯数字保留，不过滤
  );
}

// 名称预处理函数（v2.0新增）
function preprocessName(name: string) {
  const bracketMatch = name.match(/[（(](.*?)[）)]/);
  const bracketContent = bracketMatch ? bracketMatch[1] : '';

  // 核心名称（去掉括号及内容）
  const coreName = name.replace(/[（(].*?[）)]/g, '').trim();

  // 提取数字规格（从名称和括号内容中）
  const allText = name + ' ' + bracketContent;
  const numbers = allText.match(/\d+(\.\d+)?/g) || [];

  return {
    bracketContent,
    coreName,
    numbers
  };
}

// 智能数据库搜索函数（v2.2新增 - 增加品牌推荐排名）
async function searchProductsInDatabase(
  productName: string,
  brand: string,
  model: string,
  db: any
): Promise<any[]> {
  console.log('[DB Search] 开始搜索产品:', { productName, brand, model });

  const preprocessed = preprocessName(productName || '');
  const coreName = preprocessed.coreName;
  const today = new Date().toISOString().split('T')[0];

  // 策略1：使用核心名称搜索（去掉括号）
  let dbProducts: any[] = [];
  if (coreName && coreName.length > 0) {
    const { data } = await db
      .from('products')
      .select(`
        *,
        manufacturer_payments!left (
          rank_position,
          end_date,
          status
        )
      `)
      .ilike('name', `%${coreName}%`)
      .order('verified', { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      console.log(`[DB Search] 核心名称搜索找到 ${data.length} 个产品`);
      dbProducts = data;
    }
  }

  // 策略2：使用品牌+型号搜索
  if (brand && model && dbProducts.length === 0) {
    const { data } = await db
      .from('products')
      .select(`
        *,
        manufacturer_payments!left (
          rank_position,
          end_date,
          status
        )
      `)
      .and(
        `ilike(brand, '%${brand}%')`
      )
      .ilike('model', `%${model}%`)
      .order('verified', { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      console.log(`[DB Search] 品牌+型号搜索找到 ${data.length} 个产品`);
      dbProducts = data;
    }
  }

  // 策略3：只使用品牌搜索
  if (brand && dbProducts.length === 0) {
    const { data } = await db
      .from('products')
      .select(`
        *,
        manufacturer_payments!left (
          rank_position,
          end_date,
          status
        )
      `)
      .ilike('brand', `%${brand}%`)
      .order('verified', { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      console.log(`[DB Search] 品牌搜索找到 ${data.length} 个产品`);
      dbProducts = data;
    }
  }

  // 策略4：只使用型号搜索
  if (model && dbProducts.length === 0) {
    const { data } = await db
      .from('products')
      .select(`
        *,
        manufacturer_payments!left (
          rank_position,
          end_date,
          status
        )
      `)
      .ilike('model', `%${model}%`)
      .order('verified', { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      console.log(`[DB Search] 型号搜索找到 ${data.length} 个产品`);
      dbProducts = data;
    }
  }

  // 策略5：使用原始产品名称（降级方案）
  if (productName && productName.length > 0 && dbProducts.length === 0) {
    const { data } = await db
      .from('products')
      .select(`
        *,
        manufacturer_payments!left (
          rank_position,
          end_date,
          status
        )
      `)
      .ilike('name', `%${productName}%`)
      .order('verified', { ascending: false })
      .limit(20);

    if (data && data.length > 0) {
      console.log(`[DB Search] 原始名称搜索找到 ${data.length} 个产品`);
      dbProducts = data;
    }
  }

  if (dbProducts.length === 0) {
    console.log('[DB Search] 未找到匹配产品');
    return [];
  }

  // ========== 品牌推荐排名逻辑 ==========
  // 检查每个产品的付费排名状态
  const productsWithRank = dbProducts.map(product => {
    let rankBoost = 0;
    let rankPosition = 0;

    if (product.manufacturer_payments && product.manufacturer_payments.length > 0) {
      const activePayment = product.manufacturer_payments.find(
        (p: any) => p.status === 'active' && p.end_date >= today
      );

      if (activePayment) {
        rankPosition = activePayment.rank_position;
        // 排名加成：第1名+30分，第2名+20分，第3名+20分，第4名+10分，第5名+10分
        const rankBonus: Record<number, number> = {
          1: 30,
          2: 20,
          3: 20,
          4: 10,
          5: 10
        };
        rankBoost = rankBonus[rankPosition] || 0;
      }
    }

    return {
      ...product,
      _rank_boost: rankBoost,
      _rank_position: rankPosition
    };
  });

  // 优先按验证状态和排名加成排序
  productsWithRank.sort((a, b) => {
    // 已验证的优先
    if (a.verified !== b.verified) {
      return b.verified ? 1 : -1;
    }
    // 排名加成高的优先
    if (b._rank_boost !== a._rank_boost) {
      return b._rank_boost - a._rank_boost;
    }
    // 浏览量高的优先
    if ((b.view_count || 0) !== (a.view_count || 0)) {
      return (b.view_count || 0) - (a.view_count || 0);
    }
    return 0;
  });

  // 只返回前10个
  return productsWithRank.slice(0, 10);
}

// 增强的产品匹配函数 v2.0
function findBestMatchProduct(
  productName: string,
  model: string,
  brand: string,
  specifications: string,
  dbProducts: any[]
): { product: any; score: number; matches: string[] } | null {
  if (dbProducts.length === 0) {
    return null;
  }

  console.log('[Match v2.0] 开始匹配:', { productName, model, brand, specifications });

  // 预处理询价单产品名称
  const queryPreprocessed = preprocessName(productName || '');
  console.log('[Match v2.0] 询价单预处理:', queryPreprocessed);

  // 为每个候选产品计算匹配分数
  const scored = dbProducts.map(product => {
    let score = 0;
    const matches: string[] = [];

    // 添加排名加成（品牌推荐逻辑）
    if (product._rank_boost && product._rank_boost > 0) {
      score += product._rank_boost;
      matches.push(`推荐排名第${product._rank_position}名加成(+${product._rank_boost})`);
    }

    // 预处理数据库产品名称
    const dbPreprocessed = preprocessName(product.name || '');

    // 1. 品牌匹配（最高权重）
    if (brand && product.supplier) {
      const supplierLower = product.supplier.toLowerCase();
      const brandLower = brand.toLowerCase();
      if (supplierLower === brandLower) {
        score += 30;
        matches.push('品牌完全匹配');
      } else if (supplierLower.includes(brandLower) || brandLower.includes(supplierLower)) {
        score += 20;
        matches.push('品牌包含匹配');
      }
    }

    // 2. 型号匹配（高权重）
    if (model && product.model) {
      const modelLower = model.toLowerCase();
      const productModelLower = product.model.toLowerCase();
      if (modelLower === productModelLower) {
        score += 25;
        matches.push('型号完全匹配');
      } else if (productModelLower.includes(modelLower) || modelLower.includes(productModelLower)) {
        score += 15;
        matches.push('型号部分匹配');
      }
    }

    // 3. 核心名称匹配（去掉括号后）- v2.0优化
    if (queryPreprocessed.coreName && dbPreprocessed.coreName) {
      const coreName1 = queryPreprocessed.coreName.toLowerCase();
      const coreName2 = dbPreprocessed.coreName.toLowerCase();

      if (coreName1 === coreName2) {
        score += 15;
        matches.push('核心名称匹配');
      } else if (coreName2.includes(coreName1) || coreName1.includes(coreName2)) {
        score += 8;
        matches.push('名称包含匹配');
      }
    }

    // 4. 数字规格匹配 - v2.0优化（权重提升到10分/个）
    const allQueryNumbers = [...queryPreprocessed.numbers];
    const allDbNumbers = [...dbPreprocessed.numbers];

    // 从规格字段中提取数字
    if (specifications) {
      const specNumbers = specifications.match(/\d+(\.\d+)?/g) || [];
      allQueryNumbers.push(...specNumbers);
    }
    if (product.specifications) {
      const specNumbers = product.specifications.match(/\d+(\.\d+)?/g) || [];
      allDbNumbers.push(...specNumbers);
    }

    // 去重并匹配数字
    const uniqueQueryNumbers = [...new Set(allQueryNumbers)];
    const uniqueDbNumbers = [...new Set(allDbNumbers)];
    const commonNumbers = uniqueQueryNumbers.filter(n => uniqueDbNumbers.includes(n));

    if (commonNumbers.length > 0) {
      score += commonNumbers.length * 10;
      matches.push(`数字规格匹配: ${commonNumbers.join(',')}`);
    }

    // 5. 关键词匹配 - v2.0优化
    const queryKeywords = extractKeywords(productName || '');
    const dbKeywords = extractKeywords(product.name || '');
    const commonKeywords = queryKeywords.filter(k => dbKeywords.includes(k));

    if (commonKeywords.length > 0) {
      score += commonKeywords.length * 3;
      matches.push(`关键词匹配: ${commonKeywords.join(',')}`);
    }

    // 6. 名称完全匹配
    if (productName && product.name) {
      const name1 = productName.toLowerCase();
      const name2 = product.name.toLowerCase();
      if (name1 === name2) {
        score += 20;
        matches.push('名称完全匹配');
      }
    }

    // 7. 规格文本包含匹配
    if (specifications && product.specifications) {
      const specs1 = specifications.toLowerCase();
      const specs2 = product.specifications.toLowerCase();
      if (specs2.includes(specs1) || specs1.includes(specs2)) {
        score += 10;
        matches.push('规格文本包含');
      }
    }

    // ========== 特殊规则加成 - v2.0新增 ==========

    // 8. 特殊规则：品牌+数字规格加成（20分）
    let brandMatched = false;
    if (brand && product.supplier) {
      const supplierLower = product.supplier.toLowerCase();
      const brandLower = brand.toLowerCase();
      brandMatched = (supplierLower === brandLower ||
                     supplierLower.includes(brandLower) ||
                     brandLower.includes(supplierLower));
    }

    if (brandMatched && commonNumbers.length > 0) {
      score += 20;
      matches.push('品牌+数字规格加成');
    }

    // 9. 特殊规则：核心名称+品牌加成（15分）
    if (queryPreprocessed.coreName && dbPreprocessed.coreName) {
      const coreName1 = queryPreprocessed.coreName.toLowerCase();
      const coreName2 = dbPreprocessed.coreName.toLowerCase();

      if (coreName1 === coreName2 && brandMatched) {
        score += 15;
        matches.push('核心名称+品牌加成');
      }
    }

    return {
      product,
      score,
      matches
    };
  });

  // 按分数排序，取最高分
  scored.sort((a, b) => b.score - a.score);
  const best = scored[0];

  console.log('[Match v2.0] 最佳匹配:', {
    name: best.product.name,
    score: best.score,
    matches: best.matches
  });

  // 设置匹配阈值（60分以上才算匹配）
  if (best.score >= 60) {
    return best;
  }

  console.log('[Match v2.0] 匹配分数过低:', best.score);
  return null;
}

async function generateQuoteData(
  products: any[],
  llmClient: any,
  knowledgeClient: any,
  searchClient: any,
  db: any
) {
  console.log('[QuoteGen] 开始生成报价单，产品数量:', products.length);

  // 第一步：在数据库和知识库中搜索产品并获取价格
  const matchedProducts: any[] = [];

  for (const product of products) {
    const searchQuery = `${product.name} ${product.model || ''} ${product.brand || ''} ${product.specs || ''}`.trim();
    console.log('[QuoteGen] 搜索产品:', searchQuery);

    // 优先从数据库中查询产品价格
    let dbProduct = null;
    try {
      // 使用智能搜索策略
      const dbProducts = await searchProductsInDatabase(
        product.name,
        product.brand || '',
        product.model || '',
        db
      );

      if (dbProducts && dbProducts.length > 0) {
        // 使用增强的匹配算法
        const bestMatch = findBestMatchProduct(
          product.name,
          product.model || '',
          product.brand || '',
          product.specs || '',
          dbProducts
        );

        if (bestMatch) {
          dbProduct = bestMatch.product;
          console.log('[QuoteGen] 从数据库匹配到产品:', dbProduct.name, '价格:', dbProduct.price, '分数:', bestMatch.score);
        } else {
          console.log('[QuoteGen] 数据库中没有达到阈值的产品，使用第一个候选');
          dbProduct = dbProducts[0]; // 降级到第一个候选
        }
      }
    } catch (dbError) {
      console.error('[QuoteGen] 数据库查询失败:', dbError);
    }

    if (dbProduct) {
      // 使用数据库中的产品信息
      matchedProducts.push({
        name: product.name,
        model: dbProduct.model || product.model || '',
        brand: dbProduct.supplier || product.brand || '',
        specifications: dbProduct.specifications || product.specs || '',
        category: dbProduct.category || '',
        description: dbProduct.description || '',
        features: '',
        quantity: product.quantity || 1,
        unitPrice: parseFloat(dbProduct.price) || 0,
        totalPrice: (parseFloat(dbProduct.price) || 0) * (product.quantity || 1),
        note: '来自价格库',
        source: 'database',
      });
    } else {
      // 数据库中没有匹配，尝试从知识库中搜索
      const searchResponse = await knowledgeClient.search(
        searchQuery,
        undefined, // 搜索所有数据集
        3, // topK
        0.5 // minScore
      );

      if (searchResponse.code === 0 && searchResponse.chunks.length > 0) {
        // 从搜索结果中解析产品信息
        const productInfo = searchResponse.chunks[0].content;

        // 使用LLM解析产品信息
        const productParsePrompt = `
从以下文本中提取产品信息，返回JSON格式：
${productInfo}

格式：
{
  "name": "产品名称",
  "model": "型号",
  "price": 价格数字,
  "specs": "规格参数",
  "description": "产品描述",
  "category": "产品类别",
  "brand": "品牌"
}
`;

        const productParseResponse = await llmClient.invoke(
          [{ role: 'user', content: productParsePrompt }],
          { temperature: 0.3 }
        );

        try {
          const parsedProduct = JSON.parse(productParseResponse.content);
          const unitPrice = parsedProduct.price || 0;

          matchedProducts.push({
            name: product.name,
            model: parsedProduct.model || product.model || '',
            brand: parsedProduct.brand || product.brand || '',
            specifications: parsedProduct.specs || product.specs || '',
            category: parsedProduct.category || '',
            description: parsedProduct.description || '',
            features: '',
            quantity: product.quantity || 1,
            unitPrice,
            totalPrice: unitPrice * (product.quantity || 1),
            note: '来自知识库',
            source: 'knowledge',
          });
        } catch (e) {
          console.error('[QuoteGen] 解析知识库产品信息失败:', e);
        }
      } else {
        // 没有找到匹配产品，使用默认价格
        matchedProducts.push({
          name: product.name,
          model: product.model || '',
          brand: product.brand || '',
          specifications: product.specs || '',
          quantity: product.quantity || 1,
          unitPrice: 0,
          totalPrice: 0,
          note: '价格待确认',
        });
      }
    }
  }

  console.log('[QuoteGen] 匹配到产品数量:', matchedProducts.length);

  // 第二步：读取供应方信息
  let supplierInfo = null;
  try {
    const { data: supplierData } = await db
      .from('suppliers')
      .select('*')
      .limit(1)
      .single();

    if (supplierData) {
      supplierInfo = {
        companyName: supplierData.company_name,
        logoUrl: supplierData.logo_url,
        contactPerson: supplierData.contact_person,
        phone: supplierData.phone,
        email: supplierData.email,
        address: supplierData.address,
        bankName: supplierData.bank_name,
        bankAccount: supplierData.bank_account,
        taxNumber: supplierData.tax_number,
      };
    }
  } catch (error) {
    console.error('[QuoteGen] Failed to load supplier info:', error);
  }

  // 第三步：生成报价单数据
  const taxRate = 13;
  const subtotalExcludingTax = matchedProducts.reduce((sum, p) => sum + p.totalPrice, 0);
  const taxAmount = subtotalExcludingTax * (taxRate / 100);
  const subtotalIncludingTax = subtotalExcludingTax + taxAmount;
  const totalAmountIncludingTax = subtotalIncludingTax;

  const quoteNumber = await generateQuoteNumber(supplierInfo?.companyName || '', db);

  const quoteData = {
    quoteNumber,
    supplierInfo,
    customerInfo: {
      name: '客户名称',
      projectName: '',
    },
    products: matchedProducts.map(p => ({
      ...p,
      quantity: p.quantity || 1,
      unitPriceExcludingTax: p.unitPrice,
      totalPriceExcludingTax: p.totalPrice,
      unitPriceIncludingTax: p.unitPrice * (1 + taxRate / 100),
      totalPriceIncludingTax: p.totalPrice * (1 + taxRate / 100),
    })),
    subtotal: subtotalIncludingTax,
    subtotalExcludingTax,
    taxRate,
    taxAmount,
    totalAmount: totalAmountIncludingTax,
    terms: {
      payment: '预付30%，发货前付清',
      warranty: '12个月',
      delivery: '7个工作日',
      validity: '15天',
    },
  };

  return quoteData;
}

export async function POST(request: NextRequest) {
  try {
    const { message, files, conversationId, intent } = await request.json();
    const customHeaders = HeaderUtils.extractForwardHeaders(request.headers);

    // 识别填充价格意图（当用户发送"填充价格"、"应用市场价"等指令时）
    const fillPriceKeywords = ['填充价格', '应用市场价', '更新价格', '自动填充价格', '批量填充价格'];
    if (message && fillPriceKeywords.some(keyword => message.includes(keyword))) {
      console.log('[Chat] 检测到填充价格指令:', message);
      return NextResponse.json({
        action: 'FILL_PRICES',
        content: '正在为您填充市场参考价...',
      });
    }

    // 如果是文件上传但没有用户消息，且没有意图选择参数，只解析文件并返回文件信息
    if (files && Array.isArray(files) && files.length > 0 && (!message || !message.trim()) && !intent) {
      console.log('[Chat] File upload without message, returning file info for intent selection');

      const parsedFiles: any[] = [];

      for (const file of files) {
        const processedFile = processUploadedFile(file);
        const fileKey = (file as any).fileKey || processedFile.url;

        if (!fileKey) {
          console.warn('[Chat] File has no key or URL, skipping:', processedFile.name);
          continue;
        }

        const storage = new S3Storage({
          endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
          accessKey: '',
          secretKey: '',
          bucketName: process.env.COZE_BUCKET_NAME,
          region: 'cn-beijing',
        });

        let fileBuffer: Buffer;
        if (file.url) {
          try {
            const response = await fetch(file.url);
            const buffer = await response.arrayBuffer();
            fileBuffer = Buffer.from(buffer);
          } catch (error) {
            console.error(`[Chat] 从URL下载文件失败: ${processedFile.name}`, error);
            continue; // 跳过这个文件，继续处理其他文件
          }
        } else {
          try {
            fileBuffer = await storage.readFile(fileKey) as Buffer;
          } catch (error) {
            console.error(`[Chat] 从S3读取文件失败: ${processedFile.name}, fileKey: ${fileKey}`, error);
            console.error('[Chat] 错误详情:', error instanceof Error ? error.message : error);
            continue; // 跳过这个文件，继续处理其他文件
          }
        }

        // 验证文件大小
        if (fileBuffer.length < 100) {
          console.warn(`[Chat] 文件大小异常（${fileBuffer.length}字节），跳过: ${processedFile.name}`);
          continue;
        }

        let productCount = 0;
        let products: any[] = [];
        let remarks: string[] = [];
        let rawContent: string = '';

        // xlsx 格式使用原有的 Excel 解析逻辑
        const ext = processedFile.name.split('.').pop()?.toLowerCase();

        if (ext === 'xlsx') {
          const parseResult = await parseExcelFile({ buffer: fileBuffer });
          productCount = parseResult.products.length;
          products = parseResult.products;
          console.log(`[Chat] 从Excel文件 "${processedFile.name}" 解析到 ${productCount} 个产品`);
        } else {
          // 调用TextIn解析
          try {
            const parseResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000'}/api/documents/parse`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileUrl: processedFile.url,
                fileName: processedFile.name,
                fileType: processedFile.type
              })
            });

            const parseResult = await parseResponse.json();

            productCount = parseResult.products?.length || 0;
            products = parseResult.products || [];
            remarks = parseResult.remarks || [];
            rawContent = parseResult.rawContent || '';
            console.log(`[Chat] 从文件 "${processedFile.name}" 解析到 ${productCount} 个产品`);

          } catch (error) {
            console.error(`[Chat] 文件解析失败: ${processedFile.name}`, error);
            remarks.push(`解析失败: ${error instanceof Error ? error.message : '未知错误'}`);
          }
        }

        // 统一push到parsedFiles数组（只push一次）
        parsedFiles.push({
          ...file,  // 保留原始文件对象的所有属性
          name: processedFile.name,
          type: processedFile.type,
          url: processedFile.url,
          fileKey: fileKey,
          productCount,
          products,
          remarks,
          rawContent,
        });
      }

      console.log('[Chat] 总计解析到文件数量:', parsedFiles.length);
      
      // 打印第一个文件的详细信息用于调试
      if (parsedFiles.length > 0) {
        console.log('[Chat] 第一个文件的数据结构:', {
          name: parsedFiles[0].name,
          productCount: parsedFiles[0].productCount,
          productsLength: parsedFiles[0].products?.length,
          hasProducts: !!parsedFiles[0].products,
          firstProduct: parsedFiles[0].products?.[0] ? {
            name: parsedFiles[0].products[0].name,
            quantity: parsedFiles[0].products[0].quantity
          } : null
        });
      }

      return NextResponse.json({
        action: 'ASK_INTENT',
        files: parsedFiles,
        content: '文件解析完成，请选择您需要的服务：'
      });
    }

    // 如果是意图选择请求（文件上传后）
    if (intent && files && files.length > 0) {
      console.log('[Chat] Intent selection request:', intent);
      console.log('[Chat] 收到的files数量:', files.length);
      console.log('[Chat] 第一个文件的数据:', {
        name: files[0].name,
        productCount: files[0].productCount,
        productsLength: files[0].products?.length,
        hasProducts: !!files[0].products,
        firstProduct: files[0].products?.[0] ? {
          name: files[0].products[0].name,
          quantity: files[0].products[0].quantity
        } : null
      });

      // 初始化客户端（用于报价生成）
      const llmConfig = new Config();
      const llmClient = new LLMClient(llmConfig, customHeaders);

      const knowledgeConfig = new Config();
      const knowledgeClient = new KnowledgeClient(knowledgeConfig, customHeaders);

      const db = getSupabaseClient();

      // 解析文件并收集所有产品
      const allProducts: any[] = [];
      const fileNames: string[] = [];

      for (const file of files) {
        const processedFile = processUploadedFile(file);
        const fileKey = (file as any).fileKey || processedFile.url;
        fileNames.push(processedFile.name);

        if (!fileKey) continue;

        const storage = new S3Storage({
          endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
          accessKey: '',
          secretKey: '',
          bucketName: process.env.COZE_BUCKET_NAME,
          region: 'cn-beijing',
        });

        let fileBuffer: Buffer;
        if (file.url) {
          const response = await fetch(file.url);
          const buffer = await response.arrayBuffer();
          fileBuffer = Buffer.from(buffer);
        } else {
          fileBuffer = await storage.readFile(fileKey) as Buffer;
        }

        // 处理Excel文件
        if (processedFile.type.includes('sheet') || processedFile.type.includes('excel') ||
            processedFile.name.endsWith('.xlsx') || processedFile.name.endsWith('.xls')) {
          const parseResult = await parseExcelFile({ buffer: fileBuffer });
          console.log(`[Chat] 从文件 "${processedFile.name}" 解析到 ${parseResult.products.length} 个产品`);
          allProducts.push(...parseResult.products);
        }
        // 处理PDF、图片等文件（使用已解析的products）
        else if (file.products && Array.isArray(file.products)) {
          console.log(`[Chat] 使用已解析的产品数据，文件 "${processedFile.name}" 有 ${file.products.length} 个产品`);
          allProducts.push(...file.products);
        }
        // 如果没有已解析的产品，尝试调用TextIn解析
        else {
          console.log(`[Chat] 文件 "${processedFile.name}" 没有已解析的产品，调用TextIn解析`);
          try {
            const parseResponse = await fetch(`${process.env.NEXT_PUBLIC_APP_URL || 'http://localhost:5000'}/api/documents/parse`, {
              method: 'POST',
              headers: { 'Content-Type': 'application/json' },
              body: JSON.stringify({
                fileUrl: processedFile.url,
                fileName: processedFile.name,
                fileType: processedFile.type
              })
            });

            const parseResult = await parseResponse.json();
            console.log(`[Chat] 从文件 "${processedFile.name}" 解析到 ${parseResult.products?.length || 0} 个产品`);
            
            if (parseResult.products && Array.isArray(parseResult.products)) {
              allProducts.push(...parseResult.products);
            }
          } catch (error) {
            console.error(`[Chat] 文件解析失败: ${processedFile.name}`, error);
          }
        }
      }

      console.log('[Chat] 总计解析到产品数量:', allProducts.length);

      // 根据意图生成响应
      let responseContent = '';
      let quoteData = null;

      if (intent === 'quote' || intent === 'both') {
        // 生成报价单
        console.log('[Chat] 开始生成报价单...');
        quoteData = await generateQuoteData(allProducts, llmClient, knowledgeClient, null, db);

        // 生成回复内容
        const hasValidPrice = quoteData.products.some((p: any) => p.totalPrice > 0);

        if (hasValidPrice) {
          responseContent = `# 📋 智能报价方案

我已为您合并了 ${fileNames.length} 个文件的产品信息，生成了以下详细报价方案：

---

## 📦 产品明细

${quoteData.products.map((p: any, idx: number) => {
  const priceSource = p.source === 'knowledge' ? '（知识库）' : '（待确认）';
  let detailText = `${idx + 1}. **${p.name}** ${p.model ? `[${p.model}]` : ''}
   - 规格：${p.specifications || '标准规格'}
   - 数量：${p.quantity} 个
   - 单价：¥${p.unitPrice.toLocaleString()} ${priceSource}
   - 小计：¥${p.totalPrice.toLocaleString()}`;

  return detailText;
}).join('\n\n')}

---

## 💰 费用明细

| 项目 | 金额 |
|------|------|
| 小计 | ¥${quoteData.subtotal.toLocaleString()} |
| 税费（${quoteData.taxRate}%） | ¥${quoteData.taxAmount.toLocaleString()} |
| **总计** | **¥${quoteData.totalAmount.toLocaleString()}** |

---

## 💡 下一步操作

您可以选择：

1. **查看报价单**：下方的表格中展示了完整的报价明细
2. **导出报价单**：点击"下载 Excel"或"下载 PDF"按钮
3. **调整报价**：对我说"修改产品数量为X"、"更换为其他型号"等
4. **完善信息**：在右侧信息管理中填写供应方和客户信息

如有任何问题，请随时告诉我！`;
        } else {
          responseContent = `# 📋 报价方案（价格待确认）

我已为您合并了 ${fileNames.length} 个文件的产品信息，共 ${quoteData.products.length} 个产品：

---

## 📦 产品明细

${quoteData.products.map((p: any, idx: number) => {
  return `${idx + 1}. **${p.name}** ${p.model ? `[${p.model}]` : ''}
   - 规格：${p.specifications || '标准规格'}
   - 数量：${p.quantity}`;
}).join('\n\n')}

---

## ⚠️ 重要提示

由于系统暂未找到这些产品的准确价格信息，以上报价单为草稿。请您：

1. 联系客服获取准确价格
2. 或提供参考价格，我们将为您更新正式报价单

如有任何问题，请随时告诉我们！`;
        }
      } else if (intent === 'proposal') {
        // 仅生成方案书
        responseContent = `# 📝 产品方案书

我已为您合并了 ${fileNames.length} 个文件的产品信息，共 ${allProducts.length} 个产品：

---

## 📦 产品清单

${allProducts.map((p, idx) => {
  return `${idx + 1}. ${p.name}
   - 规格：${p.specs || '标准规格'}
   - 数量：${p.quantity}`;
}).join('\n\n')}

---

## 💡 说明

如您需要正式报价单，请选择"方案+报价"选项，我将为您生成包含价格的完整报价单。

如有任何问题，请随时联系我们！`;
      }

      return NextResponse.json({
        content: responseContent,
        quoteData,
      });
    }

    // 初始化客户端
    const llmConfig = new Config();
    const llmClient = new LLMClient(llmConfig, customHeaders);

    const visionConfig = new Config();
    const visionClient = new LLMClient(visionConfig, customHeaders);

    const knowledgeConfig = new Config();
    const knowledgeClient = new KnowledgeClient(knowledgeConfig, customHeaders);

    const searchConfig = new Config();
    const searchClient = new SearchClient(searchConfig, customHeaders);

    const db = getSupabaseClient();

    // 第一步：如果上传了文件，先解析文件内容
    let fileContent = '';
    if (files && Array.isArray(files) && files.length > 0) {
      console.log('[Chat] Files uploaded:', files.length);
      
      for (const file of files) {
        // 使用processUploadedFile函数处理文件
        const processedFile = processUploadedFile(file);
        
        console.log('[Chat] 处理文件:', { name: processedFile.name, type: processedFile.type });
        console.log('[Chat] 原始file对象:', JSON.stringify(file, null, 2));
        
        // 检查文件是否有fileKey或URL
        const fileKey = (file as any).fileKey || processedFile.url;
        console.log('[Chat] 获取到的fileKey:', fileKey);
        
        if (!fileKey) {
          console.warn('[Chat] 文件fileKey和URL都为空，跳过处理:', processedFile.name);
          continue;
        }
        
        // 初始化S3Storage
        const storage = new S3Storage({
          endpointUrl: process.env.COZE_BUCKET_ENDPOINT_URL,
          accessKey: '',
          secretKey: '',
          bucketName: process.env.COZE_BUCKET_NAME,
          region: 'cn-beijing',
        });
        
        console.log('[Chat] 准备读取文件，fileKey:', fileKey);
        
        // 优先使用fetch从URL下载文件（更可靠）
        let fileBuffer: Buffer;
        if (file.url) {
          console.log('[Chat] 文件下载URL:', file.url);
          try {
            const response = await fetch(file.url);
            console.log('[Chat] 下载响应状态:', response.status, response.statusText);
            
            if (!response.ok) {
              throw new Error(`HTTP ${response.status}`);
            }
            
            const buffer = await response.arrayBuffer();
            console.log('[Chat] 下载内容大小:', buffer.byteLength, 'bytes');
            
            fileBuffer = Buffer.from(buffer);
            console.log('[Chat] Buffer转换成功，大小:', fileBuffer.length, 'bytes');
          } catch (error) {
            console.error('[Chat] URL下载失败，尝试使用readFile:', error);
            // 降级到使用S3Storage读取
            const storageBuffer = await storage.readFile({ fileKey });
            fileBuffer = Buffer.isBuffer(storageBuffer) ? storageBuffer : Buffer.from(storageBuffer as any);
            console.log('[Chat] readFile读取成功，文件大小:', fileBuffer.length, 'bytes');
          }
        } else {
          // 没有URL，直接使用readFile
          console.log('[Chat] 没有URL，使用readFile读取文件');
          const storageBuffer = await storage.readFile({ fileKey });
          fileBuffer = Buffer.isBuffer(storageBuffer) ? storageBuffer : Buffer.from(storageBuffer as any);
          console.log('[Chat] readFile读取成功，文件大小:', fileBuffer.length, 'bytes');
        }
        
        // 确保fileBuffer是Buffer类型
        if (!Buffer.isBuffer(fileBuffer)) {
          throw new Error(`无法将fileBuffer转换为Buffer，类型为: ${typeof fileBuffer}`);
        }
        
        // 根据文件类型处理
        if (processedFile.type.startsWith('image/')) {
          // 图片文件：使用Vision模型解析
          try {
            const visionMessages = [
              {
                role: 'user' as const,
                content: [
                  {
                    type: 'text' as const,
                    text: `请详细描述这张图片的内容，特别是：
1. 如果是询价单，请列出所有产品的名称、规格、数量
2. 如果是产品图片，请描述产品的名称、型号、规格参数
3. 如果有报价要求，请提取出来

请用结构化的方式返回信息。`,
                  },
                  {
                    type: 'image_url' as const,
                    image_url: {
                      url: processedFile.url || fileKey,
                      detail: 'high' as const,
                    },
                  },
                ],
              },
            ];

            const visionResponse = await visionClient.invoke(visionMessages, {
              model: 'doubao-seed-1-6-vision-250815',
              temperature: 0.3,
            });

            fileContent += `\n\n【文件：${processedFile.name}】\n${visionResponse.content}`;
            console.log('[Chat] File content extracted:', visionResponse.content.substring(0, 200));
          } catch (e) {
            console.error('[Chat] Failed to parse image file:', e);
            fileContent += `\n\n【文件：${processedFile.name}】\n无法解析图片内容`;
          }
        } else if (processedFile.type.includes('pdf') || processedFile.name.endsWith('.pdf')) {
          // PDF文件：提示需要手动输入
          fileContent += `\n\n【文件：${processedFile.name}】\nPDF文件，需要手动输入产品信息`;
        } else if (processedFile.type.includes('sheet') || processedFile.type.includes('excel') || 
                   processedFile.name.endsWith('.xlsx') || processedFile.name.endsWith('.xls')) {
          // Excel文件：解析内容
          try {
            console.log('[Chat] 开始使用parseExcelFile解析文件，buffer长度:', fileBuffer.length);
            
            // 调用parseExcelFile函数解析Excel
            const parseResult = await parseExcelFile({ buffer: fileBuffer });
            
            console.log('[Chat] 解析到产品数量:', parseResult.products.length);
            console.log('[Chat] 解析到备注数量:', parseResult.globalRemarks.length);
            
            // 将解析结果转换为文本格式
            let excelText = '';
            
            if (parseResult.products.length > 0) {
              excelText += '产品列表:\n';
              parseResult.products.forEach((product, index) => {
                excelText += `${index + 1}. ${product.name}`;
                if (product.model) {
                  excelText += ` | 型号: ${product.model}`;
                }
                if (product.brand) {
                  excelText += ` | 品牌: ${product.brand}`;
                }
                if (product.specs) {
                  excelText += ` | 规格: ${product.specs}`;
                }
                if (product.unit) {
                  excelText += ` | 单位: ${product.unit}`;
                }
                excelText += ` | 数量: ${product.quantity || 1}`; // 添加数量字段，默认为1
                if (product.price) {
                  excelText += ` | 单价: ${product.price}`;
                }
                if (product.remark) {
                  excelText += ` | 备注: ${product.remark}`;
                }
                excelText += '\n';
              });
            } else {
              excelText += '未找到有效的产品数据\n';
            }
            
            if (parseResult.globalRemarks) {
              excelText += `\n备注信息:\n${parseResult.globalRemarks}`;
            }
            
            fileContent += `\n\n【文件：${processedFile.name}】\n${excelText}`;
            console.log('[Chat] Excel文件解析完成，内容长度:', fileContent.length);
          } catch (e) {
            console.error('[Chat] Excel解析失败:', e);
            fileContent += `\n\n【文件：${processedFile.name}】\nExcel文件解析失败: ${e instanceof Error ? e.message : String(e)}`;
          }
        } else {
          // 其他文件类型
          fileContent += `\n\n【文件：${processedFile.name}】\n暂不支持此文件类型的自动解析`;
        }
      }
    }

    // 第二步：解析用户需求，提取关键词（整合文件内容和用户消息）
    const parsePrompt = `
你是专业的报价助手。请分析用户需求，提取以下信息：

用户需求：${message}

${fileContent ? `\n文件内容：\n${fileContent}` : ''}

请提取：
1. 产品关键词
2. 规格参数
3. 数量
4. 其他特殊要求

注意：
- 如果文件中有产品信息，优先从文件中提取
- Excel文件中的产品信息格式为：产品: [名称] | 规格: [规格] | 数量: [数量]
- 如果Excel文件中有"价格"列，说明这是已有报价，需要更新或确认
- 如果用户有特定的报价要求（如"需要3天内交货"），请提取到"其他特殊要求"
- 如果找不到产品信息，请如实返回空的products数组

以JSON格式返回，格式：
{
  "products": [{"name": "产品名", "model": "型号", "brand": "品牌", "specs": "规格", "quantity": 数值}],
  "requirements": "其他要求"
}
`;

    const parseResponse = await llmClient.invoke(
      [{ role: 'user', content: parsePrompt }],
      { temperature: 0.3 }
    );

    console.log('[Chat] LLM解析响应:', parseResponse.content.substring(0, 500));

    let parsedData;
    try {
      // 尝试从响应中提取JSON
      const jsonMatch = parseResponse.content.match(/\{[\s\S]*\}/);
      if (jsonMatch) {
        parsedData = JSON.parse(jsonMatch[0]);
        console.log('[Chat] 解析到的产品数据:', JSON.stringify(parsedData, null, 2));
      } else {
        console.warn('[Chat] LLM响应中没有找到JSON，使用默认值');
        parsedData = { products: [{ name: message, model: '', brand: '', specs: '', quantity: 1 }], requirements: '' };
      }
    } catch (e) {
      console.error('[Chat] 解析LLM响应失败:', e);
      parsedData = { products: [{ name: message, model: '', brand: '', specs: '', quantity: 1 }], requirements: '' };
    }

    // 第二步：在知识库中搜索产品
    let matchedProducts: any[] = [];

    console.log('[Chat] 开始搜索产品，数量:', parsedData.products.length);

    for (const product of parsedData.products) {
      const searchQuery = `${product.name} ${product.model || ''} ${product.brand || ''} ${product.specs}`.trim();
      console.log('[Chat] 搜索产品:', searchQuery);

      // 在知识库中搜索
      const searchResponse = await knowledgeClient.search(
        searchQuery,
        undefined, // 搜索所有数据集
        3, // topK
        0.5 // minScore
      );

      if (searchResponse.code === 0 && searchResponse.chunks.length > 0) {
        // 从搜索结果中解析产品信息
        const productInfo = searchResponse.chunks[0].content;

        // 使用LLM解析产品信息
        const productParsePrompt = `
从以下文本中提取产品信息，返回JSON格式：
${productInfo}

格式：
{
  "name": "产品名称",
  "model": "型号",
  "price": 价格数字,
  "specs": "规格参数",
  "description": "产品描述",
  "category": "产品类别",
  "features": "产品特点"
}
`;

        try {
          const productParseResponse = await llmClient.invoke(
            [{ role: 'user', content: productParsePrompt }],
            { temperature: 0.3 }
          );

          const productJsonMatch = productParseResponse.content.match(/\{[\s\S]*\}/);
          if (productJsonMatch) {
            const productData = JSON.parse(productJsonMatch[0]);
            matchedProducts.push({
              name: productData.name || product.name,
              model: productData.model || '',
              brand: product.brand || '',
              specifications: productData.specs || product.specs,
              description: productData.description || '',
              category: productData.category || '',
              features: productData.features || '',
              quantity: product.quantity,
              unitPrice: productData.price || 0,
              totalPrice: (productData.price || 0) * product.quantity,
              source: 'knowledge',
            });
          }
        } catch (e) {
          // 如果解析失败，使用原始信息
          matchedProducts.push({
            name: product.name,
            model: '',
            brand: product.brand || '',
            specifications: product.specs,
            description: '',
            category: '',
            features: '',
            quantity: product.quantity,
            unitPrice: 0,
            totalPrice: 0,
            source: 'knowledge',
          });
        }
      } else {
        // 没有找到匹配产品，尝试联网搜索
        console.log('[Chat Workflow] Knowledge search no results, starting web search for:', product.name, product.specs);
        let webSearchPrice = null;
        let webSearchNote = '未找到匹配产品，请确认产品信息或联系客服';

        try {
          // 联网搜索产品价格
          const webSearchQuery = `${product.name} ${product.specs} 价格`.trim();
          console.log('[Chat Workflow] Web search query:', webSearchQuery);
          const webSearchResponse = await searchClient.webSearch(webSearchQuery, 5, true);
          console.log('[Chat Workflow] Web search results count:', webSearchResponse.web_items?.length || 0);

          if (webSearchResponse.web_items && webSearchResponse.web_items.length > 0) {
            // 使用LLM从搜索结果中提取价格信息
            const searchResultsText = webSearchResponse.web_items
              .map((item, index) => `${index + 1}. ${item.title}\n${item.snippet}\n`)
              .join('\n');

            const priceExtractPrompt = `
从以下搜索结果中提取产品价格信息，返回JSON格式：
产品：${product.name} ${product.specs}
搜索结果：
${searchResultsText}

格式：
{
  "name": "产品名称",
  "model": "型号",
  "price": 价格数字（如果没有价格则返回0）,
  "specs": "规格参数",
  "description": "产品描述",
  "note": "价格说明或备注"
}
`;

            const priceExtractResponse = await llmClient.invoke(
              [{ role: 'user', content: priceExtractPrompt }],
              { temperature: 0.3 }
            );

            console.log('[Chat Workflow] Price extraction response:', priceExtractResponse.content.substring(0, 200));

            // 尝试匹配JSON数组或单个JSON对象，添加截断保护
            function safeParseJSON(content: string): any[] {
              try {
                // 尝试修复可能被截断的JSON
                let jsonContent = content;
                
                // 如果字符串以不完整结束，截取到最后一个完整的对象
                const lastBrace = content.lastIndexOf(']');
                if (lastBrace === -1) {
                  // 没有找到结束括号，尝试找到最后一个完整对象
                  const lastObjBrace = content.lastIndexOf('}');
                  if (lastObjBrace > 0 && lastObjBrace < content.length - 1) {
                    // 如果最后一个}后面还有内容，说明可能被截断了
                    jsonContent = content.substring(0, lastObjBrace + 1);
                  }
                } else if (lastBrace < content.length - 1) {
                  // 找到了结束括号但不在最后，可能有额外内容，截取到结束括号
                  jsonContent = content.substring(0, lastBrace + 1);
                }

                const parsed = JSON.parse(jsonContent);
                return Array.isArray(parsed) ? parsed : [parsed];
              } catch (e) {
                console.error('[Web Search] JSON parse error:', e);
                console.error('[Web Search] Original content (first 500 chars):', content.substring(0, 500));
                return [];
              }
            }

            // 尝试匹配JSON数组或单个JSON对象
            const arrayMatch = priceExtractResponse.content.match(/\[[\s\S]*\]/);
            const objectMatch = priceExtractResponse.content.match(/\{[\s\S]*\}/);

            let priceData = null;

            if (arrayMatch) {
              // 处理数组的情况，取第一个产品的价格
              const priceArray = safeParseJSON(arrayMatch[0]);
              if (priceArray.length > 0) {
                priceData = priceArray[0];
              }
            } else if (objectMatch) {
              // 处理单个对象的情况
              const priceObj = safeParseJSON(objectMatch[0]);
              if (priceObj.length > 0) {
                priceData = priceObj[0];
              }
            }

            if (priceData) {
              webSearchPrice = priceData.price || 0;
              webSearchNote = priceData.note || '市场参考价（联网搜索）';

              if (webSearchPrice > 0) {
                const productData = {
                  name: priceData.name || product.name,
                  model: priceData.model || '',
                  brand: product.brand || '',
                  specifications: priceData.specs || product.specs,
                  description: priceData.description || '',
                  category: '',
                  features: '',
                  quantity: product.quantity || 1, // 默认数量为1
                  unitPrice: webSearchPrice,
                  totalPrice: webSearchPrice * (product.quantity || 1), // 确保totalPrice正确
                  note: `市场参考价（联网搜索）`,
                  source: 'web_search',
                };
                matchedProducts.push(productData);
              }
            } else {
              console.log('[Web Search] No valid JSON found in response');
            }
          }
        } catch (e) {
          console.error('Web search failed:', e);
        }

        // 如果联网搜索也没有找到价格
        if (webSearchPrice === null || webSearchPrice === 0) {
          matchedProducts.push({
            name: product.name,
            model: '',
            brand: product.brand || '',
            specifications: product.specs,
            quantity: product.quantity,
            unitPrice: 0,
            totalPrice: 0,
            note: webSearchNote,
          });
        }
      }
    }

    // 第三步：读取供应方信息
    let supplierInfo = null;
    try {
      const { data: supplierData } = await db
        .from('suppliers')
        .select('*')
        .limit(1)
        .single();
      
      if (supplierData) {
        supplierInfo = {
          companyName: supplierData.company_name,
          logoUrl: supplierData.logo_url,
          contactPerson: supplierData.contact_person,
          phone: supplierData.phone,
          email: supplierData.email,
          address: supplierData.address,
          bankName: supplierData.bank_name,
          bankAccount: supplierData.bank_account,
          taxNumber: supplierData.tax_number,
        };
        console.log('[Chat] Supplier info loaded:', supplierInfo.companyName);
      }
    } catch (error) {
      console.error('[Chat] Failed to load supplier info:', error);
    }

    // 第四步：生成报价单
    // 假设从知识库或联网搜索获取的价格是不含税的市场价格
    // 计算含税价格和税费
    const taxRate = 13;
    const subtotalExcludingTax = matchedProducts.reduce((sum, p) => sum + p.totalPrice, 0);
    const taxAmount = subtotalExcludingTax * (taxRate / 100);
    const subtotalIncludingTax = subtotalExcludingTax + taxAmount;
    const totalAmountIncludingTax = subtotalIncludingTax; // 含税总价 = 含税小计

    // 生成报价单编号：公司简称首字母+年月日+千位阿拉伯数字
    const companyAbbr = supplierInfo?.companyName || '';
    const quoteNumber = await generateQuoteNumber(companyAbbr, db);

    const quoteData = {
      quoteNumber,
      supplierInfo,
      customerInfo: {
        name: '客户名称',
        projectName: '',
      },
      products: matchedProducts.map(p => ({
        ...p,
        // 确保quantity有默认值
        quantity: p.quantity || 1,
        // 保存不含税价格（供内部使用）
        unitPriceExcludingTax: p.unitPrice,
        totalPriceExcludingTax: p.totalPrice,
        // 计算含税价格（用于显示）
        unitPriceIncludingTax: p.unitPrice * (1 + taxRate / 100),
        totalPriceIncludingTax: p.totalPrice * (1 + taxRate / 100),
      })),
      // 前端显示使用含税价格体系
      subtotal: subtotalIncludingTax,        // 含税小计
      subtotalExcludingTax,                  // 不含税小计（供参考）
      taxRate,
      taxAmount,                             // 税费
      totalAmount: totalAmountIncludingTax,  // 含税总价
      terms: {
        payment: '预付30%，发货前付清',
        warranty: '12个月',
        delivery: '7个工作日',
        validity: '15天',
      },
    };

    // 第五步：生成回复内容
    let responseContent = '';

    // 判断是否有产品信息
    if (matchedProducts.length === 0) {
      responseContent = `抱歉，我无法识别您提供的产品信息。

建议：
1. 请确保上传的文件包含完整的产品信息（产品名称、规格、数量）
2. 或者直接输入产品名称和规格

例如："请帮我报价：二氧化氯发生器 100g/h"`;
    } else if (matchedProducts.every((p) => p.totalPrice === 0)) {
      // 有产品信息但没有价格，仍然生成报价单，只是标注价格待确认
      const validProducts = matchedProducts;
      const webSearchProducts = matchedProducts.filter((p) => p.source === 'web_search');
      
      let sourceInfo = '';
      if (webSearchProducts.length > 0) {
        sourceInfo = '\n\n💡 价格来源：联网搜索（市场参考价）';
      }

      // 生成产品说明（价格为0时标注待确认）
      let productDetails = validProducts.map((p, idx) => {
        const priceText = p.unitPrice > 0 
          ? `¥${p.unitPrice.toLocaleString()}` 
          : '待确认';
        const priceSource = p.source === 'web_search' ? '（市场参考价）' : '（待确认）';
        let detailText = `${idx + 1}. **${p.name}** ${p.model ? `[${p.model}]` : ''}
   - 规格：${p.specifications || '标准规格'}
   - 数量：${p.quantity}
   - 单价：${priceText} ${priceSource}`;

        if (p.description) {
          detailText += `\n   - 描述：${p.description}`;
        }

        return detailText;
      }).join('\n\n');

      responseContent = `我已识别到您询价的产品信息，但由于缺乏准确的价格数据，我为您生成了一份待确认的报价单。

${productDetails}

⚠️ **重要提示：**
- 以上产品价格待确认，请联系客服获取准确报价
- 我们将在确认价格后为您更新正式报价单
- 报价单编号：${quoteNumber}

如有任何疑问，请随时联系我们！`;
    } else {
      const validProducts = matchedProducts.filter((p) => p.totalPrice > 0);
      const webSearchProducts = matchedProducts.filter((p) => p.source === 'web_search');
      const knowledgeProducts = matchedProducts.filter((p) => p.source !== 'web_search');

      let sourceInfo = '';
      if (webSearchProducts.length > 0 && knowledgeProducts.length > 0) {
        sourceInfo = `\n\n💡 价格来源：${knowledgeProducts.length} 个来自知识库，${webSearchProducts.length} 个来自联网搜索`;
      } else if (webSearchProducts.length > 0) {
        sourceInfo = '\n\n💡 价格来源：联网搜索（市场参考价）';
      }

      // 生成详细的产品说明
      let productDetails = validProducts.map((p, idx) => {
        const priceSource = p.source === 'web_search' ? '（市场参考价）' : '（知识库）';
        let detailText = `${idx + 1}. **${p.name}** ${p.model ? `[${p.model}]` : ''}
   - 类别：${p.category || '通用产品'}
   - 规格：${p.specifications || '标准规格'}`;

        if (p.description) {
          detailText += `\n   - 描述：${p.description}`;
        }
        if (p.features) {
          detailText += `\n   - 特点：${p.features}`;
        }

        detailText += `
   - 数量：${p.quantity} 个
   - 单价：¥${p.unitPrice.toLocaleString()} ${priceSource}
   - 小计：¥${p.totalPrice.toLocaleString()}`;

        // 如果是联网搜索的产品，添加标注
        if (p.source === 'web_search') {
          detailText += `
   ⚠️ *以上信息来自联网搜索，仅供参考*`;
        }

        return detailText;
      }).join('\n\n');

      // 生成建议和注意事项
      let suggestions = '';
      if (knowledgeProducts.length > 0) {
        suggestions += '\n\n✅ **价格优势**：知识库产品来自我们合作的供应商，价格更具竞争力。';
      }
      if (webSearchProducts.length > 0) {
        suggestions += '\n\n⚠️ **重要提示**：以下产品价格来自联网搜索（市场参考价），仅供参考。实际成交价可能会因供应商、采购量、地域等因素而有所不同。';
      }

      responseContent = `# 📋 智能报价方案

根据您的需求 "${message}"，我为您制定了以下详细报价方案：

---

## 📦 产品明细

${productDetails}

---

## 💰 费用明细

| 项目 | 金额 |
|------|------|
| 小计 | ¥${subtotalExcludingTax.toLocaleString()} |
| 税费（${taxRate}%） | ¥${taxAmount.toLocaleString()} |
| **总计** | **¥${totalAmountIncludingTax.toLocaleString()}** |

---

## 📝 方案说明

${suggestions}

---

## 💡 下一步操作

您可以选择：

1. **查看报价单**：下方的表格中展示了完整的报价明细
2. **导出报价单**：点击"下载 Excel"或"下载 PDF"按钮
3. **调整报价**：对我说"修改产品数量为X"、"更换为其他型号"等
4. **完善信息**：在右侧信息管理中填写供应方和客户信息

${sourceInfo}

${webSearchProducts.length > 0 ? '\n---\n\n⚠️ **联网搜索免责声明**：标注"市场参考价"的产品信息来自互联网搜索，仅供参考使用。如需精确报价，请联系我们的销售人员获取正式报价。' : ''}

如有任何问题，请随时告诉我！`;

      // 临时禁用报价保存（测试模式）
      console.log('[Chat] 报价生成成功，但保存已禁用（测试模式）');
      const finalQuoteNumber = quoteNumber || `QT${Date.now().toString().slice(-8)}`;
      console.log('[Chat] Quote data:', {
        quote_number: finalQuoteNumber,
        subtotalExcludingTax,
        tax_rate: taxRate,
        tax_amount: taxAmount,
        total_amount: totalAmountIncludingTax,
        products_count: matchedProducts.length
      });
      // try {
      //   // 确保quoteNumber存在
      //   const finalQuoteNumber = quoteNumber || `QT${Date.now().toString().slice(-8)}`;
      //   
      //   console.log('[Chat] Saving quote with quote_number:', finalQuoteNumber);
      //   
      //   const { error: quoteError } = await db.from('quotes').insert({
      //     quote_number: finalQuoteNumber,
      //     products: matchedProducts,
      //     subtotal: subtotal.toString(),
      //     tax_rate: taxRate.toString(),
      //     tax_amount: taxAmount.toString(),
      //     total_amount: totalAmount.toString(),
      //     status: 'draft',
      //   });
      // 
      //   if (quoteError) {
      //     console.error('Failed to save quote:', quoteError);
      //   } else {
      //     console.log('[Chat] Quote saved successfully');
      //   }
      // } catch (e) {
      //   console.error('Failed to save quote:', e);
      // }
    }

    // 第六步：保存对话记录
    let savedConversationId = conversationId;

    try {
      const now = new Date().toISOString();
      const userMessage = {
        role: 'user' as const,
        content: message,
        timestamp: now,
      };
      const assistantMessage = {
        role: 'assistant' as const,
        content: responseContent,
        timestamp: new Date().toISOString(),
        quoteData,
      };

      if (conversationId) {
        // 更新现有对话
        const { data: existingConv } = await db
          .from('conversations')
          .select('messages')
          .eq('id', conversationId)
          .single();

        if (existingConv) {
          const updatedMessages = [...existingConv.messages, userMessage, assistantMessage];
          await db
            .from('conversations')
            .update({
              messages: updatedMessages,
              updated_at: now,
            })
            .eq('id', conversationId);
        }
      } else {
        // 创建新对话
        const { data: newConv } = await db
          .from('conversations')
          .insert({
            title: message.slice(0, 50) + (message.length > 50 ? '...' : ''),
            messages: [userMessage, assistantMessage],
            updated_at: now,
          })
          .select()
          .single();

        savedConversationId = newConv.id;
      }
    } catch (e) {
      console.error('Failed to save conversation:', e);
    }

    return NextResponse.json({
      success: true,
      content: responseContent,
      quoteData: matchedProducts.length > 0 ? quoteData : null, // 只要有产品就返回报价数据
      conversationId: savedConversationId,
      testMode: true,
      message: matchedProducts.length > 0 ? '报价生成成功（测试模式-未保存到数据库）' : '无法识别产品信息',
    });
  } catch (error) {
    console.error('Chat error:', error);
    return NextResponse.json(
      { success: false, error: 'Failed to process chat' },
      { status: 500 }
    );
  }
}
