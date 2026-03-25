-- =============================================================================
-- 026_fix_menu_structure.sql
-- 修复菜单结构问题：积分概览冗余、积分规则重复、资料中心排序、模块管理重复
-- 执行时间：2026-03-25
-- =============================================================================

-- 1. 积分管理 → 纯父模块（不跳转，仅展开子菜单）
UPDATE system_modules SET route_path = NULL WHERE module_key = 'points';

-- 删除积分概览页面（冗余）
DELETE FROM system_pages WHERE page_key = 'points_overview'
  AND module_id = (SELECT id FROM system_modules WHERE module_key = 'points');

-- 2. 移除"积分管理"下的"积分规则配置"子菜单（保留独立的"积分规则管理"）
UPDATE system_modules SET is_visible_in_menu = false WHERE module_key = 'points_rules';

-- 3. 资料中心子页面排序（产品价格库 → 技术文档库 → 案例库 → 标准规范库 → 图纸图片库 → 定额库 → 全局搜索）
UPDATE system_pages SET sort_order = 1 WHERE page_key = 'price_library'    AND module_id = (SELECT id FROM system_modules WHERE module_key = 'knowledge_center');
UPDATE system_pages SET sort_order = 2 WHERE page_key = 'document_library' AND module_id = (SELECT id FROM system_modules WHERE module_key = 'knowledge_center');
UPDATE system_pages SET sort_order = 3 WHERE page_key = 'case_library'     AND module_id = (SELECT id FROM system_modules WHERE module_key = 'knowledge_center');
UPDATE system_pages SET sort_order = 4 WHERE page_key = 'standard_library' AND module_id = (SELECT id FROM system_modules WHERE module_key = 'knowledge_center');
UPDATE system_pages SET sort_order = 5 WHERE page_key = 'drawing_library'  AND module_id = (SELECT id FROM system_modules WHERE module_key = 'knowledge_center');
UPDATE system_pages SET sort_order = 6 WHERE page_key = 'quota_library'    AND module_id = (SELECT id FROM system_modules WHERE module_key = 'knowledge_center');
UPDATE system_pages SET sort_order = 7 WHERE page_key = 'global_search'    AND module_id = (SELECT id FROM system_modules WHERE module_key = 'knowledge_center');

-- 4. 隐藏"模块管理"菜单（功能由"动态配置"统一提供）
UPDATE system_modules SET is_visible_in_menu = false WHERE module_key = 'module';
