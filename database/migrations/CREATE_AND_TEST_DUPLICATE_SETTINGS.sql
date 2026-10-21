-- ============================================================================
-- 创建并测试独立配置表
-- ============================================================================

-- 步骤1：创建表
CREATE TABLE IF NOT EXISTS duplicate_check_settings (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  field_key VARCHAR(50) NOT NULL,
  field_name VARCHAR(100) NOT NULL,
  is_enabled BOOLEAN DEFAULT TRUE,
  display_order INTEGER DEFAULT 0,
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  updated_at TIMESTAMP WITH TIME ZONE DEFAULT NOW()
);

-- 步骤2：添加索引
CREATE INDEX IF NOT EXISTS idx_duplicate_check_settings_field_key ON duplicate_check_settings(field_key);
CREATE INDEX IF NOT EXISTS idx_duplicate_check_settings_is_enabled ON duplicate_check_settings(is_enabled);

-- 步骤3：添加注释
COMMENT ON TABLE duplicate_check_settings IS '判重配置表，独立存储产品判重字段设置';

-- 步骤4：清理旧数据
DELETE FROM duplicate_check_settings WHERE field_key IS NOT NULL;

-- 步骤5：插入默认配置
INSERT INTO duplicate_check_settings (field_key, field_name, is_enabled, display_order) VALUES
('product_name', '产品名称', TRUE, 1),
('model', '规格型号', TRUE, 2),
('brand', '品牌', FALSE, 3);

-- 步骤6：验证创建结果
SELECT '=== 验证表结构 ===' as step;
SELECT column_name, data_type
FROM information_schema.columns
WHERE table_name = 'duplicate_check_settings'
ORDER BY ordinal_position;

SELECT '=== 验证数据 ===' as step;
SELECT * FROM duplicate_check_settings ORDER BY display_order;

SELECT '=== 完成 ===' as step;
