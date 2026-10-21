-- ============================================================
-- 068_generate_quote_points_config.sql
-- 修复配置漂移：为生成报价单(generate_quote)补充独立的
-- site_config 配置键 generate_quote_points
--
-- 问题：POINTS_CONFIG_KEY_MAP.generate_quote 原先错误映射到
--       generate_proposal_points(30)，导致生成报价单按"生成方案"
--       的 30 分扣费，与 points_rules(quote_generate_consume=5)
--       及默认规则(5分)不一致。
-- 解决：新增 generate_quote_points=5 作为生成报价单的独立配置键，
--       服务层映射已同步修正为 generate_quote_points。
-- ============================================================

INSERT INTO site_config (config_key, config_value, config_type, category, label, description, is_public)
VALUES (
  'generate_quote_points',
  '5',
  'number',
  'points',
  '生成报价单积分',
  '生成报价单消耗的积分数',
  false
)
ON CONFLICT (config_key) DO NOTHING;

-- 与 points_rules 表对齐（quote_generate_consume 保持 5 分）
UPDATE points_rules
SET base_points = 5,
    rule_config = rule_config || '{"base_cost":5}'::jsonb
WHERE rule_key = 'quote_generate_consume'
  AND rule_type = 'consume';

NOTIFY pgrst, 'reload schema';
