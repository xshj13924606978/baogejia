// src/app/api/documents/parse/route.ts
import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { getCozeResponse, getTextInTableResponse, uploadFileToTextIn } from '@/lib/ai-service';
import { cleanParameterDescriptionEnhanced } from '@/utils/string-cleaner-enhanced';
import { pointsService } from '@/lib/points-service';

// 文档解析积分消耗常量
const BASE_PARSE_POINTS = 5; // 基础解析消耗 5 积分
const POINTS_PER_100KB = 2; // 每100KB额外消耗 2 积分
const POINTS_PER_PRODUCT = 0.5; // 每个产品额外消耗 0.5 积分

/**
 * 统一处理产品字段，确保字段名正确
 * 包含参数描述清洗，移除重复的规格参数和功率信息
 */
function normalizeProducts(products: any[]): any[] {
  if (!Array.isArray(products)) return products;
  
  
  return products.map((p, index) => {
    // 打印原始字段（调试用）
    
    // 获取原始参数描述
    const rawDescription = p.parameter_description || p.specs || p.specifications || p.description || p.parameters || '';
    
    // 使用增强版清洗函数处理参数描述（移除重复规格、重复功率等）
    const cleanResult = cleanParameterDescriptionEnhanced(rawDescription);
    const cleanedDescription = cleanResult.cleaned;
    
    // 记录清洗结果
    if (cleanResult.statistics.removedChars > 0) {
      if (cleanResult.removedItems.length > 0) {
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
    const key = `${product.name || ''}-${product.model || ''}${product.parameter_description || ''}`.trim();

    if (!seen.has(key)) {
      seen.set(key, true);
      uniqueProducts.push(product);
    }
  }

  // 记录去重信息
  if (products.length !== uniqueProducts.length) {
  }

  return uniqueProducts;
}

/**
 * 计算文档解析所需积分
 * @param fileSize 文件大小（字节）
 * @param productCount 产品数量
 */
function calculateParsePoints(fileSize: number, productCount: number = 0): number {
  let points = BASE_PARSE_POINTS;
  
  // 根据文件大小额外计算
  const fileSizeKB = fileSize / 1024;
  const extraPointsForSize = Math.floor(fileSizeKB / 100) * POINTS_PER_100KB;
  points += extraPointsForSize;
  
  // 根据产品数量额外计算
  const extraPointsForProducts = Math.ceil(productCount * POINTS_PER_PRODUCT);
  points += extraPointsForProducts;
  
  return Math.max(points, BASE_PARSE_POINTS);
}

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const userId = currentUser.id;
    const formData = await request.formData();
    const file = formData.get('file') as File | null;
    const parseType = formData.get('parseType') as string || 'auto';

    if (!file) {
      return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    }

    // 计算预估积分消耗（先按文件大小估算）
    const estimatedPoints = calculateParsePoints(file.size);
    
    // 积分预检查
    const hasEnough = await pointsService.checkPointsBalance(userId, estimatedPoints);
    if (!hasEnough) {
      const pointsInfo = await pointsService.getUserPoints(userId);
      return NextResponse.json(
        {
          error: '积分不足',
          message: `解析此文档预估需要 ${estimatedPoints} 积分，当前余额不足`,
          required: estimatedPoints,
          balance: pointsInfo?.points
        },
        { status: 402 }
      );
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
      
      // 1. 先统一字段名
      result.products = normalizeProducts(result.products);
      
      // 2. 再去重
      result.products = deduplicateProducts(result.products);
      
      // 打印最终结果
    }
    // ========================================================
    
    // 计算实际积分消耗（根据产品数量重新计算）
    const productCount = result?.products?.length || 0;
    const actualPoints = calculateParsePoints(file.size, productCount);
    
    // 扣除积分
    try {
      const deductResult = await pointsService.deductPoints(
        userId,
        actualPoints,
        'parse_document',
        `文档解析: ${file.name} (${productCount}个产品)`
      );
      
      if (deductResult.success) {
        
        // 获取更新后的积分
        const newPointsInfo = await pointsService.getUserPoints(userId);
        
        // 在结果中添加积分信息
        return NextResponse.json({
          ...result,
          pointsConsumed: actualPoints,
          newBalance: newPointsInfo?.points || 0
        });
      } else {
        console.error('[文档解析] 扣除积分失败:', deductResult.reason);
      }
    } catch (error) {
      console.error('[文档解析] 扣除积分异常:', error);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Document parse error:', error);
    return NextResponse.json(
      { error: 'Failed to parse document' },
      { status: 500 }
    );
  }
}
