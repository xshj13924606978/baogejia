import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 诊断并修复 product_field_configs 表的字段结构
 */
export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    console.log('[Diagnose Field Configs] 开始诊断字段配置表...');

    // 步骤1: 检查表是否存在
    const { error: tableCheckError } = await db
      .from('product_field_configs')
      .select('count', { count: 'exact', head: true });

    if (tableCheckError && tableCheckError.message && tableCheckError.message.includes('does not exist')) {
      console.log('[Diagnose Field Configs] 表不存在');
      return NextResponse.json({
        success: false,
        status: 'table_not_exists',
        error: 'product_field_configs 表不存在',
        solution: '需要执行完整的初始化SQL',
        action: 'call_init_api',
        api_endpoint: '/api/admin/init-product-field-configs',
      });
    }

    // 步骤2: 尝试查询所有字段，检测字段名
    const { data: allData, error: allError } = await db
      .from('product_field_configs')
      .select('*')
      .limit(1);

    if (allError) {
      console.error('[Diagnose Field Configs] 查询失败:', allError);
      return NextResponse.json({
        success: false,
        status: 'query_failed',
        error: '查询失败：' + allError.message,
      });
    }

    // 步骤3: 检测字段名
    const hasDisplayName = allData && allData.length > 0 && 'display_name' in allData[0];
    const hasFieldName = allData && allData.length > 0 && 'field_name' in allData[0];

    console.log('[Diagnose Field Configs] 字段检测结果:', {
      hasDisplayName,
      hasFieldName,
      hasData: allData && allData.length > 0,
    });

    // 情况1: 使用了旧的 display_name 字段
    if (hasDisplayName && !hasFieldName) {
      console.log('[Diagnose Field Configs] 发现旧字段 display_name，需要修复');

      const fixSql = `-- 修复字段名：将 display_name 重命名为 field_name
ALTER TABLE product_field_configs RENAME COLUMN display_name TO field_name;

-- 验证修复结果
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'product_field_configs' 
ORDER BY ordinal_position;`;

      return NextResponse.json({
        success: false,
        status: 'needs_rename',
        error: '发现旧字段 display_name，需要重命名为 field_name',
        solution: '执行以下SQL重命名字段',
        fixSql,
        instructions: [
          '1. 登录 Supabase Dashboard',
          '2. 进入 SQL Editor',
          '3. 复制并执行下方的 SQL 语句',
          '4. 执行完成后，刷新页面',
        ],
      });
    }

    // 情况2: 字段名正确，但没有数据
    if (!hasDisplayName && hasFieldName) {
      const { count } = await db
        .from('product_field_configs')
        .select('*', { count: 'exact', head: true });

      if (count === 0) {
        console.log('[Diagnose Field Configs] 字段结构正确，但没有数据');

        const insertSql = `-- 插入默认字段配置
INSERT INTO product_field_configs (field_key, field_name, field_label, field_type, is_required, is_duplicate_check, is_visible, display_order) VALUES
('name', '产品名称', 'product_name', 'text', TRUE, TRUE, TRUE, 1),
('model', '规格型号', 'model', 'text', FALSE, TRUE, TRUE, 2),
('brand', '品牌', 'brand', 'text', FALSE, FALSE, TRUE, 3),
('price', '指导价', 'price', 'number', TRUE, FALSE, TRUE, 4),
('cost_price', '成本价', 'cost_price', 'number', FALSE, FALSE, FALSE, 5),
('min_price', '最低售价', 'min_price', 'number', FALSE, FALSE, FALSE, 6),
('parameter_description', '参数描述', 'parameter_description', 'text', FALSE, FALSE, TRUE, 7),
('description', '描述', 'description', 'text', FALSE, FALSE, TRUE, 8),
('unit', '单位', 'unit', 'text', FALSE, FALSE, TRUE, 9),
('stock', '库存', 'stock', 'number', FALSE, FALSE, TRUE, 10),
('category', '分类', 'category', 'text', FALSE, FALSE, TRUE, 11),
('supplier', '供应商', 'supplier', 'text', FALSE, FALSE, TRUE, 12),
('contact_person', '联系人', 'contact_person', 'text', FALSE, FALSE, TRUE, 13),
('contact_phone', '联系电话', 'contact_phone', 'text', FALSE, FALSE, TRUE, 14),
('image_url', '图片', 'image_url', 'text', FALSE, FALSE, TRUE, 15)
ON CONFLICT (field_key) DO NOTHING;`;

        return NextResponse.json({
          success: false,
          status: 'needs_data',
          error: '字段结构正确，但没有数据',
          solution: '插入默认字段配置',
          insertSql,
          instructions: [
            '1. 登录 Supabase Dashboard',
            '2. 进入 SQL Editor',
            '3. 复制并执行下方的 SQL 语句',
            '4. 执行完成后，刷新页面',
          ],
        });
      }
    }

    // 步骤4: 获取当前数据用于验证
    const { data: currentData } = await db
      .from('product_field_configs')
      .select('field_key, field_name, field_label, is_duplicate_check, display_order')
      .order('display_order', { ascending: true });

    // 步骤5: 检查判重配置是否正确
    const duplicateFields = currentData?.filter(f => f.is_duplicate_check) || [];
    const expectedDuplicateFields = ['name', 'model', 'brand'];

    const isMissingDuplicateFields = !expectedDuplicateFields.every(field =>
      duplicateFields.some(df => df.field_key === field)
    );

    if (isMissingDuplicateFields) {
      console.log('[Diagnose Field Configs] 判重配置不完整');

      const fixSql = `-- 修复判重配置
UPDATE product_field_configs 
SET is_duplicate_check = TRUE 
WHERE field_key IN ('name', 'model', 'brand');

-- 验证修复结果
SELECT field_key, field_name, is_duplicate_check 
FROM product_field_configs 
WHERE is_duplicate_check = TRUE 
ORDER BY display_order;`;

      return NextResponse.json({
        success: false,
        status: 'needs_duplicate_fix',
        error: '判重配置不完整',
        solution: '启用 name、model、brand 字段的判重功能',
        currentDuplicateFields: duplicateFields.map(f => f.field_key),
        expectedDuplicateFields,
        fixSql,
        instructions: [
          '1. 登录 Supabase Dashboard',
          '2. 进入 SQL Editor',
          '3. 复制并执行下方的 SQL 语句',
          '4. 执行完成后，刷新页面',
        ],
      });
    }

    // 步骤6: 一切正常
    console.log('[Diagnose Field Configs] 诊断完成，一切正常');
    return NextResponse.json({
      success: true,
      status: 'healthy',
      message: '数据库字段配置正常',
      data: {
        hasData: currentData && currentData.length > 0,
        recordCount: currentData?.length || 0,
        duplicateFields: duplicateFields.map(f => f.field_key),
        sampleData: currentData?.slice(0, 3),
      },
    });

  } catch (error) {
    console.error('[Diagnose Field Configs] 诊断失败:', error);
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        error: error instanceof Error ? error.message : '诊断失败',
      },
      { status: 500 }
    );
  }
}
