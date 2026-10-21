-- ============================================================================
-- 085_contributor_points_rules.sql
-- 贡献者积分规则入库（#[20260827-1030]-8）
--
-- 目标：消除 contributor service / invite-rewards / 前端展示的硬编码积分常量。
-- 把以下规则统一持久化到 points_rules 表（数据持久、动态生效）：
--   - 贡献者审核通过积分（按资料类型 product/document/case/standard/drawing/quota）
--   - 贡献者注册奖励、资料被采纳奖励
--   - 邀请关系积分（被邀请人 register / submit / review）
--   - 多级邀请积分（level1 / level2 / level3）
--   - 通用邀请码有效期（rule_config.expiry_days）
--
-- 说明：
--   1) points_rules.rule_key 已有唯一约束（见 013_unified_points_rules.sql），
--      本迁移用 ON CONFLICT (rule_key) DO UPDATE 保证幂等且可重复运行（管理员
--      在后台改值后再次应用仍能更新）。
--   2) 本迁移只增不改：不删除/不重命名任何既有规则/字段，兼容 013-084 全部能力。
--   3) exec_sql RPC 不支持事务块，因此每条 INSERT 独立执行；遇到错误重跑即可。
--   4) 【类型归一化】标准表结构中 conditions / user_roles 为 JSONB（见
--      014_fix_points_rules_schema.sql）。若执行库为旧版 text[] 数组类型，
--      '["a","b"]' 字面量会被当作数组解析而报 22P02 malformed array literal。
--      下方 DO 块自动检测并转为 JSONB（to_jsonb 保留原数组数据），自愈后插入。
-- ============================================================================

-- ============================================================
-- 0. 列类型归一化（自愈：兼容历史 text[] 结构 → JSONB）
--    标准结构见 014_fix_points_rules_schema.sql：
--      conditions JSONB DEFAULT '[]'
--      user_roles JSONB DEFAULT '["user","vip",...]'::jsonb
-- ============================================================
DO $$
DECLARE
  _col TEXT;
  _typ TEXT;
BEGIN
  FOR _col IN SELECT unnest(ARRAY['conditions', 'user_roles']) LOOP
    SELECT data_type INTO _typ
    FROM information_schema.columns
    WHERE table_name = 'points_rules' AND column_name = _col;

    IF _typ = 'ARRAY' THEN
      EXECUTE format(
        'ALTER TABLE points_rules ALTER COLUMN %I TYPE JSONB USING to_jsonb(%I)',
        _col, _col
      );
      RAISE NOTICE 'points_rules.% converted from ARRAY to JSONB', _col;
    END IF;
  END LOOP;
END $$;

-- 1. 贡献者审核通过积分（按资料类型 6 项）
INSERT INTO points_rules (
  rule_key, rule_name, rule_description,
  rule_type, operation_type,
  base_points, points_formula,
  max_points_per_day, max_points_total,
  conditions, user_level_min, user_level_max, user_roles,
  is_active, is_system_rule, priority,
  rule_config, discount_config
) VALUES
  (
    'contributor_upload_product', '产品价格审核通过', '贡献者上传产品价格资料经审核通过奖励积分',
    'reward', 'contributor_review', 50, 'fixed',
    NULL, NULL, '[]', 1, 5, '["contributor","manufacturer","admin","super_admin"]',
    true, true, 75,
    '{"points":50,"trigger":"contributor_review","asset_type":"product","total_limit":null}'::jsonb,
    '{}'::jsonb
  ),
  (
    'contributor_upload_document', '技术文档审核通过', '贡献者上传技术文档经审核通过奖励积分',
    'reward', 'contributor_review', 80, 'fixed',
    NULL, NULL, '[]', 1, 5, '["contributor","manufacturer","admin","super_admin"]',
    true, true, 75,
    '{"points":80,"trigger":"contributor_review","asset_type":"document","total_limit":null}'::jsonb,
    '{}'::jsonb
  ),
  (
    'contributor_upload_case', '工程案例审核通过', '贡献者上传工程案例经审核通过奖励积分',
    'reward', 'contributor_review', 60, 'fixed',
    NULL, NULL, '[]', 1, 5, '["contributor","manufacturer","admin","super_admin"]',
    true, true, 75,
    '{"points":60,"trigger":"contributor_review","asset_type":"case","total_limit":null}'::jsonb,
    '{}'::jsonb
  ),
  (
    'contributor_upload_standard', '标准规范审核通过', '贡献者上传标准规范经审核通过奖励积分',
    'reward', 'contributor_review', 80, 'fixed',
    NULL, NULL, '[]', 1, 5, '["contributor","manufacturer","admin","super_admin"]',
    true, true, 75,
    '{"points":80,"trigger":"contributor_review","asset_type":"standard","total_limit":null}'::jsonb,
    '{}'::jsonb
  ),
  (
    'contributor_upload_drawing', '图纸图片审核通过', '贡献者上传图纸/图片经审核通过奖励积分',
    'reward', 'contributor_review', 40, 'fixed',
    NULL, NULL, '[]', 1, 5, '["contributor","manufacturer","admin","super_admin"]',
    true, true, 75,
    '{"points":40,"trigger":"contributor_review","asset_type":"drawing","total_limit":null}'::jsonb,
    '{}'::jsonb
  ),
  (
    'contributor_upload_quota', '定额资料审核通过', '贡献者上传定额资料经审核通过奖励积分',
    'reward', 'contributor_review', 50, 'fixed',
    NULL, NULL, '[]', 1, 5, '["contributor","manufacturer","admin","super_admin"]',
    true, true, 75,
    '{"points":50,"trigger":"contributor_review","asset_type":"quota","total_limit":null}'::jsonb,
    '{}'::jsonb
  )
ON CONFLICT (rule_key) DO UPDATE
SET rule_name = EXCLUDED.rule_name,
    rule_description = EXCLUDED.rule_description,
    base_points = EXCLUDED.base_points,
    rule_config = EXCLUDED.rule_config,
    is_active = EXCLUDED.is_active,
    is_system_rule = EXCLUDED.is_system_rule,
    priority = EXCLUDED.priority,
    updated_at = NOW();

-- 2. 贡献者注册奖励
INSERT INTO points_rules (
  rule_key, rule_name, rule_description,
  rule_type, operation_type,
  base_points, points_formula,
  max_points_per_day, max_points_total,
  conditions, user_level_min, user_level_max, user_roles,
  is_active, is_system_rule, priority,
  rule_config, discount_config
) VALUES
  (
    'contributor_register', '注册成为贡献者', '用户注册成为贡献者后获得的奖励积分',
    'reward', 'contributor_register', 100, 'fixed',
    1, 1, '[]', 1, 5, '["contributor","manufacturer","admin","super_admin"]',
    true, true, 96,
    '{"points":100,"trigger":"contributor_register","total_limit":1}'::jsonb,
    '{}'::jsonb
  )
ON CONFLICT (rule_key) DO UPDATE
SET rule_name = EXCLUDED.rule_name,
    rule_description = EXCLUDED.rule_description,
    base_points = EXCLUDED.base_points,
    rule_config = EXCLUDED.rule_config,
    is_active = EXCLUDED.is_active,
    is_system_rule = EXCLUDED.is_system_rule,
    priority = EXCLUDED.priority,
    updated_at = NOW();

-- 3. 资料被采纳奖励（admin 标记采纳时额外奖励）
INSERT INTO points_rules (
  rule_key, rule_name, rule_description,
  rule_type, operation_type,
  base_points, points_formula,
  max_points_per_day, max_points_total,
  conditions, user_level_min, user_level_max, user_roles,
  is_active, is_system_rule, priority,
  rule_config, discount_config
) VALUES
  (
    'contributor_adopt', '贡献者资料被采纳', '贡献者资料被管理员标记为「采纳」获得的奖励积分',
    'reward', 'contributor_adopt', 100, 'fixed',
    NULL, NULL, '[]', 1, 5, '["contributor","manufacturer","admin","super_admin"]',
    true, true, 74,
    '{"points":100,"trigger":"contributor_adopt","total_limit":null}'::jsonb,
    '{}'::jsonb
  )
ON CONFLICT (rule_key) DO UPDATE
SET rule_name = EXCLUDED.rule_name,
    rule_description = EXCLUDED.rule_description,
    base_points = EXCLUDED.base_points,
    rule_config = EXCLUDED.rule_config,
    is_active = EXCLUDED.is_active,
    is_system_rule = EXCLUDED.is_system_rule,
    priority = EXCLUDED.priority,
    updated_at = NOW();

-- 4. 邀请关系积分（被邀请人 register / submit / review）
INSERT INTO points_rules (
  rule_key, rule_name, rule_description,
  rule_type, operation_type,
  base_points, points_formula,
  max_points_per_day, max_points_total,
  conditions, user_level_min, user_level_max, user_roles,
  is_active, is_system_rule, priority,
  rule_config, discount_config
) VALUES
  (
    'invite_register', '被邀请人注册奖励', '被邀请人使用邀请码完成注册后获得的奖励积分',
    'reward', 'invite_reward', 20, 'fixed',
    NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","contributor","admin","super_admin"]',
    true, true, 73,
    '{"points":20,"trigger":"invite_register","total_limit":null}'::jsonb,
    '{}'::jsonb
  ),
  (
    'invite_submit', '被邀请人提交资料奖励', '被邀请人提交第一份贡献资料后获得的奖励积分',
    'reward', 'invite_reward', 30, 'fixed',
    NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","contributor","admin","super_admin"]',
    true, true, 73,
    '{"points":30,"trigger":"invite_submit","total_limit":null}'::jsonb,
    '{}'::jsonb
  ),
  (
    'invite_review', '被邀请人资料审核通过奖励', '被邀请人上传的资料审核通过，邀请人获得的奖励积分',
    'reward', 'invite_reward', 50, 'fixed',
    NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","contributor","admin","super_admin"]',
    true, true, 73,
    '{"points":50,"trigger":"invite_review","total_limit":null}'::jsonb,
    '{}'::jsonb
  )
ON CONFLICT (rule_key) DO UPDATE
SET rule_name = EXCLUDED.rule_name,
    rule_description = EXCLUDED.rule_description,
    base_points = EXCLUDED.base_points,
    rule_config = EXCLUDED.rule_config,
    is_active = EXCLUDED.is_active,
    is_system_rule = EXCLUDED.is_system_rule,
    priority = EXCLUDED.priority,
    updated_at = NOW();

-- 5. 多级邀请积分（一级/二级/三级）
INSERT INTO points_rules (
  rule_key, rule_name, rule_description,
  rule_type, operation_type,
  base_points, points_formula,
  max_points_per_day, max_points_total,
  conditions, user_level_min, user_level_max, user_roles,
  is_active, is_system_rule, priority,
  rule_config, discount_config
) VALUES
  (
    'invite_level1', '多级邀请-一级好友', '被邀请的下级用户产生消费/贡献时，一级邀请人获得的奖励积分',
    'reward', 'invite_reward', 50, 'fixed',
    NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","contributor","admin","super_admin"]',
    true, true, 72,
    '{"points":50,"trigger":"invite_level1","level":1,"total_limit":null}'::jsonb,
    '{}'::jsonb
  ),
  (
    'invite_level2', '多级邀请-二级好友', '被邀请的下级用户产生消费/贡献时，二级邀请人获得的奖励积分',
    'reward', 'invite_reward', 10, 'fixed',
    NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","contributor","admin","super_admin"]',
    true, true, 71,
    '{"points":10,"trigger":"invite_level2","level":2,"total_limit":null}'::jsonb,
    '{}'::jsonb
  ),
  (
    'invite_level3', '多级邀请-三级好友', '被邀请的下级用户产生消费/贡献时，三级邀请人获得的奖励积分',
    'reward', 'invite_reward', 5, 'fixed',
    NULL, NULL, '[]', 1, 5, '["user","vip","manufacturer","contributor","admin","super_admin"]',
    true, true, 70,
    '{"points":5,"trigger":"invite_level3","level":3,"total_limit":null}'::jsonb,
    '{}'::jsonb
  )
ON CONFLICT (rule_key) DO UPDATE
SET rule_name = EXCLUDED.rule_name,
    rule_description = EXCLUDED.rule_description,
    base_points = EXCLUDED.base_points,
    rule_config = EXCLUDED.rule_config,
    is_active = EXCLUDED.is_active,
    is_system_rule = EXCLUDED.is_system_rule,
    priority = EXCLUDED.priority,
    updated_at = NOW();

-- 6. 通用邀请码有效期（天数写入 rule_config.expiry_days，base_points=0）
INSERT INTO points_rules (
  rule_key, rule_name, rule_description,
  rule_type, operation_type,
  base_points, points_formula,
  max_points_per_day, max_points_total,
  conditions, user_level_min, user_level_max, user_roles,
  is_active, is_system_rule, priority,
  rule_config, discount_config
) VALUES
  (
    'contributor_universal_invite_expiry', '通用邀请码有效期', '通用邀请码的有效期天数，base_points=0 仅作配置使用',
    'reward', 'invite_config', 0, 'fixed',
    NULL, NULL, '[]', 1, 5, '["contributor","manufacturer","admin","super_admin"]',
    true, true, 60,
    '{"expiry_days":30,"trigger":"contributor_universal_invite_expiry","total_limit":null}'::jsonb,
    '{}'::jsonb
  )
ON CONFLICT (rule_key) DO UPDATE
SET rule_name = EXCLUDED.rule_name,
    rule_description = EXCLUDED.rule_description,
    rule_config = EXCLUDED.rule_config,
    is_active = EXCLUDED.is_active,
    is_system_rule = EXCLUDED.is_system_rule,
    priority = EXCLUDED.priority,
    updated_at = NOW();