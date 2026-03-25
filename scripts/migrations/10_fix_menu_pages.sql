-- 修复 system_modules 和 system_pages 的模块 key 不匹配问题
-- 以及补充缺失的页面

-- ============================================================================
-- 1. 修复模块 key 不匹配
-- ============================================================================
-- import_logs -> import-logs（文件目录名）
UPDATE system_modules SET module_key = 'import-logs' WHERE module_key = 'import_logs';

-- points 的子模块也统一
UPDATE system_modules SET module_key = 'points-rules' WHERE module_key = 'points_rules';

-- ============================================================================
-- 2. 添加缺失的模块
-- ============================================================================
-- analytics（数据分析）
INSERT INTO system_modules (module_key, name_zh, icon, route_path, sort_order, is_enabled, is_visible_in_menu, group_label)
VALUES ('analytics', '数据分析', 'BarChart3', '/admin/analytics', 31, true, true, '运营管理')
ON CONFLICT DO NOTHING;

-- knowledge（资料管理/审核入口）
INSERT INTO system_modules (module_key, name_zh, icon, route_path, sort_order, is_enabled, is_visible_in_menu, group_label)
VALUES ('knowledge', '资料管理', 'BookOpen', '/admin/knowledge', 36, true, true, '内容管理')
ON CONFLICT DO NOTHING;

-- modules（模块管理，仅超级管理员可见）
INSERT INTO system_modules (module_key, name_zh, icon, route_path, sort_order, is_enabled, is_visible_in_menu, group_label)
VALUES ('modules', '模块管理', 'SlidersHorizontal', '/admin/modules', 51, true, false, '系统管理')
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 3. 修复子模块的 parent_module_id 关联
-- ============================================================================
-- knowledge-center 的 6 个库页面改为动态路由 :type
DELETE FROM system_pages WHERE module_id = (SELECT id FROM system_modules WHERE module_key = 'knowledge_center')
  AND page_key LIKE '%library';

INSERT INTO system_pages (page_key, name_zh, route_path, is_enabled, module_id, sort_order)
SELECT 'knowledge_library', '资料库详情', '/admin/knowledge-center/:type', true, id, 10
FROM system_modules WHERE module_key = 'knowledge_center'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 4. 补充缺失的页面
-- ============================================================================

-- knowledge 模块页面
INSERT INTO system_pages (page_key, name_zh, route_path, is_enabled, module_id, sort_order)
SELECT 'knowledge_category', '分类管理', '/admin/knowledge/category', true, id, 2
FROM system_modules WHERE module_key = 'knowledge'
ON CONFLICT DO NOTHING;

INSERT INTO system_pages (page_key, name_zh, route_path, is_enabled, module_id, sort_order)
SELECT 'knowledge_new', '新增资料', '/admin/knowledge/new', true, id, 3
FROM system_modules WHERE module_key = 'knowledge'
ON CONFLICT DO NOTHING;

-- analytics 模块页面
INSERT INTO system_pages (page_key, name_zh, route_path, is_enabled, module_id, sort_order)
SELECT 'analytics_main', '数据分析', '/admin/analytics', true, id, 1
FROM system_modules WHERE module_key = 'analytics'
ON CONFLICT DO NOTHING;

-- modules 模块页面
INSERT INTO system_pages (page_key, name_zh, route_path, is_enabled, module_id, sort_order)
SELECT 'modules_main', '模块管理', '/admin/modules', true, id, 1
FROM system_modules WHERE module_key = 'modules'
ON CONFLICT DO NOTHING;

-- ============================================================================
-- 5. 刷新 schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 6. 验证
-- ============================================================================
SELECT m.sort_order, m.module_key, m.name_zh, m.group_label, count(p.id) as pages
FROM system_modules m
LEFT JOIN system_pages p ON p.module_id = m.id
WHERE m.is_enabled = true
GROUP BY m.id
ORDER BY m.sort_order;
