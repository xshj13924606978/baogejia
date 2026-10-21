-- ============================================================
-- 迁移: 102_token_purchases
-- 说明: Token 购买记录表（阶段二 #202608292500-会员与Token套餐）
-- 订单流程: purchase 下单(status=pending, order_no=TK 前缀)
--   → 微信支付 → 回调到账(completed，token_balance += total_token)
-- 状态机: pending(待支付) → completed(已完成) → cancelled(已取消) / refunded(已退款)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. Token 购买记录表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS token_purchases (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  package_id UUID NOT NULL REFERENCES token_packages(id),
  order_no VARCHAR(50) NOT NULL,
  token_amount INTEGER NOT NULL,
  bonus_token INTEGER DEFAULT 0,
  total_token INTEGER NOT NULL, -- token_amount + bonus_token
  price DECIMAL(10,2) NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'refunded')),
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_token_purchases_user_id ON token_purchases(user_id);
CREATE INDEX IF NOT EXISTS idx_token_purchases_order_no ON token_purchases(order_no);
CREATE INDEX IF NOT EXISTS idx_token_purchases_status ON token_purchases(status);

COMMENT ON TABLE token_purchases IS 'Token购买记录表';
COMMENT ON COLUMN token_purchases.total_token IS '实际到账 Token 数 = token_amount + bonus_token';

COMMIT;
