-- ============================================================
-- 迁移: 108_unified_orders
-- 说明: 统一订单表（阶段四 #202608292700-统一订单与后台管理）
-- 整合所有交易类型：充值(recharge)/商城(mall)/会员(membership)/Token(token)/品牌(brand)
-- 记录策略：各业务模块下单/支付回调时通过 orderService.syncOrderFromBusiness()
--   upsert 到本表（ON CONFLICT order_no 幂等），历史订单无需迁移。
-- 状态机: pending → paid → completed → refunding → refunded
--                └ cancelled / failed
-- 关联: 各业务订单表通过 business_id + business_type 关联
-- ============================================================

CREATE TABLE IF NOT EXISTS unified_orders (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  order_no VARCHAR(50) NOT NULL UNIQUE,
  user_id UUID NOT NULL REFERENCES users(id),
  order_type VARCHAR(20) NOT NULL CHECK (order_type IN (
    'recharge',    -- 积分充值
    'mall',        -- 积分商城
    'membership',  -- 会员购买
    'token',       -- Token购买
    'brand'        -- 品牌付费
  )),
  -- 订单金额
  amount DECIMAL(10,2) NOT NULL,
  currency VARCHAR(3) DEFAULT 'CNY',
  -- 支付信息
  payment_method VARCHAR(20) CHECK (payment_method IN ('wechat', 'alipay', 'balance')),
  payment_id VARCHAR(100), -- 第三方支付流水号
  paid_at TIMESTAMPTZ,
  -- 订单状态
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN (
    'pending',     -- 待支付
    'paid',        -- 已支付
    'completed',   -- 已完成（权益已发放）
    'cancelled',   -- 已取消
    'refunding',   -- 退款中
    'refunded',    -- 已退款
    'failed'       -- 支付失败
  )),
  -- 关联业务
  business_id UUID, -- 关联的业务记录ID（如 recharge_orders.id / user_memberships.id）
  business_type VARCHAR(50), -- 业务类型
  -- 扩展信息
  metadata JSONB, -- 订单扩展信息（套餐名称、积分数量等）
  remark TEXT,
  expired_at TIMESTAMPTZ, -- 订单过期时间
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX idx_unified_orders_user_id ON unified_orders(user_id);
CREATE INDEX idx_unified_orders_order_no ON unified_orders(order_no);
CREATE INDEX idx_unified_orders_status ON unified_orders(status);
CREATE INDEX idx_unified_orders_type ON unified_orders(order_type);
CREATE INDEX idx_unified_orders_created_at ON unified_orders(created_at DESC);
CREATE INDEX idx_unified_orders_paid_at ON unified_orders(paid_at);
CREATE INDEX idx_unified_orders_user_status ON unified_orders(user_id, status);

COMMENT ON TABLE unified_orders IS '统一订单表（整合所有交易类型）';
COMMENT ON COLUMN unified_orders.business_id IS '关联的业务记录ID（如 recharge_orders.id）';
COMMENT ON COLUMN unified_orders.business_type IS '业务类型（如 recharge_orders）';
