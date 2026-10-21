-- 资料库权限：查看、下载、编辑、删除
-- 使用现有 system_actions / permission_overrides 权限框架
-- 默认按角色分配，管理员可在后台"系统配置-权限管理"实时调整
-- 创建时间: 2026-08-14

-- 1. 确保资料中心模块存在
INSERT INTO public.system_modules (id, module_key, name_zh, name_en, is_enabled, is_visible_in_menu, sort_order) VALUES
  ('a0000001-0000-0000-0000-000000000060', 'knowledge_center', '资料中心', 'Knowledge Center', true, true, 60)
ON CONFLICT DO NOTHING;

-- 2. 插入通用资料库页面
INSERT INTO public.system_pages (id, module_id, page_key, name_zh, route_path, layout_template, is_enabled) VALUES
  ('b0000001-0000-0000-0000-000000000260', 'a0000001-0000-0000-0000-000000000060', 'knowledge', '资料库', '/knowledge', 'list', true)
ON CONFLICT DO NOTHING;

-- 3. 插入资料库四项操作按钮（默认全部角色可见，再通过 permission_overrides 按角色关闭）
INSERT INTO public.system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
  ('d0000030-0000-0000-0000-000000000001', 'b0000001-0000-0000-0000-000000000260', 'view', '资料查看', '/api/knowledge', 'GET', true, 'knowledge.view', 1, '{"icon":"Eye","position":"row_action"}'),
  ('d0000030-0000-0000-0000-000000000002', 'b0000001-0000-0000-0000-000000000260', 'download', '资料下载', '/api/knowledge/download', 'POST', true, 'knowledge.download', 2, '{"icon":"Download","position":"row_action"}'),
  ('d0000030-0000-0000-0000-000000000003', 'b0000001-0000-0000-0000-000000000260', 'edit', '资料编辑', '/api/admin/knowledge', 'PATCH', true, 'knowledge.edit', 3, '{"icon":"Edit","position":"row_action"}'),
  ('d0000030-0000-0000-0000-000000000004', 'b0000001-0000-0000-0000-000000000260', 'delete', '资料删除', '/api/admin/knowledge', 'DELETE', true, 'knowledge.delete', 4, '{"icon":"Trash2","position":"row_action"}')
ON CONFLICT DO NOTHING;

-- 4. 角色默认覆盖：guest 不可下载
INSERT INTO public.permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, priority) VALUES
  ('role', 'guest', 'action', 'knowledge:download', false, 10)
ON CONFLICT DO NOTHING;

-- 5. 角色默认覆盖：sales / viewer / contributor / supplier / customer 不可编辑、不可删除
INSERT INTO public.permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, priority) VALUES
  ('role', 'sales', 'action', 'knowledge:edit', false, 10),
  ('role', 'sales', 'action', 'knowledge:delete', false, 10),
  ('role', 'viewer', 'action', 'knowledge:edit', false, 10),
  ('role', 'viewer', 'action', 'knowledge:delete', false, 10),
  ('role', 'contributor', 'action', 'knowledge:edit', false, 10),
  ('role', 'contributor', 'action', 'knowledge:delete', false, 10),
  ('role', 'supplier', 'action', 'knowledge:edit', false, 10),
  ('role', 'supplier', 'action', 'knowledge:delete', false, 10),
  ('role', 'customer', 'action', 'knowledge:edit', false, 10),
  ('role', 'customer', 'action', 'knowledge:delete', false, 10)
ON CONFLICT DO NOTHING;
