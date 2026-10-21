-- ============================================================
-- 迁移: 109_trade_config
-- 说明: 交易配置中心（阶段四 #202608292700-统一订单与后台管理）
-- 统一管理所有交易相关的配置，管理员可动态修改，实时生效。
-- 分类: system(系统) / payment(支付) / membership(会员) / token(Token) / brand(品牌) / mall(商城) / withdraw(提现)
-- ============================================================

CREATE TABLE IF NOT EXISTS trade_config (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  config_key VARCHAR(100) NOT NULL UNIQUE,
  config_value JSONB NOT NULL,
  config_type VARCHAR(20) DEFAULT 'string' CHECK (config_type IN ('string', 'number', 'boolean', 'json', 'array')),
  description TEXT,
  category VARCHAR(50) DEFAULT 'system' CHECK (category IN ('system', 'payment', 'membership', 'token', 'brand', 'mall', 'withdraw')),
  is_active BOOLEAN DEFAULT true,
  updated_by UUID REFERENCES users(id),
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

COMMENT ON TABLE trade_config IS '交易配置中心';

-- 插入默认配置
INSERT INTO trade_config (config_key, config_value, config_type, description, category) VALUES
  -- 支付配置
  ('payment.wechat.enabled', '{"enabled": true}', 'boolean', '微信支付开关', 'payment'),
  ('payment.alipay.enabled', '{"enabled": false}', 'boolean', '支付宝支付开关', 'payment'),
  ('payment.default_method', '{"method": "wechat"}', 'string', '默认支付方式', 'payment'),
  ('payment.order_expire_minutes', '{"minutes": 30}', 'number', '订单默认过期时间（分钟）', 'payment'),

  -- 积分配置
  ('points.recharge_rate', '{"rate": 100}', 'number', '1元=多少积分', 'system'),
  ('points.withdraw_rate', '{"rate": 100}', 'number', '多少积分=1元', 'withdraw'),
  ('points.withdraw_min', '{"min": 100}', 'number', '最低提现积分', 'withdraw'),

  -- 会员配置
  ('membership.default_discount', '{"discount": 0.9}', 'number', '会员默认折扣', 'membership'),

  -- Token 配置
  ('token.enabled', '{"enabled": true}', 'boolean', 'Token 购买开关', 'token'),

  -- 商城配置
  ('mall.cash_enabled', '{"enabled": true}', 'boolean', '商城现金购买开关', 'mall'),

  -- 品牌配置
  ('brand.match_weights', '{
    "priority_level": 100,
    "rating": 50,
    "order_count": 30,
    "view_count": 10,
    "total_paid": 20
  }', 'json', '品牌匹配权重', 'brand')
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  updated_at = NOW();
