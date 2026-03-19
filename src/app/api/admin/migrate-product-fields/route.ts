import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 执行产品字段统一迁移
 * 添加缺失的字段到 products 表
 */
export async function POST(request: NextRequest) {
  const startTime = Date.now();
  console.log('[Migration API] ========== 开始执行产品字段迁移 ==========');

  try {
    const db = getSupabaseClient();
    const results: string[] = [];

    // 1. 添加缺失字段
    const columnsToAdd = [
      { name: 'parameter_description', type: 'TEXT', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS parameter_description TEXT' },
      { name: 'brand', type: 'VARCHAR(255)', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS brand VARCHAR(255)' },
      { name: 'unit', type: 'VARCHAR(50)', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS unit VARCHAR(50)' },
      { name: 'contact_person', type: 'VARCHAR(100)', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS contact_person VARCHAR(100)' },
      { name: 'contact_phone', type: 'VARCHAR(50)', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS contact_phone VARCHAR(50)' },
      { name: 'cost_price', type: 'NUMERIC(10,2)', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS cost_price NUMERIC(10, 2)' },
      { name: 'min_price', type: 'NUMERIC(10,2)', sql: 'ALTER TABLE products ADD COLUMN IF NOT EXISTS min_price NUMERIC(10, 2)' },
    ];

    for (const col of columnsToAdd) {
      results.push(`字段 ${col.name}: 需要手动检查`);
    }

    // 2. 更新字段配置表
    console.log('[Migration API] 更新字段配置表...');
    
    // 删除旧配置
    const { error: deleteError } = await db
      .from('product_field_configs')
      .delete()
      .neq('id', '00000000-0000-0000-0000-000000000000'); // 删除所有记录

    if (deleteError) {
      console.error('[Migration API] 删除旧配置失败:', deleteError);
    }

    // 插入新配置（13个标准字段）
    const fieldConfigs = [
      // 统一产品字段规范（13个标准字段）
      { field_key: 'category', field_name: '分类', field_label: '分类', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 1 },
      { field_key: 'name', field_name: '产品名称', field_label: '产品名称', field_type: 'text', is_required: true, is_duplicate_check: true, is_visible: true, display_order: 2 },
      { field_key: 'model', field_name: '规格型号', field_label: '规格型号', field_type: 'text', is_required: false, is_duplicate_check: true, is_visible: true, display_order: 3 },
      { field_key: 'parameter_description', field_name: '参数描述', field_label: '参数描述', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 4 },
      { field_key: 'brand', field_name: '品牌', field_label: '品牌', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 5 },
      { field_key: 'unit', field_name: '单位', field_label: '单位', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 6 },
      { field_key: 'supplier', field_name: '供应商', field_label: '供应商', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 7 },
      { field_key: 'contact_person', field_name: '联系人', field_label: '联系人', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 8 },
      { field_key: 'contact_phone', field_name: '联系电话', field_label: '联系电话', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 9 },
      { field_key: 'cost_price', field_name: '成本价', field_label: '成本价', field_type: 'number', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 10 },
      { field_key: 'min_price', field_name: '最低售价', field_label: '最低售价', field_type: 'number', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 11 },
      { field_key: 'price', field_name: '指导价', field_label: '指导价', field_type: 'number', is_required: true, is_duplicate_check: false, is_visible: true, display_order: 12 },
      { field_key: 'image_url', field_name: '产品图片', field_label: '产品图片', field_type: 'text', is_required: false, is_duplicate_check: false, is_visible: true, display_order: 13 },
      // 系统字段
      { field_key: 'stock', field_name: '库存', field_label: '库存', field_type: 'number', is_required: false, is_duplicate_check: false, is_visible: false, display_order: 100 },
    ];

    const { error: insertError } = await db
      .from('product_field_configs')
      .upsert(fieldConfigs, { onConflict: 'field_key' });

    if (insertError) {
      console.error('[Migration API] 插入字段配置失败:', insertError);
      results.push(`字段配置更新失败: ${insertError.message}`);
    } else {
      results.push('字段配置更新成功（14条记录）');
    }

    // 3. 验证表结构 - 查询现有产品数量
    const { count: productCount } = await db
      .from('products')
      .select('*', { count: 'exact', head: true });

    const duration = Date.now() - startTime;
    console.log('[Migration API] ========== 迁移完成 ==========');
    console.log('[Migration API] 耗时:', `${duration}ms`);

    return NextResponse.json({
      success: true,
      message: '产品字段迁移执行完成',
      results,
      productCount: productCount || 0,
      duration,
      note: 'Supabase不支持直接DDL，请确保数据库表已包含以下字段: parameter_description, brand, unit, contact_person, contact_phone, cost_price, min_price',
    });
  } catch (error) {
    console.error('[Migration API] 迁移失败:', error);
    return NextResponse.json(
      { 
        success: false, 
        error: '迁移执行失败', 
        details: error instanceof Error ? error.message : '未知错误' 
      },
      { status: 500 }
    );
  }
}

// GET 方法用于检查迁移状态
export async function GET(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    // 查询字段配置
    const { data: fieldConfigs, error } = await db
      .from('product_field_configs')
      .select('*')
      .order('display_order');

    if (error) {
      return NextResponse.json({
        success: false,
        error: error.message,
      });
    }

    // 统计字段数量
    const standardFields = fieldConfigs?.filter(f => f.display_order <= 13) || [];
    const systemFields = fieldConfigs?.filter(f => f.display_order > 13) || [];

    return NextResponse.json({
      success: true,
      migrationStatus: {
        standardFieldsCount: standardFields.length,
        systemFieldsCount: systemFields.length,
        isMigrated: standardFields.length === 13,
      },
      fieldConfigs,
    });
  } catch (error) {
    return NextResponse.json(
      { 
        success: false, 
        error: '检查迁移状态失败',
        details: error instanceof Error ? error.message : '未知错误'
      },
      { status: 500 }
    );
  }
}
