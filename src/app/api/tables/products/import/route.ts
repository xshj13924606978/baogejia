import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 导入产品
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { products: productData, fieldMapping } = body;

    if (!Array.isArray(productData)) {
      return NextResponse.json({
        success: false,
        error: '产品数据格式不正确，必须是数组',
      }, { status: 400 });
    }

    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    const errors: string[] = [];

    const db = getSupabaseClient();

    // 从字段配置表获取必填字段
    let requiredFields: string[] = ['product_name', 'price']; // 默认必填字段
    try {
      const { data: fieldConfigs } = await db
        .from('product_field_configs')
        .select('field_key')
        .eq('is_required', true);

      if (fieldConfigs && fieldConfigs.length > 0) {
        requiredFields = fieldConfigs.map(c => c.field_key);
      }
    } catch (error) {
      console.error('获取字段配置失败，使用默认必填字段:', error);
    }

    // 批量插入产品
    for (const item of productData) {
      try {
        let product: Record<string, any>;

        // 如果提供了字段映射，使用映射转换数据
        if (fieldMapping && typeof fieldMapping === 'object') {
          product = {};
          Object.keys(fieldMapping).forEach(systemField => {
            const excelHeader = fieldMapping[systemField];
            if (excelHeader && item[excelHeader] !== undefined) {
              product[systemField] = item[excelHeader];
            }
          });
        } else {
          // 使用默认映射
          product = {
            product_name: item['产品名称'] || item['product_name'] || item['name'] || '',
            model: item['型号'] || item['model'] || '',
            brand: item['品牌'] || item['brand'] || '',
            specifications: item['规格'] || item['specifications'] || item['参数描述'] || item['description'] || '',
            supplier: item['供应商'] || item['supplier'] || '',
            contact_person: item['联系人'] || item['contact_person'] || '',
            contact_phone: item['联系电话'] || item['contact_phone'] || item['电话'] || '',
            unit: item['单位'] || item['unit'] || '',
            cost_price: parseFloat(item['成本'] || item['cost_price'] || '0') || 0,
            min_price: parseFloat(item['最低售价'] || item['min_price'] || '0') || 0,
            price: parseFloat(item['指导价'] || item['价格'] || item['price'] || '0') || 0,
          };
        }

        // 验证必填字段
        const missingFields = requiredFields.filter(field => !product[field] || product[field] === '' || product[field] === 0);
        if (missingFields.length > 0) {
          errorCount++;
          errors.push(`产品 "${product.product_name || '未知'}" 缺少必填字段: ${missingFields.join('、')}`);
          continue;
        }

        // 验证价格
        if (product.price <= 0) {
          errorCount++;
          errors.push(`产品 "${product.product_name || '未知'}" 价格必须大于0`);
          continue;
        }

        // 构造数据库记录
        const dbProduct = {
          name: product.product_name || '',
          model: product.model || '',
          specifications: product.specifications || '',
          price: product.price || 0,
          stock: parseInt(item['库存'] || item['stock'] || '0') || 0,
          supplier: product.supplier || '',
          category: item['分类'] || item['category'] || '',
          // 将specifications和额外字段都存储到description字段（JSON格式）
          description: JSON.stringify({
            specifications: product.specifications || '',
            brand: product.brand || '',
            contact_person: product.contact_person || '',
            contact_phone: product.contact_phone || '',
            unit: product.unit || '',
            cost_price: product.cost_price || 0,
            min_price: product.min_price || 0,
          }),
        };

        // 查重检查：根据名称、型号、供应商判断是否存在
        const { data: existingProduct } = await db
          .from('products')
          .select('id')
          .eq('name', dbProduct.name)
          .eq('model', dbProduct.model || '')
          .eq('supplier', dbProduct.supplier || '')
          .maybeSingle();

        // 如果已存在相同产品，跳过插入
        if (existingProduct) {
          duplicateCount++;
          errors.push(`重复产品（已存在）: ${dbProduct.name} | 型号: ${dbProduct.model || '-'} | 供应商: ${dbProduct.supplier || '-'}`);
          continue;
        }

        // 插入数据库
        const { error: insertError } = await db.from('products').insert(dbProduct);

        if (insertError) {
          errorCount++;
          errors.push(`插入失败 "${dbProduct.name}": ${insertError.message}`);
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
      message: `成功导入 ${successCount} 条产品数据${duplicateCount > 0 ? `，跳过 ${duplicateCount} 条重复产品` : ''}`,
      successCount,
      errorCount,
      duplicateCount,
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
