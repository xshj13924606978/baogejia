-- Migration: 076_user_list_batch_actions_and_layout
-- Purpose: 为用户列表页增加批量操作按钮配置，并优化列表字段宽度以改善容器内显示
-- Issue: #[20260825-0825]

BEGIN;

-- 1. 优化用户列表字段宽度，减少表格总宽度，降低在小屏/中等屏幕上出现横向滚动的概率
UPDATE system_fields
SET config = jsonb_set(
  config,
  '{width}',
  (CASE field_key
    WHEN 'email' THEN '180'
    WHEN 'username' THEN '120'
    WHEN 'full_name' THEN '100'
    WHEN 'role' THEN '100'
    WHEN 'status' THEN '80'
    WHEN 'phone' THEN '110'
    WHEN 'points' THEN '80'
    WHEN 'level' THEN '70'
    WHEN 'created_at' THEN '150'
    ELSE config->>'width'
  END)::jsonb
)
WHERE page_id = 'b0000001-0000-0000-0000-000000000010'
  AND field_key IN ('email', 'username', 'full_name', 'role', 'status', 'phone', 'points', 'level', 'created_at');

-- 2. 为用户列表页增加批量操作配置
INSERT INTO system_actions (id, page_id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config) VALUES
  ('d0000001-0000-0000-0000-000000000007', 'b0000001-0000-0000-0000-000000000010', 'batch_enable',  '批量启用', '/api/admin/users/batch', 'POST', true, 'user.edit',   7, '{"icon": "CheckCircle", "buttonType": "primary", "position": "batch_action", "batchSupport": true, "confirmMessage": "确定启用选中的用户吗？"}'),
  ('d0000001-0000-0000-0000-000000000008', 'b0000001-0000-0000-0000-000000000010', 'batch_disable', '批量禁用', '/api/admin/users/batch', 'POST', true, 'user.edit',   8, '{"icon": "Ban", "buttonType": "warning", "position": "batch_action", "batchSupport": true, "confirmMessage": "确定禁用选中的用户吗？"}'),
  ('d0000001-0000-0000-0000-000000000009', 'b0000001-0000-0000-0000-000000000010', 'batch_export',  '批量导出', '/api/admin/users/batch', 'POST', true, 'user.export', 9, '{"icon": "Download", "position": "batch_action", "batchSupport": true}'),
  ('d0000001-0000-0000-0000-000000000010', 'b0000001-0000-0000-0000-000000000010', 'batch_delete',  '批量删除', '/api/admin/users/batch', 'POST', true, 'user.delete', 10, '{"icon": "Trash2", "buttonType": "danger", "position": "batch_action", "batchSupport": true, "confirmMessage": "确定删除选中的用户吗？"}')
ON CONFLICT (page_id, action_key) DO UPDATE SET
  name_zh = EXCLUDED.name_zh,
  api_endpoint = EXCLUDED.api_endpoint,
  http_method = EXCLUDED.http_method,
  is_visible = EXCLUDED.is_visible,
  permission_required = EXCLUDED.permission_required,
  sort_order = EXCLUDED.sort_order,
  config = EXCLUDED.config;

COMMIT;
