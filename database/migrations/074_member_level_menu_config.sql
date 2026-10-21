-- =============================================================
-- 074_member_level_menu_config.sql
-- 等级权限配置菜单整合 + system_actions 死配置清理
-- 对话窗: [#20260824-MEMBERSHIP-OPT]
-- 1. 会员管理「等级配置」→「等级权限配置」（新路由 /admin/membership/level-permissions）
-- 2. 删除会员管理「字段权限」页（功能已合并到等级权限配置）
-- 3. 积分管理旧「等级权限配置」禁用（迁移至会员管理）
-- 4. 清理指向不存在 API 的 system_actions 死配置
-- =============================================================

-- 1. 等级配置 → 等级权限配置（保留原 page id，指向新路由）
UPDATE system_pages
SET page_key = 'membership_level_permissions',
    name_zh = '等级权限配置',
    route_path = '/admin/membership/level-permissions',
    updated_at = now()
WHERE id = 'b0000001-0000-0000-0000-000000000120';

-- 2. 删除会员管理「字段权限」页及其死配置 actions
--    （save/reset 指向 /api/admin/membership/field-permissions，该 API 不存在）
DELETE FROM system_actions WHERE page_id = 'b0000001-0000-0000-0000-000000000121';
DELETE FROM system_pages WHERE id = 'b0000001-0000-0000-0000-000000000121';

-- 3. 积分管理旧「等级权限配置」禁用（功能已迁移至会员管理）
UPDATE system_pages
SET is_enabled = false,
    updated_at = now()
WHERE id = 'b0000001-0000-0000-0000-000000000071';

-- 4. 等级权限配置页新增 actions（指向新统一 API）
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, permission_required, sort_order, created_at, updated_at)
VALUES
  ('b0000001-0000-0000-0000-000000000130', 'b0000001-0000-0000-0000-000000000120', 'create', '新增等级', '/api/admin/member-levels', 'POST', 'super_admin', 1, now(), now()),
  ('b0000001-0000-0000-0000-000000000131', 'b0000001-0000-0000-0000-000000000120', 'update', '更新等级', '/api/admin/member-levels/:levelCode', 'PUT', 'super_admin', 2, now(), now()),
  ('b0000001-0000-0000-0000-000000000132', 'b0000001-0000-0000-0000-000000000120', 'batch_update', '批量更新', '/api/admin/member-levels/batch-update', 'POST', 'super_admin', 3, now(), now()),
  ('b0000001-0000-0000-0000-000000000133', 'b0000001-0000-0000-0000-000000000120', 'reset', '恢复默认', '/api/admin/member-levels/reset-defaults', 'POST', 'super_admin', 4, now(), now()),
  ('b0000001-0000-0000-0000-000000000134', 'b0000001-0000-0000-0000-000000000120', 'delete', '删除等级', '/api/admin/member-levels/:levelCode', 'DELETE', 'super_admin', 5, now(), now())
ON CONFLICT (id) DO NOTHING;
