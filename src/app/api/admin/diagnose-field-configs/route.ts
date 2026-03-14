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
      .order('id', { ascending: true });

    console.log('[Diagnose Field Configs] 查询结果:', {
      hasData: !!allData,
      dataLength: allData?.length || 0,
      allFieldKeys: allData?.map((f: any) => f.field_key),
      error: allError?.message || null,
    });

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
    const hasIsDuplicateCheck = allData && allData.length > 0 && 'is_duplicate_check' in allData[0];

    console.log('[Diagnose Field Configs] 字段检测结果:', {
      hasDisplayName,
      hasFieldName,
      hasIsDuplicateCheck,
      hasData: allData && allData.length > 0,
      sampleField: allData && allData.length > 0 ? Object.keys(allData[0]) : [],
    });

    // 检测旧表结构（field_key 是 product_name 而不是 name）
    const hasProductNameField = allData && allData.length > 0 &&
      allData.some((f: any) => f.field_key === 'product_name');

    const hasOldStructure = hasProductNameField;

    console.log('[Diagnose Field Configs] 旧表结构检测:', {
      hasProductNameField,
      hasOldStructure,
      allFieldKeys: allData?.map((f: any) => f.field_key),
    });

    // 对于旧表结构，如果已经适配了，返回健康状态
    if (hasOldStructure && !hasIsDuplicateCheck) {
      console.log('[Diagnose Field Configs] 检测到旧表结构，但前端已适配，返回健康状态');

      // 获取默认的判重字段
      const defaultDuplicateFields = allData?.filter((f: any) =>
        f.field_key === 'product_name' || f.field_key === 'name' || f.field_key === 'model'
      ) || [];

      return NextResponse.json({
        success: true,
        status: 'healthy_old_structure',
        message: '旧表结构，但前端已适配',
        data: {
          hasData: allData && allData.length > 0,
          recordCount: allData?.length || 0,
          duplicateFields: defaultDuplicateFields.map((f: any) => f.field_key),
          sampleData: allData?.slice(0, 3),
          isOldStructure: true,
          note: '当前使用旧表结构，但前端已适配，可以正常工作。建议升级到新表结构以获得完整功能。',
        },
      });
    }

    // 检测旧表结构（field_key 是 product_name 而不是 name）
    if (hasOldStructure) {
      console.log('[Diagnose Field Configs] 检测到旧表结构，需要重建表');

      const rebuildSql = `-- 删除旧表并重新创建
DROP TABLE IF EXISTS product_field_configs CASCADE;

-- 创建新的 product_field_configs 表
CREATE TABLE product_field_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key VARCHAR(50) UNIQUE NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  field_label VARCHAR(100) NOT NULL,
  field_type VARCHAR(20) NOT NULL,
  is_required BOOLEAN DEFAULT FALSE,
  is_duplicate_check BOOLEAN DEFAULT FALSE,
  is_visible BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  options JSONB,
  validation_rules JSONB,
  default_value TEXT,
  placeholder TEXT,
  description TEXT,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id)
);

-- 插入默认字段配置
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
ON CONFLICT (field_key) DO NOTHING;

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_product_field_configs_field_key ON product_field_configs(field_key);
CREATE INDEX IF NOT EXISTS idx_product_field_configs_is_required ON product_field_configs(is_required);
CREATE INDEX IF NOT EXISTS idx_product_field_configs_is_duplicate_check ON product_field_configs(is_duplicate_check);
CREATE INDEX IF NOT EXISTS idx_product_field_configs_display_order ON product_field_configs(display_order);
CREATE INDEX IF NOT EXISTS idx_product_field_configs_is_visible ON product_field_configs(is_visible);

-- 添加注释
COMMENT ON TABLE product_field_configs IS '产品字段配置表，管理产品库的字段显示、必填、判重等配置';

-- 验证结果
SELECT field_key, field_name, is_duplicate_check, display_order
FROM product_field_configs
ORDER BY display_order;`;

      return NextResponse.json({
        success: false,
        status: 'needs_rebuild',
        error: '检测到旧表结构，需要重建表',
        details: {
          oldFieldKey: allData[0].field_key,
          oldColumns: Object.keys(allData[0]),
          hasIsDuplicateCheck,
        },
        solution: '删除旧表并重建为新结构',
        rebuildSql,
        instructions: [
          '⚠️ 警告：此操作将删除现有配置',
          '1. 登录 Supabase Dashboard',
          '2. 进入 SQL Editor',
          '3. 复制并执行下方的 SQL 语句',
          '4. 执行完成后，刷新页面',
        ],
      });
    }

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
