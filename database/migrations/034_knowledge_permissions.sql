-- 034: 知识库权限 + 积分规则
-- 1. 插入知识库相关积分规则（超管可在 /admin/points-rules 修改）
-- 2. 为等级 1-5 配置知识库权限覆盖

-- =====================================================
-- 积分规则：插入知识库上传奖励和下载消费规则
-- =====================================================
INSERT INTO points_rules (
  rule_key, rule_name, rule_description, rule_type, operation_type,
  base_points, points_formula, is_active, is_system_rule, priority,
  rule_config, user_level_min, user_level_max
) VALUES
  (
    'knowledge_upload_reward',
    '知识库上传奖励',
    '用户上传的文件经管理员审核通过后获得积分奖励',
    'reward', 'task_reward',
    20, 'fixed', true, true, 100,
    '{"points": 20, "trigger_condition": "admin_approve", "daily_limit": null, "total_limit": null}'::jsonb,
    1, 5
  ),
  (
    'knowledge_download_cost',
    '知识库下载消费',
    '用户下载知识库文件时消耗积分',
    'consume', 'exchange',
    -5, 'fixed', true, true, 100,
    '{"base_cost": 5, "unit_cost": 0, "unit_type": "fixed", "min_balance": 0}'::jsonb,
    1, 5
  )
ON CONFLICT DO NOTHING;

-- =====================================================
-- 权限覆盖：为各等级配置知识库操作权限
-- 等级1(免费): 只能查看已通过的条目
-- 等级2(普通): 查看 + 下载
-- 等级3(VIP): 查看 + 下载
-- 等级4(企业): 查看 + 下载
-- 等级5(超管): 全部权限
-- =====================================================

-- 等级1: 只能查看（不能下载）
INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable)
VALUES
  ('level', '1', 'action', 'knowledge.download', false, false),
  ('level', '1', 'action', 'knowledge.upload', true, false)
ON CONFLICT (target_type, target_id, permission_type, permission_key) DO UPDATE SET is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable;

-- 等级2-5: 可下载
INSERT INTO permission_overrides (target_type, target_id, permission_type, permission_key, is_visible, is_editable)
VALUES
  ('level', '2', 'action', 'knowledge.download', true, false),
  ('level', '2', 'action', 'knowledge.upload', true, false),
  ('level', '3', 'action', 'knowledge.download', true, false),
  ('level', '3', 'action', 'knowledge.upload', true, false),
  ('level', '4', 'action', 'knowledge.download', true, false),
  ('level', '4', 'action', 'knowledge.upload', true, false),
  ('level', '5', 'action', 'knowledge.download', true, false),
  ('level', '5', 'action', 'knowledge.upload', true, false)
ON CONFLICT (target_type, target_id, permission_type, permission_key) DO UPDATE SET is_visible = EXCLUDED.is_visible, is_editable = EXCLUDED.is_editable;
