-- ============================================================================
-- 检查独立配置表是否存在
-- ============================================================================

-- 检查表是否存在
SELECT table_name, table_type
FROM information_schema.tables
WHERE table_name = 'duplicate_check_settings'
  AND table_schema = 'public';

-- 如果表存在，显示数据
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM information_schema.tables WHERE table_name = 'duplicate_check_settings' AND table_schema = 'public') THEN
    RAISE NOTICE '=== duplicate_check_settings 表存在 ===';
  ELSE
    RAISE NOTICE '=== duplicate_check_settings 表不存在，需要创建 ===';
  END IF;
END $$;
