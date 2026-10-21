-- ============================================================
-- 迁移: 092_recharge_orders
-- 说明: 创建积分充值订单表，支撑微信支付 Native 扫码充值全流程
--   （统一下单 → 回调 → 加积分 → 状态更新），含幂等与金额校验所需字段。
-- 关联: users（user_id 为 TEXT 兼容 UUID / 本地 token 用户 id=user-<ts>-<rand>）
-- 状态机: pending(待支付) → completed(已完成) / cancelled(已取消) / expired(已过期) / failed(失败)
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 充值订单表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS recharge_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no VARCHAR(64) NOT NULL UNIQUE,          -- 商户订单号（{prefix}{timestamp}{random}）
  user_id TEXT NOT NULL,                          -- 用户标识（TEXT 兼容 UUID / 本地 token 用户）
  plan_id VARCHAR(64) NOT NULL,                   -- 充值套餐 ID（recharge_10 / recharge_50 / ...）
  points INTEGER NOT NULL,                        -- 本次充值积分数量
  amount DECIMAL(10, 2) NOT NULL,                 -- 订单金额（元）
  status VARCHAR(20) NOT NULL DEFAULT 'pending',  -- pending / completed / cancelled / expired / failed
  transaction_id VARCHAR(64),                     -- 微信支付交易号（回调后写入）
  paid_at TIMESTAMPTZ,                            -- 实际支付时间
  expires_at TIMESTAMPTZ,                         -- 订单过期时间（默认 30 分钟）
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_recharge_orders_user_id ON recharge_orders(user_id);
CREATE INDEX IF NOT EXISTS idx_recharge_orders_order_no ON recharge_orders(order_no);
CREATE INDEX IF NOT EXISTS idx_recharge_orders_status ON recharge_orders(status);
CREATE INDEX IF NOT EXISTS idx_recharge_orders_created_at ON recharge_orders(created_at);

COMMENT ON TABLE recharge_orders IS '积分充值订单表：支撑微信支付 Native 扫码充值（统一下单/回调/积分到账）';
COMMENT ON COLUMN recharge_orders.status IS '订单状态: pending(待支付), completed(已完成), cancelled(已取消), expired(已过期), failed(失败)';
COMMENT ON COLUMN recharge_orders.points IS '本次充值积分数量（回调确认后调用 add_points_atomic 入账）';

COMMIT;
