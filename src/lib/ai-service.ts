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

    if (!response.ok) {
      console.error('[Coze] API请求失败:', response.status, response.statusText);
      return { products: [] };
    }

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

    if (!response.ok) {
      console.error('[TextIn] API请求失败:', response.status, response.statusText);
      return { products: [] };
    }

    const data = await response.json();
    
    
    // 情况1: 如果返回的是 HTML 格式的表格数据
    if (data && (data.html || data.result?.html || data.result?.tables?.[0]?.html)) {
      const htmlContent = data.html || data.result?.html || data.result?.tables?.[0]?.html;
      
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
      
      return { products };
    }
    
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
      return { products: [] };
    }
    
    
    const products = [];
    
    for (let tableIndex = 0; tableIndex < tables.length; tableIndex++) {
      const table = tables[tableIndex];
      const rows = table.querySelectorAll('tr');
      
      
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
        
        // 尝试智能映射字段
        const product = mapCellsToProduct(cellTexts);
        
        // 只添加有名称的产品
        if (product.name) {
          products.push(product);
        } else {
        }
      }
    }
    
    return { products };
  } catch (error) {
    console.error('[TextIn错误] HTML解析失败:', error);
    return { products: [] };
  }
}

/**
 * 将单元格数组映射为产品对象（智能字段映射）
 * 改进版：更智能地识别参数描述列
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
  const cellCount = remainingCells.length;
  
  
  // 根据列数智能映射
  if (cellCount === 1) {
    // 只有一列：作为名称
    product.name = remainingCells[0];
  } else if (cellCount === 2) {
    // 两列：名称 + 参数描述
    product.name = remainingCells[0];
    product.specifications = remainingCells[1];
  } else if (cellCount === 3) {
    // 三列：名称 + 参数描述 + 数量/单位
    product.name = remainingCells[0];
    product.specifications = remainingCells[1];
    // 最后一列尝试解析数量和单位
    parseQuantityAndUnit(remainingCells[2], product);
  } else if (cellCount === 4) {
    // 四列：名称 + 品牌 + 参数描述 + 数量单位
    product.name = remainingCells[0];
    product.brand = remainingCells[1];
    product.specifications = remainingCells[2];
    parseQuantityAndUnit(remainingCells[3], product);
  } else if (cellCount === 5) {
    // 五列：名称 + 品牌 + 参数描述 + 数量 + 单位
    product.name = remainingCells[0];
    product.brand = remainingCells[1];
    product.specifications = remainingCells[2];
    product.quantity = parseInt(remainingCells[3]) || 1;
    product.unit = remainingCells[4] || '套';
  } else if (cellCount === 6) {
    // 六列：名称 + 品牌 + 参数描述 + 数量 + 单位 + 单价
    product.name = remainingCells[0];
    product.brand = remainingCells[1];
    product.specifications = remainingCells[2];
    product.quantity = parseInt(remainingCells[3]) || 1;
    product.unit = remainingCells[4] || '套';
    product.unit_price = parsePrice(remainingCells[5]);
  } else if (cellCount >= 7) {
    // 七列及以上：名称 + 型号 + 品牌 + 参数描述 + 数量 + 单位 + 单价 + ...
    product.name = remainingCells[0];
    product.model = remainingCells[1];
    product.brand = remainingCells[2];
    // 参数描述可能是多列合并
    product.specifications = remainingCells[3];
    // 如果有额外的中间列，合并到参数描述中
    if (cellCount > 7) {
      const extraSpecs = remainingCells.slice(4, cellCount - 3);
      if (extraSpecs.length > 0) {
        product.specifications = [product.specifications, ...extraSpecs].filter(s => s).join('；');
      }
    }
    // 最后三列通常是数量、单位、单价
    product.quantity = parseInt(remainingCells[cellCount - 3]) || 1;
    product.unit = remainingCells[cellCount - 2] || '套';
    product.unit_price = parsePrice(remainingCells[cellCount - 1]);
  }
  
  // 智能识别品牌信息（如果品牌字段为空但参数描述中包含品牌）
  if (!product.brand && product.specifications) {
    const brands = ['佳木斯', '宁波动力', '哈瓦洛', '西门子', 'ABB', '施耐德', '三菱', '松下'];
    for (const brand of brands) {
      if (product.specifications.includes(brand)) {
        product.brand = brand;
        break;
      }
    }
  }
  
  // 智能识别型号信息（如果型号字段为空但参数描述中包含型号）
  if (!product.model && product.specifications) {
    // 匹配常见型号模式
    const modelPatterns = [
      /型号[：:]\s*([A-Za-z0-9\-]+)/i,
      /([A-Z]{2,3}[\-\d]+)/,
      /(DN\d+)/i,
    ];
    for (const pattern of modelPatterns) {
      const match = product.specifications.match(pattern);
      if (match) {
        product.model = match[1] || match[0];
        break;
      }
    }
  }
  
  
  return product;
}

/**
 * 解析数量和单位
 */
function parseQuantityAndUnit(text: string, product: any): void {
  // 尝试匹配 "3套" 或 "3 台" 格式
  const match = text.match(/^(\d+)\s*(套|台|个|件|只|张|本|把|支|吨|米|kg)$/);
  if (match) {
    product.quantity = parseInt(match[1]) || 1;
    product.unit = match[2];
  } else {
    // 尝试单独解析数字或单位
    const num = parseInt(text);
    if (!isNaN(num) && num > 0) {
      product.quantity = num;
    }
    const units = ['套', '台', '个', '件', '只', '张', '本', '把', '支', '吨', '米', 'kg'];
    if (units.includes(text)) {
      product.unit = text;
    }
  }
}

/**
 * 解析价格
 */
function parsePrice(text: string): number {
  if (!text) return 0;
  // 移除货币符号和千分位逗号
  const cleaned = text.replace(/[¥$€,，]/g, '');
  const price = parseFloat(cleaned);
  return isNaN(price) ? 0 : price;
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

    if (!response.ok) {
      console.error('[TextIn] 文件上传失败:', response.status, response.statusText);
      return null;
    }

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
