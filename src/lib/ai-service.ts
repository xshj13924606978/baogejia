/**
 * AI服务集成
 * 
 * 提供PDF解析功能，支持多种AI服务：
 * - Coze Vision: 使用视觉理解能力解析PDF
 * - TextIn: 专门针对表格数据的解析
 */

import { parse } from 'node-html-parser';

// ============================================================================
// 类型定义
// ============================================================================

export interface Product {
  name: string;
  model: string;
  brand: string;
  parameter_description: string;
  quantity: number;
  unit: string;
  unit_price: number;
  remark: string;
}

export interface ParseResult {
  products: Product[];
}

// ============================================================================
// Coze Vision 服务
// ============================================================================

/**
 * 使用 Coze Vision 解析PDF文件
 * @param fileId TextIn 文件ID
 * @returns 解析后的产品列表（原始格式，由 route.ts 统一处理）
 */
export async function getCozeResponse(fileId: string): Promise<any> {
  try {
    const response = await fetch('https://api.coze.cn/v1/workflow/run', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.COZE_API_KEY}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        workflow_id: process.env.COZE_WORKFLOW_ID,
        parameters: {
          file_id: fileId,
          prompt: `你是一个专业的PDF解析助手，请从上传的文件中提取产品信息。

【输出格式要求】
必须返回一个JSON对象，包含products数组，每个产品必须包含以下字段：
- name: 产品名称（必须）
- model: 型号规格（如果没有则填空字符串）
- brand: 品牌（如果没有则填空字符串）
- parameter_description: 产品的详细参数描述（必须！从文件中提取完整的参数信息）
- quantity: 数量（如果没有则填1）
- unit: 单位（如果没有则填"套"）
- unit_price: 单价（数字，如果没有则填0）
- remark: 备注（如果没有则填空字符串）

【重要规则】
1. parameter_description 必须填充，不能为空！
2. 如果文件中有重复的产品，请只保留一条
3. 严格按照上述字段名返回

请开始解析。`,
        },
      }),
    });

    const data = await response.json();
    
    if (data.code === 0 && data.data) {
      try {
        const result = JSON.parse(data.data);
        return result; // 返回原始数据，由 route.ts 统一处理
      } catch (e) {
        console.error('解析Coze返回数据失败:', e);
        return { products: [] };
      }
    }
    
    return { products: [] };
  } catch (error) {
    console.error('Coze API调用失败:', error);
    return { products: [] };
  }
}

// ============================================================================
// TextIn 服务
// ============================================================================

/**
 * 使用 TextIn 解析PDF中的表格数据
 * @param fileId TextIn 文件ID
 * @returns 解析后的产品列表（原始格式，由 route.ts 统一处理）
 */
export async function getTextInTableResponse(fileId: string): Promise<any> {
  try {
    const response = await fetch(`https://api.textin.com/table/async/${fileId}`, {
      method: 'GET',
      headers: {
        'x-ti-app-id': process.env.TEXTIN_APP_ID!,
        'x-ti-secret-code': process.env.TEXTIN_SECRET_CODE!,
      },
    });
    
    const data = await response.json();
    
    console.log('[TextIn调试] 原始返回数据:', JSON.stringify(data, null, 2));
    
    // 情况1: 如果返回的是 HTML 格式的表格数据
    if (data && (data.html || data.result?.html || data.result?.tables?.[0]?.html)) {
      const htmlContent = data.html || data.result?.html || data.result?.tables?.[0]?.html;
      console.log('[TextIn调试] 检测到HTML格式，开始解析');
      
      return parseHTMLTable(htmlContent);
    }
    
    // 情况2: 如果返回的是 JSON 格式的表格数据（旧格式）
    if (data && data.result && data.result.tables) {
      const products = [];
      
      for (const table of data.result.tables) {
        const product = {
          name: table.cells?.[0]?.text || '',
          model: table.cells?.[1]?.text || '',
          brand: table.cells?.[2]?.text || '',
          specifications: table.cells?.[3]?.text || '', // TextIn 返回的是 specifications
          quantity: parseInt(table.cells?.[4]?.text) || 1,
          unit: table.cells?.[5]?.text || '套',
          unit_price: parseFloat(table.cells?.[6]?.text) || 0,
          remark: table.cells?.[7]?.text || ''
        };
        products.push(product);
      }
      
      console.log('[TextIn调试] 检测到JSON格式，解析完成，产品数:', products.length);
      return { products };
    }
    
    console.log('[TextIn调试] 未检测到有效表格数据');
    return { products: [] };
  } catch (error) {
    console.error('[TextIn错误] API调用失败:', error);
    return { products: [] };
  }
}

/**
 * 解析 HTML 表格数据
 * @param htmlContent HTML 表格字符串
 * @returns 解析后的产品列表
 */
function parseHTMLTable(htmlContent: string): any {
  try {
    const root = parse(htmlContent);
    const tables = root.querySelectorAll('table');
    
    if (tables.length === 0) {
      console.log('[TextIn调试] HTML中未找到表格');
      return { products: [] };
    }
    
    console.log(`[TextIn调试] HTML中找到 ${tables.length} 个表格`);
    
    const products = [];
    
    for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
      const table = tables[tableIndex];
      const rows = table.querySelectorAll('tr');
      
      console.log(`[TextIn调试] 表格 ${tableIndex + 1} 中找到 ${rows.length} 行`);
      
      // 尝试识别表头行（通常第一行或第一列包含"序号"、"名称"等关键词）
      let headerRow = null;
      let startIndex = 0;
      
      for (let i = 0; i < Math.min(3, rows.length); i++) {
        const firstCell = rows[i].querySelector('td, th');
        if (firstCell) {
          const text = firstCell.text.trim();
          if (/序号|名称|产品|名称|型号/.test(text)) {
            headerRow = rows[i];
            startIndex = i + 1;
            console.log(`[TextIn调试] 识别表头在第 ${i + 1} 行`);
            break;
          }
        }
      }
      
      // 解析数据行
      for (let i = startIndex; i < rows.length; i++) {
        const row = rows[i];
        const cells = row.querySelectorAll('td, th');
        
        // 跳过空行或过少的行
        if (cells.length < 2) continue;
        
        // 提取单元格文本
        const cellTexts = cells.map(cell => cell.text.trim());
        console.log(`[TextIn调试] 第 ${i + 1} 行单元格内容:`, cellTexts);
        
        // 尝试智能映射字段
        const product = mapCellsToProduct(cellTexts);
        
        // 只添加有名称的产品
        if (product.name) {
          products.push(product);
          console.log(`[TextIn调试] 添加产品:`, product);
        } else {
          console.log(`[TextIn调试] 跳过无名称产品行`);
        }
      }
    }
    
    console.log(`[TextIn调试] HTML解析完成，共提取 ${products.length} 个产品`);
    return { products };
  } catch (error) {
    console.error('[TextIn错误] HTML解析失败:', error);
    return { products: [] };
  }
}

/**
 * 将单元格数组映射为产品对象（智能字段映射）
 * @param cells 单元格文本数组
 * @returns 产品对象
 */
function mapCellsToProduct(cells: string[]): any {
  // 初始化产品对象
  const product: any = {
    name: '',
    model: '',
    brand: '',
    specifications: '',
    quantity: 1,
    unit: '套',
    unit_price: 0,
    remark: ''
  };
  
  if (cells.length === 0) return product;
  
  // 策略1: 检查第一列是否为序号
  let startIndex = 0;
  if (/^\d+$/.test(cells[0]) || cells[0] === '序号') {
    startIndex = 1;
  }
  
  // 策略2: 根据列的数量进行字段映射
  const remainingCells = cells.slice(startIndex);
  
  if (remainingCells.length >= 1) {
    // 第一列通常是名称
    product.name = remainingCells[0];
  }
  
  if (remainingCells.length >= 2) {
    // 第二列可能是型号或品牌
    const secondCell = remainingCells[1];
    if (/型|规|spec|model/i.test(secondCell) || remainingCells.length === 2) {
      // 如果只有两列，或者第二列看起来像型号字段
      product.model = secondCell;
    } else {
      // 否则假设是品牌
      product.brand = secondCell;
    }
  }
  
  if (remainingCells.length >= 3) {
    // 第三列可能是品牌或型号
    const thirdCell = remainingCells[2];
    if (!product.brand && !/型|规|spec|model/i.test(thirdCell)) {
      // 如果第二列是型号，第三列可能是品牌
      product.brand = thirdCell;
    } else if (!product.model) {
      product.model = thirdCell;
    } else {
      // 已经有品牌和型号，第三列可能是规格描述
      product.specifications = thirdCell;
    }
  }
  
  if (remainingCells.length >= 4) {
    // 第四列通常是规格描述
    if (!product.specifications) {
      product.specifications = remainingCells[3];
    }
  }
  
  // 处理最后几列：数量、单位、单价、备注
  if (remainingCells.length >= 5) {
    const lastThree = remainingCells.slice(-3);
    
    // 尝试识别数量（数字）
    for (const cell of lastThree) {
      const num = parseInt(cell);
      if (!isNaN(num) && num > 0) {
        product.quantity = num;
        break;
      }
    }
    
    // 尝试识别单位（常见单位）
    const units = ['套', '台', '个', '件', '只', '台', '张', '本', '把', '支'];
    for (const cell of lastThree) {
      if (units.includes(cell)) {
        product.unit = cell;
        break;
      }
    }
    
    // 尝试识别单价（数字或带货币符号）
    for (const cell of lastThree) {
      const priceMatch = cell.match(/¥?(\d+(\.\d+)?)/);
      if (priceMatch && priceMatch[1]) {
        product.unit_price = parseFloat(priceMatch[1]);
        break;
      }
    }
  }
  
  // 将所有剩余文本合并到规格描述中
  if (remainingCells.length >= 5 && !product.specifications) {
    // 将中间几列合并为规格描述（跳过数量、单位、单价、备注）
    const middleCells = remainingCells.slice(3, -3);
    if (middleCells.length > 0) {
      product.specifications = middleCells.join(' ');
    }
  }
  
  return product;
}

// ============================================================================
// 文件上传服务
// ============================================================================

/**
 * 上传文件到 TextIn
 * @param fileBuffer 文件内容（Buffer）
 * @param fileName 文件名
 * @returns TextIn 文件ID
 */
export async function uploadFileToTextIn(fileBuffer: Buffer, fileName: string): Promise<string | null> {
  try {
    const formData = new FormData();
    // 将 Buffer 转换为 Uint8Array 以兼容 Blob
    const uint8Array = new Uint8Array(fileBuffer);
    const blob = new Blob([uint8Array], { type: 'application/pdf' });
    formData.append('file', blob, fileName);
    
    const response = await fetch('https://api.textin.com/api/v3/ocr/upload', {
      method: 'POST',
      headers: {
        'Authorization': `Bearer ${process.env.TEXTIN_API_KEY}`,
      },
      body: formData,
    });
    
    const data = await response.json();
    
    if (data.code === 200 && data.file_id) {
      return data.file_id;
    }
    
    return null;
  } catch (error) {
    console.error('文件上传到TextIn失败:', error);
    return null;
  }
}
