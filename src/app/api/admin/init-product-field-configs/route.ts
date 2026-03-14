import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 初始化 product_field_configs 表
 * 当表不存在时，返回SQL语句让用户手动执行
 */
export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    console.log('[Init Product Field Configs] 开始初始化产品字段配置表...');

    // 测试表是否已存在
    const { data: testData, error: testError } = await db
      .from('product_field_configs')
      .select('id')
      .limit(1);

    if (!testError) {
      console.log('[Init Product Field Configs] product_field_configs 表已存在');
      return NextResponse.json({
        success: true,
        message: 'product_field_configs 表已存在，无需初始化',
      });
    }

    if (testError.message && !testError.message.includes('does not exist')) {
      console.error('[Init Product Field Configs] 测试查询失败:', testError);
      return NextResponse.json(
        {
          success: false,
          error: '数据库查询失败',
        },
        { status: 500 }
      );
    }

    // 表不存在，需要创建
    console.log('[Init Product Field Configs] product_field_configs 表不存在，需要创建');

    // 返回 SQL 语句，让用户在 Supabase Dashboard 中执行
    const sqlStatements = `-- 创建产品字段配置表
CREATE TABLE IF NOT EXISTS product_field_configs (
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
COMMENT ON TABLE product_field_configs IS '产品字段配置表，管理产品库的字段显示、必填、判重等配置';`;

    return NextResponse.json({
      success: false,
      error: '数据库表不存在',
      requiresManualSetup: true,
      message: 'product_field_configs 表不存在，需要在 Supabase Dashboard 中执行以下 SQL 语句',
      sqlStatements,
      instructions: [
        '1. 登录 Supabase Dashboard',
        '2. 进入 SQL Editor',
        '3. 复制并执行下方的 SQL 语句',
        '4. 执行完成后，重新加载页面',
      ],
    });
  } catch (error) {
    console.error('[Init Product Field Configs] 初始化失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '初始化失败',
      },
      { status: 500 }
    );
  }
}
