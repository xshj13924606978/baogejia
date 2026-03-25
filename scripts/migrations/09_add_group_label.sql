-- 给 system_modules 添加 group_label 分组字段
-- 执行位置: Supabase Dashboard SQL Editor
-- https://supabase.com/dashboard/project/tjbnjrcgmyiwudqptfhc/sql

-- 1. 添加字段
ALTER TABLE system_modules ADD COLUMN IF NOT EXISTS group_label VARCHAR(50) DEFAULT '';

-- 2. 更新分组标签
UPDATE system_modules SET group_label = '核心业务' WHERE sort_order <= 11 AND group_label IS DISTINCT FROM '核心业务';
UPDATE system_modules SET group_label = '运营管理' WHERE sort_order BETWEEN 12 AND 42 AND group_label IS DISTINCT FROM '运营管理';
UPDATE system_modules SET group_label = '内容管理' WHERE sort_order BETWEEN 35 AND 35 AND group_label IS DISTINCT FROM '内容管理';
UPDATE system_modules SET group_label = '系统管理' WHERE sort_order >= 50 AND group_label IS DISTINCT FROM '系统管理';

-- 3. 修正：资料中心(35) 应归到内容管理（覆盖运营管理）
UPDATE system_modules SET group_label = '内容管理' WHERE module_key = 'knowledge_center';

-- 4. 验证
SELECT sort_order, module_key, name_zh, group_label FROM system_modules WHERE is_enabled = true ORDER BY sort_order;
