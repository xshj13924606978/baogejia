import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 初始化独立判重配置表
 */
export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    console.log('[Init Duplicate Settings] 开始初始化独立配置表...');

    // 检查表是否已存在
    const { error: tableCheckError } = await db
      .from('duplicate_check_settings')
      .select('count', { count: 'exact', head: true });

    if (!tableCheckError) {
      console.log('[Init Duplicate Settings] 表已存在');
      return NextResponse.json({
        success: true,
        message: '独立配置表已存在，无需初始化',
      });
    }

    console.log('[Init Duplicate Settings] 表不存在，需要创建');
    console.log('[Init Duplicate Settings] 返回SQL让用户手动执行');

    // 返回SQL语句
    const sqlStatements = `-- 创建独立的判重配置表
CREATE TABLE IF NOT EXISTS duplicate_check_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_duplicate_check_settings_field_key ON duplicate_check_settings(field_key);
CREATE INDEX IF NOT EXISTS idx_duplicate_check_settings_is_enabled ON duplicate_check_settings(is_enabled);

-- 添加注释
COMMENT ON TABLE duplicate_check_settings IS '判重配置表，独立存储产品判重字段设置';

-- 清理旧数据
DELETE FROM duplicate_check_settings WHERE field_key IS NOT NULL;

-- 插入默认配置
INSERT INTO duplicate_check_settings (field_key, field_name, is_enabled, display_order) VALUES
('product_name', '产品名称', TRUE, 1),
('model', '规格型号', TRUE, 2),
('brand', '品牌', FALSE, 3);

-- 验证结果
SELECT * FROM duplicate_check_settings ORDER BY display_order;`;

    return NextResponse.json({
      success: false,
      error: '独立配置表不存在',
      requiresManualSetup: true,
      message: '请在 Supabase SQL Editor 中执行以下 SQL 语句',
      sqlStatements,
      instructions: [
        '1. 登录 Supabase Dashboard',
        '2. 进入 SQL Editor',
        '3. 复制并执行下方的 SQL 语句',
        '4. 执行完成后，点击"初始化完成"按钮',
      ],
    });

  } catch (error) {
    console.error('[Init Duplicate Settings] 初始化失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '初始化失败',
      },
      { status: 500 }
    );
  }
}
