import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 导入产品
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[Import API] ========== 开始产品导入 ==========');
  console.log('[Import API] 时间:', new Date().toISOString());

  try {
    const body = await request.json();
    const { products: productData, fieldMapping } = body;

    console.log('[Import API] 接收到的数据:', {
      productCount: Array.isArray(productData) ? productData.length : 0,
      hasFieldMapping: !!fieldMapping,
      fieldMapping: fieldMapping ? JSON.stringify(fieldMapping, null, 2) : '无'
    });

    if (!Array.isArray(productData)) {
      console.error('[Import API] ❌ 产品数据格式不正确，必须是数组');
      return NextResponse.json({
        success: false,
        error: '产品数据格式不正确，必须是数组',
      }, { status: 400 });
    }

    if (productData.length === 0) {
      console.error('[Import API] ❌ 产品数据为空');
      return NextResponse.json({
        success: false,
        error: '产品数据为空',
      }, { status: 400 });
    }

    console.log('[Import API] Excel 原始数据示例 (前3条):', JSON.stringify(productData.slice(0, 3), null, 2));

    let successCount = 0;
    let errorCount = 0;
    let duplicateCount = 0;
    const errors: string[] = [];
    const insertedProducts: any[] = [];
    const duplicateProducts: any[] = [];

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
      console.log('[Import API] 必填字段:', requiredFields);
    } catch (error) {
      console.error('[Import API] 获取字段配置失败，使用默认必填字段:', error);
    }

    console.log('[Import API] ========== 开始处理产品数据 ==========');

    // 批量插入产品
    for (let i = 0; i < productData.length; i++) {
      const item = productData[i];
      console.log(`[Import API] ========== 处理第 ${i + 1}/${productData.length} 条数据 ==========`);

      try {
        let product: Record<string, any>;

        // 如果提供了字段映射，使用映射转换数据
        if (fieldMapping && typeof fieldMapping === 'object') {
          console.log('[Import API] 使用自定义字段映射:', JSON.stringify(fieldMapping, null, 2));
          product = {};
          Object.keys(fieldMapping).forEach(systemField => {
            const excelHeader = fieldMapping[systemField];
            if (excelHeader && item[excelHeader] !== undefined) {
              product[systemField] = item[excelHeader];
              console.log(`[Import API]   ${excelHeader} -> ${systemField}:`, product[systemField]);
            }
          });
        } else {
          console.log('[Import API] 使用默认字段映射');
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
          console.log('[Import API] 默认映射结果:', product);
        }

        // 验证必填字段
        const missingFields = requiredFields.filter(field => !product[field] || product[field] === '' || product[field] === 0);
        if (missingFields.length > 0) {
          const errorMsg = `产品 "${product.product_name || '未知'}" 缺少必填字段: ${missingFields.join('、')}`;
          console.error(`[Import API] ❌ ${errorMsg}`);
          console.error('[Import API] 产品数据:', JSON.stringify(product, null, 2));
          errorCount++;
          errors.push(errorMsg);
          continue;
        }

        // 验证价格
        if (product.price <= 0) {
          const errorMsg = `产品 "${product.product_name || '未知'}" 价格必须大于0`;
          console.error(`[Import API] ❌ ${errorMsg}`);
          errorCount++;
          errors.push(errorMsg);
          continue;
        }

        console.log('[Import API] ✅ 字段验证通过');

        // 构造数据库记录（根据实际数据库表结构）
        const dbProduct: any = {
          name: product.product_name || '',
          model: product.model || '',
          specifications: product.specifications || '',
          price: product.price || 0,
          unit: product.unit || '',
          brand: product.brand || '',
          category: item['分类'] || item['category'] || '',
          // 其他可选字段
          keywords: null,
          verified: false,
          metadata: {},
        };

        console.log('[Import API] 构造的数据库记录:', JSON.stringify(dbProduct, null, 2));

        // 查重检查：根据名称和型号判断是否存在
        console.log(`[Import API] 查重检查: name="${dbProduct.name}", model="${dbProduct.model}"`);
        
        // 只根据 name 和 model 查重，因为数据库可能没有 supplier 字段
        const { data: existingProduct, error: checkError } = await db
          .from('products')
          .select('id, name, model, price')
          .eq('name', dbProduct.name)
          .eq('model', dbProduct.model || '')
          .maybeSingle();

        if (checkError) {
          console.error('[Import API] ❌ 查重检查失败:', checkError);
          errorCount++;
          errors.push(`查重检查失败 "${dbProduct.name}": ${checkError.message}`);
          continue;
        }

        // 如果已存在相同产品，跳过插入
        if (existingProduct) {
          const duplicateMsg = `重复产品（已存在）: ${dbProduct.name} | 型号: ${dbProduct.model || '-''} | 价格: ¥${existingProduct.price}`;
          console.log(`[Import API] ⚠️ ${duplicateMsg}`);
          console.log('[Import API] 已存在产品:', JSON.stringify(existingProduct, null, 2));
          duplicateCount++;
          duplicateProducts.push({
            existing: existingProduct,
            attempted: dbProduct
          });
          errors.push(duplicateMsg);
          continue;
        }

        console.log('[Import API] ✅ 查重通过，准备插入数据库');

        // 插入数据库
        const { data: insertedData, error: insertError } = await db.from('products').insert(dbProduct).select();

        if (insertError) {
          console.error('[Import API] ❌ 插入失败:', insertError);
          console.error('[Import API] 错误详情:', JSON.stringify(insertError, null, 2));
          errorCount++;
          errors.push(`插入失败 "${dbProduct.name}": ${insertError.message}`);
        } else {
          console.log('[Import API] ✅ 插入成功:', JSON.stringify(insertedData, null, 2));
          successCount++;
          insertedProducts.push(insertedData?.[0]);
        }
      } catch (error) {
        const errorMsg = `处理失败: ${error instanceof Error ? error.message : '未知错误'}`;
        console.error('[Import API] ❌', errorMsg);
        console.error('[Import API] 错误堆栈:', error instanceof Error ? error.stack : error);
        errorCount++;
        errors.push(errorMsg);
      }
    }

    const duration = Date.now() - startTime;
    console.log('[Import API] ========== 导入完成 ==========');
    console.log('[Import API] 总耗时:', `${duration}ms`);
    console.log('[Import API] 成功:', successCount, '条');
    console.log('[Import API] 失败:', errorCount, '条');
    console.log('[Import API] 重复:', duplicateCount, '条');

    // 导入后验证：查询实际数据库中的产品数量
    console.log('[Import API] ========== 导入后验证 ==========');
    try {
      const { data: allProducts, error: verifyError } = await db
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!verifyError && allProducts) {
        console.log('[Import API] ✅ 验证成功，数据库中总产品数:', allProducts.length);
        
        // 统计本次导入的产品
        const recentProducts = allProducts.filter(p => {
          if (p.created_at) {
            const productTime = new Date(p.created_at).getTime();
            return productTime >= startTime;
          }
          return false;
        });
        
        console.log('[Import API] 本次导入新增产品数:', recentProducts.length);
        recentProducts.forEach(p => {
          console.log(`  - ID: ${p.id}, 名称: ${p.name}, 型号: ${p.model}, 价格: ${p.price}`);
        });
      }
    } catch (error) {
      console.error('[Import API] 验证查询失败:', error);
    }

    return NextResponse.json({
      success: true,
      message: `成功导入 ${successCount} 条产品数据${duplicateCount > 0 ? `，跳过 ${duplicateCount} 条重复产品` : ''}${errorCount > 0 ? `，${errorCount} 条失败` : ''}`,
      successCount,
      errorCount,
      duplicateCount,
      errors,
      insertedProducts,
      duplicateProducts,
      duration
    });
  } catch (error) {
    console.error('[Import API] ❌ 导入产品失败:', error);
    console.error('[Import API] 错误堆栈:', error instanceof Error ? error.stack : error);
    return NextResponse.json({
      success: false,
      error: '导入产品失败',
      details: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}
