-- ============================================================================
-- 产品表新增竞价相关字段 + 动态配置同步
-- 执行位置: Supabase Dashboard SQL Editor
-- ============================================================================

-- 1. 新增竞价字段
ALTER TABLE products ADD COLUMN IF NOT EXISTS bid_amount DECIMAL(12,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS quote_count INTEGER DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS rating DECIMAL(3,2) DEFAULT 0;
ALTER TABLE products ADD COLUMN IF NOT EXISTS response_time INTEGER DEFAULT 0;

COMMENT ON COLUMN products.bid_amount IS '竞价金额';
COMMENT ON COLUMN products.quote_count IS '报价次数';
COMMENT ON COLUMN products.rating IS '评分(0-5)';
COMMENT ON COLUMN products.response_time IS '响应时间(分钟)';

-- ============================================================================
-- 动态配置同步：产品管理页面新增竞价字段
-- 实际表列：page_id, field_key, field_type, label_zh, is_visible, is_editable,
--           is_required, sort_order, group_name, default_value, validation_rules,
--           options_config, depends_on, config
-- ============================================================================

-- 产品列表页 × 4字段
INSERT INTO system_fields (page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, config)
SELECT p.id, 'bid_amount', 'number', '竞价金额', true, true, false, '竞价信息', 13, '{"min":0}'::jsonb, '{}'::jsonb
FROM system_pages p JOIN system_modules m ON p.module_id = m.id
WHERE m.module_key = 'products' AND p.page_key = 'product_list'
AND NOT EXISTS (SELECT 1 FROM system_fields f JOIN system_pages fp ON f.page_id = fp.id JOIN system_modules fm ON fp.module_id = fm.id WHERE fm.module_key = 'products' AND fp.page_key = 'product_list' AND f.field_key = 'bid_amount');

INSERT INTO system_fields (page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, config)
SELECT p.id, 'quote_count', 'number', '报价次数', true, true, false, '竞价信息', 14, '{"min":0}'::jsonb, '{}'::jsonb
FROM system_pages p JOIN system_modules m ON p.module_id = m.id
WHERE m.module_key = 'products' AND p.page_key = 'product_list'
AND NOT EXISTS (SELECT 1 FROM system_fields f JOIN system_pages fp ON f.page_id = fp.id JOIN system_modules fm ON fp.module_id = fm.id WHERE fm.module_key = 'products' AND fp.page_key = 'product_list' AND f.field_key = 'quote_count');

INSERT INTO system_fields (page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, config)
SELECT p.id, 'rating', 'number', '评分', true, true, false, '竞价信息', 15, '{"min":0,"max":5}'::jsonb, '{}'::jsonb
FROM system_pages p JOIN system_modules m ON p.module_id = m.id
WHERE m.module_key = 'products' AND p.page_key = 'product_list'
AND NOT EXISTS (SELECT 1 FROM system_fields f JOIN system_pages fp ON f.page_id = fp.id JOIN system_modules fm ON fp.module_id = fm.id WHERE fm.module_key = 'products' AND fp.page_key = 'product_list' AND f.field_key = 'rating');

INSERT INTO system_fields (page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, config)
SELECT p.id, 'response_time', 'number', '响应时间(分钟)', true, true, false, '竞价信息', 16, '{"min":0}'::jsonb, '{}'::jsonb
FROM system_pages p JOIN system_modules m ON p.module_id = m.id
WHERE m.module_key = 'products' AND p.page_key = 'product_list'
AND NOT EXISTS (SELECT 1 FROM system_fields f JOIN system_pages fp ON f.page_id = fp.id JOIN system_modules fm ON fp.module_id = fm.id WHERE fm.module_key = 'products' AND fp.page_key = 'product_list' AND f.field_key = 'response_time');

-- 产品表单页 × 4字段
INSERT INTO system_fields (page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, config)
SELECT p.id, 'bid_amount', 'number', '竞价金额', true, true, false, '竞价信息', 13, '{"min":0}'::jsonb, '{}'::jsonb
FROM system_pages p JOIN system_modules m ON p.module_id = m.id
WHERE m.module_key = 'products' AND p.page_key = 'product_form'
AND NOT EXISTS (SELECT 1 FROM system_fields f JOIN system_pages fp ON f.page_id = fp.id JOIN system_modules fm ON fp.module_id = fm.id WHERE fm.module_key = 'products' AND fp.page_key = 'product_form' AND f.field_key = 'bid_amount');

INSERT INTO system_fields (page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, config)
SELECT p.id, 'quote_count', 'number', '报价次数', true, true, false, '竞价信息', 14, '{"min":0}'::jsonb, '{}'::jsonb
FROM system_pages p JOIN system_modules m ON p.module_id = m.id
WHERE m.module_key = 'products' AND p.page_key = 'product_form'
AND NOT EXISTS (SELECT 1 FROM system_fields f JOIN system_pages fp ON f.page_id = fp.id JOIN system_modules fm ON fp.module_id = fm.id WHERE fm.module_key = 'products' AND fp.page_key = 'product_form' AND f.field_key = 'quote_count');

INSERT INTO system_fields (page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, config)
SELECT p.id, 'rating', 'number', '评分(0-5)', true, true, false, '竞价信息', 15, '{"min":0,"max":5}'::jsonb, '{}'::jsonb
FROM system_pages p JOIN system_modules m ON p.module_id = m.id
WHERE m.module_key = 'products' AND p.page_key = 'product_form'
AND NOT EXISTS (SELECT 1 FROM system_fields f JOIN system_pages fp ON f.page_id = fp.id JOIN system_modules fm ON fp.module_id = fm.id WHERE fm.module_key = 'products' AND fp.page_key = 'product_form' AND f.field_key = 'rating');

INSERT INTO system_fields (page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, config)
SELECT p.id, 'response_time', 'number', '响应时间(分钟)', true, true, false, '竞价信息', 16, '{"min":0}'::jsonb, '{}'::jsonb
FROM system_pages p JOIN system_modules m ON p.module_id = m.id
WHERE m.module_key = 'products' AND p.page_key = 'product_form'
AND NOT EXISTS (SELECT 1 FROM system_fields f JOIN system_pages fp ON f.page_id = fp.id JOIN system_modules fm ON fp.module_id = fm.id WHERE fm.module_key = 'products' AND fp.page_key = 'product_form' AND f.field_key = 'response_time');

-- 产品详情页 × 4字段
INSERT INTO system_fields (page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, config)
SELECT p.id, 'bid_amount', 'number', '竞价金额', true, false, false, '竞价信息', 17, '{}'::jsonb, '{}'::jsonb
FROM system_pages p JOIN system_modules m ON p.module_id = m.id
WHERE m.module_key = 'products' AND p.page_key = 'product_detail'
AND NOT EXISTS (SELECT 1 FROM system_fields f JOIN system_pages fp ON f.page_id = fp.id JOIN system_modules fm ON fp.module_id = fm.id WHERE fm.module_key = 'products' AND fp.page_key = 'product_detail' AND f.field_key = 'bid_amount');

INSERT INTO system_fields (page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, config)
SELECT p.id, 'quote_count', 'number', '报价次数', true, false, false, '竞价信息', 18, '{}'::jsonb, '{}'::jsonb
FROM system_pages p JOIN system_modules m ON p.module_id = m.id
WHERE m.module_key = 'products' AND p.page_key = 'product_detail'
AND NOT EXISTS (SELECT 1 FROM system_fields f JOIN system_pages fp ON f.page_id = fp.id JOIN system_modules fm ON fp.module_id = fm.id WHERE fm.module_key = 'products' AND fp.page_key = 'product_detail' AND f.field_key = 'quote_count');

INSERT INTO system_fields (page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, config)
SELECT p.id, 'rating', 'number', '评分(0-5)', true, false, false, '竞价信息', 19, '{}'::jsonb, '{}'::jsonb
FROM system_pages p JOIN system_modules m ON p.module_id = m.id
WHERE m.module_key = 'products' AND p.page_key = 'product_detail'
AND NOT EXISTS (SELECT 1 FROM system_fields f JOIN system_pages fp ON f.page_id = fp.id JOIN system_modules fm ON fp.module_id = fm.id WHERE fm.module_key = 'products' AND fp.page_key = 'product_detail' AND f.field_key = 'rating');

INSERT INTO system_fields (page_id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, validation_rules, config)
SELECT p.id, 'response_time', 'number', '响应时间(分钟)', true, false, false, '竞价信息', 20, '{}'::jsonb, '{}'::jsonb
FROM system_pages p JOIN system_modules m ON p.module_id = m.id
WHERE m.module_key = 'products' AND p.page_key = 'product_detail'
AND NOT EXISTS (SELECT 1 FROM system_fields f JOIN system_pages fp ON f.page_id = fp.id JOIN system_modules fm ON fp.module_id = fm.id WHERE fm.module_key = 'products' AND fp.page_key = 'product_detail' AND f.field_key = 'response_time');

NOTIFY pgrst, 'reload schema';
