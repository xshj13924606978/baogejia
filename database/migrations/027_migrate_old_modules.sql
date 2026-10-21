-- 027: 迁移旧版功能模块至动态配置系统
-- 1. 新增 4 个功能模块（is_visible_in_menu=false，仅做权限管控，不在侧边栏显示）
-- 2. 删除"模块管理"菜单项及其子页面

-- 新增功能模块
INSERT INTO system_modules (module_key, name_zh, icon, sort_order, is_enabled, is_visible_in_menu, route_path, config)
VALUES
  ('chat', '智能对话', 'MessageSquare', 100, true, false, NULL, '{"type":"feature"}'),
  ('history', '历史记录', 'History', 101, true, false, NULL, '{"type":"feature"}'),
  ('export', '导出功能', 'Download', 102, true, false, NULL, '{"type":"feature"}'),
  ('api', 'API接口', 'Globe', 103, true, false, NULL, '{"type":"feature"}')
ON CONFLICT (module_key) DO NOTHING;

-- 删除"模块管理"菜单的子页面
DELETE FROM system_pages WHERE module_id = (SELECT id FROM system_modules WHERE module_key = 'module');

-- 删除"模块管理"菜单项
DELETE FROM system_modules WHERE module_key = 'module';
