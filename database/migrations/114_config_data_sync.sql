-- ============================================================
-- 迁移: 114_config_data_sync
-- 说明: 配置数据动态同步（#202608302200）
-- trade_config 作为全系统统一数据源，补充此前缺失/未预置的配置 key：
--   - points.token_rate   1积分 = 多少Tokens（积分兑换规则页面写入）
--   - points.split_rates  资料下载积分分成比例（创作者/平台）
-- 已存在的 key（points.recharge_rate / points.withdraw_rate /
-- points.withdraw_min / membership.default_discount）保持不变。
-- ============================================================

-- 积分Token兑换比例（1积分=多少Tokens）
INSERT INTO trade_config (config_key, config_value, config_type, description, category) VALUES
  ('points.token_rate', '{"rate": 10}', 'number', '1积分=多少Tokens', 'system')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  config_type = EXCLUDED.config_type,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  updated_at = NOW();

-- 资料下载积分分成比例（创作者/平台）
INSERT INTO trade_config (config_key, config_value, config_type, description, category) VALUES
  ('points.split_rates', '{"creator_rate": 0.7, "platform_rate": 0.3}', 'json', '资料下载积分分成比例（创作者/平台）', 'system')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  config_type = EXCLUDED.config_type,
  description = EXCLUDED.description,
  category = EXCLUDED.category,
  updated_at = NOW();
