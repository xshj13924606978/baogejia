import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { createDuplicateChecker, DuplicateChecker } from '@/lib/duplicate-checker';
import { matchCategory } from '@/lib/category-matcher';

// 单位标准化：修复 XLSX 解析可能导致的上标字符丢失问题
function normalizeUnit(unit: any): string {
  if (!unit || typeof unit !== 'string') return String(unit || '');
  let normalized = unit.trim();
  // 修复 XLSX 解析时 m³ 上标 ³ 被丢失为 3 或被截断为 m 的问题
  // Excel 中 m³ 可能有多种存储形式
  normalized = normalized.replace(/^m3$/i, 'm³');
  normalized = normalized.replace(/^m2$/i, 'm²');
  normalized = normalized.replace(/^m1$/i, 'm');
  normalized = normalized.replace(/^cm3$/i, 'cm³');
  normalized = normalized.replace(/^cm2$/i, 'cm²');
  normalized = normalized.replace(/^mm3$/i, 'mm³');
  normalized = normalized.replace(/^mm2$/i, 'mm²');
  normalized = normalized.replace(/^km3$/i, 'km³');
  normalized = normalized.replace(/^km2$/i, 'km²');
  normalized = normalized.replace(/^L$/i, 'L');
  normalized = normalized.replace(/^KG$/i, 'kg');
  normalized = normalized.replace(/^KW$/i, 'kW');
  return normalized;
}

// 字段映射：从系统字段名映射到数据库字段名
// 统一产品字段规范（13个标准字段）
const FIELD_TO_DB_MAP: Record<string, string> = {
  // 标准字段
  category: 'category',
  name: 'name',
  model: 'model',
  parameter_description: 'parameter_description',
  brand: 'brand',
  unit: 'unit',
  supplier: 'supplier',
  contact_person: 'contact_person',
  contact_phone: 'contact_phone',
  cost_price: 'cost_price',
  min_price: 'min_price',
  price: 'price',
  image_url: 'image_url',
  // 兼容旧字段名
  product_name: 'name',
  specifications: 'parameter_description',
  // 系统字段
  stock: 'stock',
};

// 导入产品
export async function POST(request: NextRequest) {
  const startTime = Date.now();

  try {
    const body = await request.json();
    const { products: productData, fieldMapping } = body;


    if (!Array.isArray(productData)) {
      console.error('[Import API] ❌ 产品数据格式不正确，必须是数组');
      return NextResponse.json(
        { success: false, error: '产品数据格式不正确，必须是数组' },
        { status: 400 }
      );
    }

    if (productData.length === 0) {
      console.error('[Import API] ❌ 产品数据为空');
      return NextResponse.json(
        { success: false, error: '产品数据为空' },
        { status: 400 }
      );
    }


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
        requiredFields = fieldConfigs.map((c) => c.field_key);
      }
    } catch (error) {
      console.error('[Import API] 获取字段配置失败，使用默认必填字段:', error);
    }

    // 初始化判重检查器
    let duplicateChecker: DuplicateChecker;
    try {
      duplicateChecker = await createDuplicateChecker(db);
      const config = duplicateChecker.getConfig();
    } catch (error) {
      console.error('[Import API] 初始化判重检查器失败，使用默认配置:', error);
      duplicateChecker = new DuplicateChecker({ fields: ['name', 'model'], matchRule: 'and' }, db);
    }


    // 批量插入产品
    for (let i = 0; i < productData.length; i++) {
      const item = productData[i];

      try {
        let product: Record<string, any>;

        // 如果提供了字段映射，使用映射转换数据
        if (fieldMapping && typeof fieldMapping === 'object' && Object.keys(fieldMapping).length > 0) {
          product = {};
          Object.keys(fieldMapping).forEach((systemField) => {
            const excelHeader = fieldMapping[systemField];
            if (excelHeader && item[excelHeader] !== undefined) {
              // 处理字段名映射：name -> product_name（兼容前端映射）
              if (systemField === 'name') {
                product['product_name'] = item[excelHeader];
              } else if (systemField === 'parameter_description') {
                product['specifications'] = item[excelHeader];
              } else if (systemField === 'unit') {
                product['unit'] = normalizeUnit(item[excelHeader]);
              } else {
                product[systemField] = item[excelHeader];
              }
            }
          });
        } else {
          // 使用默认映射
          product = {
            product_name: item['产品名称'] || item['product_name'] || item['name'] || '',
            model: item['规格型号'] || item['型号'] || item['model'] || '',
            brand: item['品牌'] || item['brand'] || '',
            parameter_description: item['参数描述'] || item['parameter_description'] || '',
            description: item['描述'] || item['description'] || '',
            supplier: item['供应商'] || item['supplier'] || '',
            contact_person: item['联系人'] || item['contact_person'] || '',
            contact_phone: item['联系电话'] || item['电话'] || item['contact_phone'] || '',
            unit: normalizeUnit(item['单位'] || item['unit'] || ''),
            cost_price:
              parseFloat(item['成本'] || item['成本价(元)'] || item['cost_price'] || '0') || 0,
            min_price:
              parseFloat(item['最低售价'] || item['最低售价(元)'] || item['min_price'] || '0') || 0,
            price: parseFloat(item['指导价'] || item['价格'] || item['price'] || '0') || 0,
            stock: parseInt(item['库存'] || item['stock'] || '0') || 0,
            category: item['分类'] || item['category'] || '',
            image_url: item['图片'] || item['image_url'] || '',
          };
        }


        // 验证必填字段 - 兼容 name 和 product_name
        const missingFields = requiredFields.filter(
          (field) => {
            if (field === 'product_name' || field === 'name') {
              return !product.product_name && !product.name;
            }
            return !product[field] || product[field] === '' || product[field] === 0;
          }
        );
        if (missingFields.length > 0) {
          const errorMsg = `产品 "${product.product_name || product.name || '未知'}" 缺少必填字段: ${missingFields.join('、')}`;
          console.error(`[Import API] ❌ ${errorMsg}`);
          console.error('[Import API] 产品数据:', JSON.stringify(product, null, 2));
          errorCount++;
          errors.push(errorMsg);
          continue;
        }

        // 验证价格
        if (product.price <= 0) {
          const errorMsg = `产品 "${product.product_name || product.name || '未知'}" 价格必须大于0`;
          console.error(`[Import API] ❌ ${errorMsg}`);
          errorCount++;
          errors.push(errorMsg);
          continue;
        }


        // 构造数据库记录（统一产品字段规范）
        const dbProduct: any = {
          // 13个标准字段
          category: product.category || '',
          name: product.name || product.product_name || '',
          model: product.model || '',
          parameter_description: product.parameter_description || product.specifications || '',
          brand: product.brand || '',
          unit: normalizeUnit(product.unit || '台'),
          supplier: product.supplier || '',
          contact_person: product.contact_person || '',
          contact_phone: product.contact_phone || '',
          cost_price: product.cost_price || 0,
          min_price: product.min_price || 0,
          price: product.price || 0,
          image_url: product.image_url || '',
          // 系统字段
          stock: product.stock || 0,
        };

        // 移除空值字段，避免数据库约束错误
        Object.keys(dbProduct).forEach(key => {
          if (dbProduct[key] === '' || dbProduct[key] === null || dbProduct[key] === undefined) {
            delete dbProduct[key];
          }
        });


        // 智能分类匹配 - 如果没有提供分类则尝试智能匹配
        if (!dbProduct.category) {
          const matchedCategory = matchCategory(
            dbProduct.name,
            dbProduct.parameter_description || ''
          );
          if (matchedCategory) {
            dbProduct.category = matchedCategory;
          } else {
          }
        }


        // 使用判重检查器进行查重
        const checkResult = await duplicateChecker.checkDuplicate(dbProduct);

        // 如果已存在相同产品，跳过插入
        if (checkResult.isDuplicate) {
          const duplicateMsg = DuplicateChecker.formatResult(checkResult);
          duplicateCount++;
          duplicateProducts.push({
            existing: checkResult.duplicateProduct,
            attempted: dbProduct,
          });
          errors.push(duplicateMsg);
          continue;
        }


        // 插入数据库
        const { data: insertedData, error: insertError } = await db
          .from('products')
          .insert(dbProduct)
          .select();

        if (insertError) {
          console.error('[Import API] ❌ 插入失败:', insertError);
          console.error('[Import API] 错误详情:', JSON.stringify(insertError, null, 2));
          errorCount++;
          errors.push(`插入失败 "${dbProduct.name}": ${insertError.message}`);
        } else {
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

    // 导入后验证：查询实际数据库中的产品数量
    try {
      const { data: allProducts, error: verifyError } = await db
        .from('products')
        .select('*')
        .order('created_at', { ascending: false })
        .limit(100);

      if (!verifyError && allProducts) {

        // 统计本次导入的产品
        const recentProducts = allProducts.filter((p) => {
          if (p.created_at) {
            const productTime = new Date(p.created_at).getTime();
            return productTime >= startTime;
          }
          return false;
        });

        recentProducts.forEach((p) => {
        });
      }
    } catch (error) {
      console.error('[Import API] 验证查询失败:', error);
    }

    // 记录导入日志
    try {
      const duplicateConfig = duplicateChecker.getConfig();

      await db.from('import_logs').insert({
        file_name: body.file_name || 'unknown',
        file_type: body.file_type || 'unknown',
        total_count: productData.length,
        imported_count: successCount,
        skipped_count: duplicateCount,
        failed_count: errorCount,
        duplicate_config: duplicateConfig,
        details: {
          errors: errors.length > 0 ? errors : undefined,
          duplicateProducts: duplicateCount > 0 ? duplicateProducts : undefined,
        },
        duration_ms: duration,
        status: 'completed',
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
      });

    } catch (logError) {
      console.error('[Import API] ⚠️ 记录导入日志失败:', logError);
      // 不影响主流程，仅记录错误
    }

    return NextResponse.json({
      success: true,
      message: `成功导入 ${successCount} 条产品数据${duplicateCount > 0 ? `，跳过 ${duplicateCount} 条重复产品` : ''}${errorCount > 0 ? `，${errorCount} 条失败` : ''}`,
      successCount,
      errorCount,
      duplicateCount,
      errors: errors.length > 0 ? errors : undefined,
      duplicateProducts: duplicateCount > 0 ? duplicateProducts : undefined,
      insertedProducts,
    });
  } catch (error) {
    console.error('[Import API] ❌ 导入失败:', error);
    console.error('[Import API] 错误堆栈:', error instanceof Error ? error.stack : error);
    try {
      const db = getSupabaseClient();
      await db.from('import_logs').insert({
        file_name: 'unknown',
        file_type: 'unknown',
        total_count: 0,
        imported_count: 0,
        skipped_count: 0,
        failed_count: 0,
        duplicate_config: null,
        details: {
          error: error instanceof Error ? error.message : '未知错误',
          stack: error instanceof Error ? error.stack : undefined,
        },
        duration_ms: Date.now() - startTime,
        status: 'failed',
        started_at: new Date(startTime).toISOString(),
        completed_at: new Date().toISOString(),
      });
    } catch (logError) {
      console.error('[Import API] ⚠️ 记录失败日志失败:', logError);
    }

    return NextResponse.json(
      { success: false, error: '导入产品失败', details: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}
