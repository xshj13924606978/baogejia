// src/app/api/documents/parse/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getServerSession } from 'next-auth';
import { authOptions } from '@/lib/auth';
import { getCozeResponse, getTextInTableResponse, uploadFileToTextIn } from '@/lib/ai-service';
import { cleanParameterDescriptionEnhanced } from '@/utils/string-cleaner-enhanced';

/**
 * 统一处理产品字段，确保字段名正确
 * 包含参数描述清洗，移除重复的规格参数和功率信息
 */
function normalizeProducts(products: any[]): any[] {
  if (!Array.isArray(products)) return products;
  
  console.log(`[字段映射] 开始处理 ${products.length} 个产品`);
  
  return products.map((p, index) => {
    // 打印原始字段（调试用）
    console.log(`[字段映射] 产品 ${index + 1} 原始字段:`, JSON.stringify(p, null, 2));
    
    // 获取原始参数描述
    const rawDescription = p.parameter_description || p.specs || p.specifications || p.description || p.parameters || '';
    
    // 使用增强版清洗函数处理参数描述（移除重复规格、重复功率等）
    const cleanResult = cleanParameterDescriptionEnhanced(rawDescription);
    const cleanedDescription = cleanResult.cleaned;
    
    // 记录清洗结果
    if (cleanResult.statistics.removedChars > 0) {
      console.log(`[参数清洗] 产品 ${index + 1} 清洗统计:`);
      console.log(`  - 原始长度: ${cleanResult.statistics.originalLength}`);
      console.log(`  - 清洗后长度: ${cleanResult.statistics.cleanedLength}`);
      console.log(`  - 减少字符: ${cleanResult.statistics.removedChars}`);
      if (cleanResult.removedItems.length > 0) {
        console.log(`  - 清洗项: ${cleanResult.removedItems.join(', ')}`);
      }
    }
    
    const normalized = {
      name: p.name || p.product_name || '',
      model: p.model || p.spec || '',
      brand: p.brand || '',
      // 统一字段名：优先使用 parameter_description，兼容各种旧字段，并进行清洗
      parameter_description: cleanedDescription,
      quantity: p.quantity || 1,
      unit: p.unit || '套',
      unit_price: p.unit_price || p.price || 0,
      remark: p.remark || ''
    };
    
    // 打印映射后的字段
    console.log(`[字段映射] 产品 ${index + 1} 映射后:`, JSON.stringify(normalized, null, 2));
    
    return normalized;
  });
}

/**
 * 根据name, model, parameter_description对产品列表进行去重
 */
function deduplicateProducts(products: any[]): any[] {
  if (!Array.isArray(products)) return products;

  const seen = new Map<string, boolean>();
  const uniqueProducts: any[] = [];

  for (const product of products) {
    // 构建唯一键：使用 name, model 和 parameter_description
    const key = `${product.name || ''}-${product.model || ''}-${product.parameter_description || ''}`.trim();

    if (!seen.has(key)) {
      seen.set(key, true);
      uniqueProducts.push(product);
    }
  }

  // 记录去重信息
  if (products.length !== uniqueProducts.length) {
    console.log(`[去重] 原始产品数: ${products.length}, 去重后: ${uniqueProducts.length}`);
  }

  return uniqueProducts;
}

export async function POST(request: NextRequest) {
  try {
    const session = await getServerSession(authOptions);
    if (!session?.user) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const parseType = formData.get('parseType') as string || 'auto';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 将File对象转换为Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 上传文件到TextIn
    const textInFileId = await uploadFileToTextIn(buffer, file.name);
    if (!textInFileId) {
      return NextResponse.json({ error: 'Failed to upload file to TextIn' }, { status: 500 });
    }

    let result;

    // 根据解析类型选择不同的解析策略
    if (parseType === 'auto') {
      // 先尝试TextIn表格解析
      try {
        const textInResult = await getTextInTableResponse(textInFileId);
        if (textInResult && textInResult.products && textInResult.products.length > 0) {
          result = textInResult;
        } else {
          // TextIn未解析出内容，使用Coze Vision
          throw new Error('TextIn returned empty result');
        }
      } catch (textInError) {
        console.log('TextIn parsing failed, falling back to Coze Vision:', textInError);
        const cozeResult = await getCozeResponse(textInFileId);
        result = cozeResult;
      }
    } else if (parseType === 'textin') {
      // 强制使用TextIn
      result = await getTextInTableResponse(textInFileId);
    } else {
      // 强制使用Coze
      result = await getCozeResponse(textInFileId);
    }

    // ==================== 统一处理返回数据 ====================
    if (result && result.products && Array.isArray(result.products)) {
      console.log(`[数据处理] 开始处理 ${result.products.length} 个产品`);
      
      // 1. 先统一字段名
      result.products = normalizeProducts(result.products);
      console.log(`[数据处理] 字段映射完成`);
      
      // 2. 再去重
      result.products = deduplicateProducts(result.products);
      console.log(`[数据处理] 去重完成，最终产品数: ${result.products.length}`);
      
      // 打印最终结果
      console.log(`[数据处理] 最终产品列表:`, JSON.stringify(result.products, null, 2));
    }
    // ========================================================

    return NextResponse.json(result);
  } catch (error) {
    console.error('Document parse error:', error);
    return NextResponse.json(
      { error: 'Failed to parse document' },
      { status: 500 }
    );
  }
}
