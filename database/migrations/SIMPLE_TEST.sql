-- ============================================================================
-- 简单测试：验证SQL Editor是否正常工作
-- ============================================================================

-- 测试1：创建一个临时表
CREATE TEMPORARY TABLE test_table (id INTEGER, name TEXT);

-- 测试2：插入数据
INSERT INTO test_table VALUES (1, 'test');

-- 测试3：查询数据
SELECT * FROM test_table;

-- 测试4：删除临时表
DROP TABLE test_table;

-- 测试5：检查当前表的列数
SELECT COUNT(*) as column_count FROM information_schema.columns WHERE table_name = 'product_field_configs';

-- 测试6：检查当前表的所有列
SELECT column_name, data_type FROM information_schema.columns WHERE table_name = 'product_field_configs' ORDER BY ordinal_position;
