import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { DuplicateChecker } from '@/lib/duplicate-checker';

/**
 * 测试判重规则API
 * 用于测试当前的判重规则是否正确
 */
export async function POST(request: NextRequest) {
  console.log('[Test Duplicate API] ========== 开始测试判重规则 ==========');
  console.log('[Test Duplicate API] 时间:', new Date().toISOString());

  try {
    const body = await request.json();
    const { products, config } = body;

    console.log('[Test Duplicate API] 接收到的数据:', {
      hasProducts: !!products,
      productCount: Array.isArray(products) ? products.length : 0,
      hasConfig: !!config,
      config: config ? JSON.stringify(config, null, 2) : '未提供',
    });

    // 获取数据库实例
    const db = getSupabaseClient();

    // 创建判重检查器
    let duplicateChecker: DuplicateChecker;

    if (config) {
      duplicateChecker = new DuplicateChecker(config);
      console.log('[Test Duplicate API] 使用提供的配置');
    } else {
      // 从数据库加载配置
      try {
        const loadedConfig = await DuplicateChecker.loadFromDB(db);
        console.log('[Test Duplicate API] 从数据库加载的配置:', JSON.stringify(loadedConfig, null, 2));
        duplicateChecker = new DuplicateChecker(loadedConfig);
      } catch (error) {
        console.error('[Test Duplicate API] 加载配置失败:', error);
        return NextResponse.json(
          {
            success: false,
            error: '加载判重配置失败',
            details: error instanceof Error ? error.message : '未知错误',
          },
          { status: 500 }
        );
      }
    }

    // 如果没有提供测试产品，使用默认测试数据
    let testProducts = products;
    if (!testProducts || !Array.isArray(testProducts) || testProducts.length === 0) {
      console.log('[Test Duplicate API] 使用默认测试数据');
      testProducts = [
        { name: '测试产品A', model: '型号1', brand: '品牌X', parameter_description: '参数1', category: '分类1', supplier: '供应商1' },
        { name: '测试产品A', model: '型号1', brand: '品牌X', parameter_description: '参数2', category: '分类1', supplier: '供应商1' },
        { name: '测试产品B', model: '型号1', brand: '品牌X', parameter_description: '参数1', category: '分类1', supplier: '供应商1' },
        { name: '测试产品C', model: '型号2', brand: '品牌Y', parameter_description: '参数1', category: '分类1', supplier: '供应商1' },
      ];
    }

    console.log('[Test Duplicate API] 测试产品列表:', JSON.stringify(testProducts, null, 2));

    // 测试所有产品两两之间的重复关系
    const results = [];
    const duplicates = [];

    for (let i = 0; i < testProducts.length; i++) {
      for (let j = i + 1; j < testProducts.length; j++) {
        const productA = testProducts[i];
        const productB = testProducts[j];
        
        const isDuplicate = duplicateChecker.isDuplicate(productA, productB);
        
        if (isDuplicate) {
          const matchedFields = duplicateChecker.getMatchedFields(productA, productB);
          duplicates.push({
            productIndex1: i,
            productIndex2: j,
            product1: productA,
            product2: productB,
            matchedFields,
          });
        }

        results.push({
          product1: i,
          product2: j,
          isDuplicate,
        });
      }
    }

    console.log('[Test Duplicate API] 测试结果:', {
      totalPairs: results.length,
      duplicatePairs: duplicates.length,
      uniquePairs: results.length - duplicates.length,
    });

    // 字段名称映射
    const fieldLabelMap: Record<string, string> = {
      name: '产品名称',
      model: '规格型号',
      brand: '品牌',
      category: '分类',
      price: '指导价',
      supplier: '供应商',
      parameter_description: '参数描述',
      unit: '单位',
    };

    // 格式化重复结果
    const formattedDuplicates = duplicates.map(dup => {
      const fieldList = Object.keys(dup.matchedFields).map(field => {
        const label = fieldLabelMap[field] || field;
        const value = dup.matchedFields[field];
        return `${label}: ${value}`;
      });

      return {
        product1: {
          index: dup.productIndex1,
          name: dup.product1.name,
          model: dup.product1.model,
          brand: dup.product1.brand,
        },
        product2: {
          index: dup.productIndex2,
          name: dup.product2.name,
          model: dup.product2.model,
          brand: dup.product2.brand,
        },
        reason: fieldList.join('，'),
        matchedFields: dup.matchedFields,
      };
    });

    return NextResponse.json({
      success: true,
      message: `测试完成：共测试 ${testProducts.length} 个产品，发现 ${duplicates.length} 组重复`,
      data: {
        config: duplicateChecker.getConfig(),
        products: testProducts,
        totalPairs: results.length,
        duplicatePairs: duplicates.length,
        uniquePairs: results.length - duplicates.length,
        duplicates: formattedDuplicates,
      },
    });
  } catch (error) {
    console.error('[Test Duplicate API] ❌ 测试失败:', error);
    console.error('[Test Duplicate API] 错误堆栈:', error instanceof Error ? error.stack : error);

    return NextResponse.json(
      {
        success: false,
        error: '测试失败',
        details: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}
