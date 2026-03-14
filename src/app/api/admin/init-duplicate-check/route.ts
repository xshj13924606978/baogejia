import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 初始化产品判重配置
 * 添加 is_duplicate_check 列到 product_field_configs 表
 */
export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    console.log('[Init Duplicate Check] 开始初始化产品判重配置...');

    // 检查表是否存在
    const { error: tableCheckError } = await db
      .from('product_field_configs')
      .select('count', { count: 'exact', head: true });

    // 如果表不存在，返回完整的初始化SQL
    if (tableCheckError && tableCheckError.message && tableCheckError.message.includes('does not exist')) {
      console.log('[Init Duplicate Check] product_field_configs 表不存在');
      
      const completeSql = `-- ============================================================================
-- 完整数据库初始化脚本（创建表和初始化数据）
-- ============================================================================

-- 第一部分：创建 product_field_configs 表
CREATE TABLE IF NOT EXISTS product_field_configs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key VARCHAR(50) UNIQUE NOT NULL,
  display_name VARCHAR(100) NOT NULL,
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
INSERT INTO product_field_configs (field_key, display_name, field_label, field_type, is_required, is_duplicate_check, is_visible, display_order) VALUES
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

-- 第二部分：创建导入日志表（可选）
CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,
  file_name TEXT,
  file_type TEXT,
  total_count INTEGER NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,
  duplicate_config JSONB,
  details JSONB,
  duration_ms INTEGER,
  status TEXT DEFAULT 'completed',
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_import_logs_created_at ON import_logs(created_at DESC);
CREATE INDEX IF NOT EXISTS idx_import_logs_user_id ON import_logs(user_id);
CREATE INDEX IF NOT EXISTS idx_import_logs_status ON import_logs(status);

COMMENT ON TABLE import_logs IS '产品导入日志表，记录所有导入操作的详细信息';

-- 第三部分：创建导入日志视图
-- 创建导入日志摘要视图（详细视图）
CREATE OR REPLACE VIEW import_logs_summary AS
SELECT
  id,
  created_at,
  file_name,
  file_type,
  total_count,
  imported_count,
  skipped_count,
  failed_count,
  duration_ms,
  status,
  started_at,
  completed_at,
  CASE
    WHEN failed_count > 0 THEN '部分失败'
    WHEN skipped_count > 0 THEN '部分跳过'
    ELSE '全部成功'
  END AS result_status,
  CASE
    WHEN total_count > 0 THEN ROUND((imported_count::FLOAT / total_count) * 100, 2)
    ELSE 0
  END AS success_rate
FROM import_logs
ORDER BY created_at DESC;

COMMENT ON VIEW import_logs_summary IS '导入日志摘要视图，包含每条导入记录的详细信息';

-- 创建导入日志每日汇总视图（统计视图）
CREATE OR REPLACE VIEW import_logs_daily_summary AS
SELECT
  DATE(created_at) as import_date,
  COUNT(*) as total_imports,
  SUM(total_count) as total_products,
  SUM(imported_count) as total_imported,
  SUM(skipped_count) as total_skipped,
  SUM(failed_count) as total_failed,
  AVG(CASE WHEN total_count > 0 THEN (imported_count::float / total_count::float) * 100 ELSE 0 END) as avg_success_rate
FROM import_logs
GROUP BY DATE(created_at)
ORDER BY import_date DESC;

COMMENT ON VIEW import_logs_daily_summary IS '导入日志每日汇总视图，按日期统计导入数据';

-- ============================================================================
-- 初始化完成
-- ============================================================================`;

      return NextResponse.json({
        success: false,
        error: '数据库表不存在，需要完整初始化',
        requiresManualSetup: true,
        message: '需要在 Supabase Dashboard 中执行以下完整的初始化 SQL 语句',
        sqlStatements: completeSql,
        instructions: [
          '1. 登录 Supabase Dashboard',
          '2. 进入 SQL Editor',
          '3. 复制并执行下方的完整 SQL 语句',
          '4. 执行完成后，重新加载页面',
        ],
      });
    }

    // 表存在，检查是否有 is_duplicate_check 列
    const { data: testData, error: testError } = await db
      .from('product_field_configs')
      .select('is_duplicate_check')
      .limit(1);

    if (!testError && testData && testData.length > 0) {
      console.log('[Init Duplicate Check] is_duplicate_check 列已存在');
      
      // 检查是否有数据
      const { count } = await db
        .from('product_field_configs')
        .select('*', { count: 'exact', head: true });
      
      if (count === 0) {
        console.log('[Init Duplicate Check] 表存在但没有数据，插入默认配置');
        
        const { error: insertError } = await db
          .from('product_field_configs')
          .insert([
            { field_key: 'name', display_name: '产品名称', field_label: 'product_name', field_type: 'text', is_required: true, is_duplicate_check: true, display_order: 1 },
            { field_key: 'model', display_name: '规格型号', field_label: 'model', field_type: 'text', is_required: false, is_duplicate_check: true, display_order: 2 },
            { field_key: 'brand', display_name: '品牌', field_label: 'brand', field_type: 'text', is_required: false, is_duplicate_check: true, display_order: 3 },
            { field_key: 'price', display_name: '指导价', field_label: 'price', field_type: 'number', is_required: true, is_duplicate_check: false, display_order: 4 },
          ]);
        
        if (insertError) {
          console.error('[Init Duplicate Check] 插入默认配置失败:', insertError);
          return NextResponse.json({
            success: false,
            error: '插入默认配置失败：' + insertError.message,
          }, { status: 200 });
        }
      }
      
      return NextResponse.json({
        success: true,
        message: '数据库已正确初始化，无需操作',
        initialized: true,
      });
    }

    if (testError && testError.message && testError.message.includes('column')) {
      console.log('[Init Duplicate Check] is_duplicate_check 列不存在，需要添加');

      const addColumnSql = `-- 添加 is_duplicate_check 列
ALTER TABLE product_field_configs
ADD COLUMN IF NOT EXISTS is_duplicate_check BOOLEAN DEFAULT FALSE;

-- 初始化默认判重配置（name 和 model）
UPDATE product_field_configs
SET is_duplicate_check = TRUE
WHERE field_key IN ('name', 'model');

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_product_field_configs_duplicate_check
ON product_field_configs(is_duplicate_check)
WHERE is_duplicate_check = TRUE;

COMMENT ON COLUMN product_field_configs.is_duplicate_check IS '标识该字段是否用于产品导入时的重复判断';`;

      return NextResponse.json({
        success: false,
        error: '数据库表需要添加判重列',
        requiresManualSetup: true,
        message: '需要在 Supabase Dashboard 中执行以下 SQL 语句',
        sqlStatements: addColumnSql,
        instructions: [
          '1. 登录 Supabase Dashboard',
          '2. 进入 SQL Editor',
          '3. 复制并执行下方的 SQL 语句',
          '4. 执行完成后，重新加载页面',
        ],
      });
    }

    // 其他错误
    console.error('[Init Duplicate Check] 检测失败:', testError);
    return NextResponse.json(
      {
        success: false,
        error: testError?.message || '检测数据库状态失败',
      },
      { status: 200 }
    );
  } catch (error) {
    console.error('[Init Duplicate Check] 初始化失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '初始化失败',
      },
      { status: 200 }
    );
  }
}
