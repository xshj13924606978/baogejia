-- ============================================================
-- 迁移: 094_points_withdraw
-- 说明: 积分提现申请表 + 提现配置（site_config）
--   （#202608292400-阶段一-积分提现与积分商城）
-- 关联: users（user_id 为 UUID，提现需真实注册账号；
--   本地 token 用户 id=user-<ts>-<rand> 非 UUID，服务层拦截提示先正式注册）
-- 状态机: pending(待审核) → approved(审核通过) → paid(已打款)
--         └ rejected(已拒绝)     └ failed(打款失败)
-- 流程: 申请时扣减积分冻结 → 拒绝/失败退还积分 → 打款成功积分不退还
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 积分提现申请表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS points_withdraw (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  points INTEGER NOT NULL CHECK (points > 0),
  amount DECIMAL(10,2) NOT NULL, -- 兑换金额（元）
  rate DECIMAL(10,4) NOT NULL DEFAULT 100, -- 兑换比例：多少积分=1元，默认100
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'approved', 'rejected', 'paid', 'failed')),
  account_type VARCHAR(20) NOT NULL CHECK (account_type IN ('wechat', 'alipay', 'bank')),
  account_info JSONB NOT NULL, -- 账号信息（微信openid/支付宝账号/银行卡号）
  remark TEXT,
  approved_at TIMESTAMPTZ,
  approved_by UUID REFERENCES users(id),
  paid_at TIMESTAMPTZ,
  paid_by UUID REFERENCES users(id),
  paid_mode VARCHAR(20) DEFAULT 'auto', -- 打款方式：auto(自动打款) / manual(手动打款)
  transaction_id VARCHAR(100), -- 打款交易号
  reject_reason TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_points_withdraw_user_id ON points_withdraw(user_id);
CREATE INDEX IF NOT EXISTS idx_points_withdraw_status ON points_withdraw(status);
CREATE INDEX IF NOT EXISTS idx_points_withdraw_created_at ON points_withdraw(created_at DESC);

COMMENT ON TABLE points_withdraw IS '积分提现申请表';
COMMENT ON COLUMN points_withdraw.rate IS '兑换比例：多少积分=1元，默认100';
COMMENT ON COLUMN points_withdraw.status IS '提现状态: pending(待审核), approved(审核通过), rejected(已拒绝), paid(已打款), failed(打款失败)';
COMMENT ON COLUMN points_withdraw.account_info IS '账号信息：微信(openid)/支付宝(account,holder)/银行卡(bank_name,card_no,holder)';
COMMENT ON COLUMN points_withdraw.paid_mode IS '打款方式: auto(调用支付接口自动打款), manual(管理员手动打款后登记)';

-- ------------------------------------------------------------
-- 2. 提现配置（site_config，真实表结构 config_key/config_value）
-- ------------------------------------------------------------
INSERT INTO site_config (config_key, config_value, config_type, category, label, description, is_public) VALUES
  ('withdraw_min_points',   '100', 'number', 'withdraw', '最低提现积分',    '最低提现积分', false),
  ('withdraw_min_amount',   '1',   'number', 'withdraw', '最低提现金额',    '最低提现金额（元）', false),
  ('withdraw_rate',         '100', 'number', 'withdraw', '兑换比例',        '兑换比例：多少积分=1元，默认100', false),
  ('withdraw_fee_rate',     '0',   'number', 'withdraw', '提现手续费比例',  '提现手续费比例（0=无手续费，如 0.02 表示 2%）', false),
  ('withdraw_enabled',      'true','boolean','withdraw', '提现功能开关',    '提现功能开关', false)
ON CONFLICT (config_key) DO UPDATE SET
  config_value = EXCLUDED.config_value,
  description = EXCLUDED.description,
  updated_at = NOW();

COMMIT;
