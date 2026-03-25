-- ============================================================================
-- 动态配置数据全量同步 SQL
-- 目标：让 system_modules / system_pages 的 module_key 与代码目录名完全对齐
-- 执行位置: Supabase Dashboard SQL Editor
-- ============================================================================

-- ============================================================================
-- 1. 修复主模块 key（与代码目录名对齐）
-- ============================================================================

-- user -> users
UPDATE system_modules SET module_key = 'users' WHERE module_key = 'user' AND parent_module_id IS NULL;

-- product -> products
UPDATE system_modules SET module_key = 'products' WHERE module_key = 'product' AND parent_module_id IS NULL;

-- quote -> quotes
UPDATE system_modules SET module_key = 'quotes' WHERE module_key = 'quote' AND parent_module_id IS NULL;

-- enterprise 保持不变（代码目录就是 enterprise）
-- audit 保持不变
-- membership 保持不变
-- points 保持不变
-- stats 保持不变
-- analytics 保持不变
-- knowledge 保持不变
-- system 保持不变
-- modules 保持不变

-- import-logs: 确认 key（应该已修复）
UPDATE system_modules SET module_key = 'import-logs' WHERE module_key = 'import_log' AND parent_module_id IS NULL;

-- knowledge_center -> knowledge-center（代码目录名是连字符）
UPDATE system_modules SET module_key = 'knowledge-center' WHERE module_key = 'knowledge_center' AND parent_module_id IS NULL;

-- system-config: 独立模块（目前归属于 system，需要拆出）
INSERT INTO system_modules (id, module_key, name_zh, icon, route_path, sort_order, is_enabled, is_visible_in_menu, group_label)
SELECT
  gen_random_uuid(),
  'system-config',
  '动态配置',
  'SlidersHorizontal',
  '/admin/system-config',
  52,
  true,
  true,
  '系统管理'
WHERE NOT EXISTS (SELECT 1 FROM system_modules WHERE module_key = 'system-config');

-- ============================================================================
-- 2. 清理冗余的空子模块
-- ============================================================================
DELETE FROM system_modules WHERE module_key IN ('points_levels', 'points_history', 'points_rules', 'import_log', 'points-rules') AND parent_module_id IS NOT NULL;

-- ============================================================================
-- 3. 修复页面的 route_path（统一使用代码目录风格）
-- ============================================================================
-- 详情页统一为 :id 参数风格（API 返回时会自动过滤，不影响菜单显示）

-- users 模块页面
UPDATE system_pages SET route_path = '/admin/users/:id' WHERE route_path = '/admin/users/:id';
UPDATE system_pages SET route_path = '/admin/users/:id/grant' WHERE route_path = '/admin/users/:id/grant';

-- enterprise 模块页面
UPDATE system_pages SET route_path = '/admin/enterprise/:id' WHERE route_path = '/admin/enterprise/:id';

-- audit 模块页面
UPDATE system_pages SET route_path = '/admin/audit/:id' WHERE route_path = '/admin/audit/:id';

-- products 模块页面
UPDATE system_pages SET route_path = '/admin/products/:id' WHERE route_path = '/admin/products/:id';

-- quotes 模块页面
UPDATE system_pages SET route_path = '/admin/quotes/:id' WHERE route_path = '/admin/quotes/:id';

-- import-logs 模块页面
UPDATE system_pages SET route_path = '/admin/import-logs/:id' WHERE route_path = '/admin/import-logs/:id';

-- ============================================================================
-- 4. 补充缺失的模块页面
-- ============================================================================

-- knowledge 模块缺少主页面 /admin/knowledge
INSERT INTO system_pages (id, page_key, name_zh, route_path, is_enabled, module_id, sort_order)
SELECT gen_random_uuid(), 'knowledge_list', '知识库列表', '/admin/knowledge', true, id, 1
FROM system_modules WHERE module_key = 'knowledge'
AND NOT EXISTS (
  SELECT 1 FROM system_pages sp
  JOIN system_modules sm ON sp.module_id = sm.id
  WHERE sm.module_key = 'knowledge' AND sp.route_path = '/admin/knowledge'
);

-- points 模块缺少主页面 /admin/points
INSERT INTO system_pages (id, page_key, name_zh, route_path, is_enabled, module_id, sort_order)
SELECT gen_random_uuid(), 'points_main', '积分管理', '/admin/points', true, id, 1
FROM system_modules WHERE module_key = 'points'
AND NOT EXISTS (
  SELECT 1 FROM system_pages sp
  JOIN system_modules sm ON sp.module_id = sm.id
  WHERE sm.module_key = 'points' AND sp.route_path = '/admin/points'
);

-- system-config 模块页面
INSERT INTO system_pages (id, page_key, name_zh, route_path, layout_template, is_enabled, module_id, sort_order)
SELECT gen_random_uuid(), 'system_config', '动态配置', '/admin/system-config', 'list', true, id, 1
FROM system_modules WHERE module_key = 'system-config'
AND NOT EXISTS (
  SELECT 1 FROM system_pages sp
  JOIN system_modules sm ON sp.module_id = sm.id
  WHERE sm.module_key = 'system-config' AND sp.route_path = '/admin/system-config'
);

-- ============================================================================
-- 5. 同步 layout.tsx 中的 icon 字段（确保与数据库一致）
-- ============================================================================
-- TrendingUp: analytics 已在 DB 中 ✓

-- ============================================================================
-- 6. 刷新 schema cache
-- ============================================================================
NOTIFY pgrst, 'reload schema';

-- ============================================================================
-- 7. 验证
-- ============================================================================
SELECT m.sort_order, m.module_key, m.name_zh, m.route_path, m.group_label, m.is_enabled,
  count(p.id) as page_count
FROM system_modules m
LEFT JOIN system_pages p ON p.module_id = m.id
WHERE m.parent_module_id IS NULL
GROUP BY m.id
ORDER BY m.sort_order;
