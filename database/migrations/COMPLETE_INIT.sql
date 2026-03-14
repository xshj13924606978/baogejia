-- ============================================================================
-- 产品导入判重功能完整初始化脚本
-- 执行此脚本可完成所有必要的数据库初始化
-- ============================================================================

-- 第一部分：确保 product_field_configs 表包含所有必需的列
-- ----------------------------------------------------------------------------

-- 检查并添加 is_duplicate_check 列
DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1
    FROM information_schema.columns
    WHERE table_name = 'product_field_configs'
    AND column_name = 'is_duplicate_check'
  ) THEN
    ALTER TABLE product_field_configs
    ADD COLUMN IF NOT EXISTS is_duplicate_check BOOLEAN DEFAULT FALSE;
    RAISE NOTICE '已添加 is_duplicate_check 列';
  ELSE
    RAISE NOTICE 'is_duplicate_check 列已存在';
  END IF;
END $$;

-- 初始化默认判重配置
UPDATE product_field_configs
SET is_duplicate_check = TRUE
WHERE field_key IN ('name', 'model');

-- 添加索引以提高查询性能
CREATE INDEX IF NOT EXISTS idx_product_field_configs_duplicate_check
ON product_field_configs(is_duplicate_check)
WHERE is_duplicate_check = TRUE;

-- 添加注释
COMMENT ON COLUMN product_field_configs.is_duplicate_check IS '标识该字段是否用于产品导入时的重复判断';

RAISE NOTICE '第一部分完成：product_field_configs 表结构已更新';

-- 第二部分：创建导入日志表
-- ----------------------------------------------------------------------------

CREATE TABLE IF NOT EXISTS import_logs (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  created_at TIMESTAMP WITH TIME ZONE DEFAULT NOW(),
  user_id UUID REFERENCES auth.users(id) ON DELETE SET NULL,

  -- 导入基本信息
  file_name TEXT,
  file_type TEXT,
  total_count INTEGER NOT NULL,
  imported_count INTEGER NOT NULL DEFAULT 0,
  skipped_count INTEGER NOT NULL DEFAULT 0,
  failed_count INTEGER NOT NULL DEFAULT 0,

  -- 判重配置
  duplicate_config JSONB,

  -- 详细信息
  details JSONB,
  duration_ms INTEGER,

  -- 索引字段
  status TEXT DEFAULT 'completed',

  -- 时间戳
  started_at TIMESTAMP WITH TIME ZONE,
  completed_at TIMESTAMP WITH TIME ZONE
);

-- 添加索引
CREATE INDEX IF NOT EXISTS idx_import_logs_created_at
ON import_logs(created_at DESC);

CREATE INDEX IF NOT EXISTS idx_import_logs_user_id
ON import_logs(user_id);

CREATE INDEX IF NOT EXISTS idx_import_logs_status
ON import_logs(status);

CREATE INDEX IF NOT EXISTS idx_import_logs_started_at
ON import_logs(started_at DESC);

-- 添加注释
COMMENT ON TABLE import_logs IS '产品导入日志表，记录所有导入操作的详细信息';
COMMENT ON COLUMN import_logs.file_name IS '导入的文件名';
COMMENT ON COLUMN import_logs.file_type IS '文件类型：excel, pdf';
COMMENT ON COLUMN import_logs.total_count IS '总记录数';
COMMENT ON COLUMN import_logs.imported_count IS '成功导入数量';
COMMENT ON COLUMN import_logs.skipped_count IS '跳过数量（重复）';
COMMENT ON COLUMN import_logs.failed_count IS '失败数量';
COMMENT ON COLUMN import_logs.duplicate_config IS '判重规则配置（JSON格式）';
COMMENT ON COLUMN import_logs.details IS '导入详情，包括错误信息、跳过原因等（JSON格式）';
COMMENT ON COLUMN import_logs.duration_ms IS '导入耗时（毫秒）';
COMMENT ON COLUMN import_logs.status IS '状态：pending, completed, failed';
COMMENT ON COLUMN import_logs.started_at IS '导入开始时间';
COMMENT ON COLUMN import_logs.completed_at IS '导入完成时间';

RAISE NOTICE '第二部分完成：import_logs 表已创建';

-- 第三部分：创建导入日志摘要视图
-- ----------------------------------------------------------------------------

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

COMMENT ON VIEW import_logs_summary IS '导入日志摘要视图，包含导入结果的统计信息';

RAISE NOTICE '第三部分完成：import_logs_summary 视图已创建';

-- 第四部分：验证初始化结果
-- ----------------------------------------------------------------------------

-- 显示 product_field_configs 表的统计信息
DO $$
DECLARE
  total_fields INTEGER;
  duplicate_fields INTEGER;
BEGIN
  SELECT COUNT(*) INTO total_fields
  FROM product_field_configs;

  SELECT COUNT(*) INTO duplicate_fields
  FROM product_field_configs
  WHERE is_duplicate_check = TRUE;

  RAISE NOTICE '';
  RAISE NOTICE '========== 初始化验证结果 ==========';
  RAISE NOTICE 'product_field_configs 表字段总数: %', total_fields;
  RAISE NOTICE '参与判重的字段数量: %', duplicate_fields;
  RAISE NOTICE '';

  IF total_fields < 15 THEN
    RAISE WARNING '警告：product_field_configs 表字段数量不足，可能需要重新创建表';
  END IF;

  IF duplicate_fields = 0 THEN
    RAISE WARNING '警告：没有配置判重字段，建议检查初始化结果';
  END IF;

  RAISE NOTICE '========== 验证完成 ==========';
END $$;

-- ============================================================================
-- 初始化完成
-- ============================================================================
RAISE NOTICE '';
RAISE NOTICE '✅ 数据库初始化完成！';
RAISE NOTICE '请访问产品库管理页面，查看判重配置功能。';
RAISE NOTICE '';
