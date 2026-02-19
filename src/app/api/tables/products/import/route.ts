import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 导入产品
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { products: productData } = body;

    if (!Array.isArray(productData)) {
      return NextResponse.json({
        success: false,
        error: '产品数据格式不正确，必须是数组',
      }, { status: 400 });
    }

    let successCount = 0;
    let errorCount = 0;
    const errors: string[] = [];

    const db = getSupabaseClient();

    // 批量插入产品
    for (const item of productData) {
      try {
        // 映射Excel列名到数据库字段
        const product = {
          name: item['产品名称'] || item['product_name'] || item['name'] || '',
          model: item['型号'] || item['model'] || '',
          specifications: item['规格'] || item['specifications'] || item['description'] || '',
          price: parseFloat(item['价格'] || item['price'] || '0') || 0,
          stock: parseInt(item['库存'] || item['stock'] || '0') || 0,
          supplier: item['供应商'] || item['supplier'] || item['brand'] || '',
          category: item['分类'] || item['category'] || '',
          description: item['描述'] || item['description'] || '',
        };

        // 验证必填字段
        if (!product.name || product.price <= 0) {
          errorCount++;
          errors.push(`产品 "${product.name || '未知'}" 缺少名称或价格`);
          continue;
        }

        // 插入数据库
        const { error: insertError } = await db.from('products').insert(product);

        if (insertError) {
          errorCount++;
          errors.push(`插入失败 "${product.name}": ${insertError.message}`);
        } else {
          successCount++;
        }
      } catch (error) {
        errorCount++;
        errors.push(`导入失败: ${error instanceof Error ? error.message : '未知错误'}`);
      }
    }

    return NextResponse.json({
      success: true,
      message: `成功导入 ${successCount} 条产品数据`,
      successCount,
      errorCount,
      errors,
    });
  } catch (error) {
    console.error('导入产品失败:', error);
    return NextResponse.json({
      success: false,
      error: '导入产品失败',
    }, { status: 500 });
  }
}
