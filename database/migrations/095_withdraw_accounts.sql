-- ============================================================
-- 迁移: 095_withdraw_accounts
-- 说明: 用户提现账户表（微信/支付宝/银行卡，一用户一记录）
--   （#202608292400-阶段一-积分提现与积分商城）
-- 关联: users（user_id 为 UUID，唯一约束）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 用户提现账户表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS withdraw_accounts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id) UNIQUE,
  wechat_openid VARCHAR(100),   -- 微信支付收款openid
  alipay_account VARCHAR(100),  -- 支付宝账号
  bank_name VARCHAR(100),       -- 银行名称
  bank_card VARCHAR(50),        -- 银行卡号
  bank_holder VARCHAR(50),      -- 持卡人姓名
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_withdraw_accounts_user_id ON withdraw_accounts(user_id);

COMMENT ON TABLE withdraw_accounts IS '用户提现账户表';
COMMENT ON COLUMN withdraw_accounts.wechat_openid IS '微信支付收款openid（企业付款到零钱）';
COMMENT ON COLUMN withdraw_accounts.alipay_account IS '支付宝账号（手机号/邮箱）';

COMMIT;
