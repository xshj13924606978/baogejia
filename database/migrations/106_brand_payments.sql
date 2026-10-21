-- ============================================================
-- 迁移: 106_brand_payments
-- 说明: 品牌付费记录表（阶段三 #202608292600-厂商付费推广）
-- 订单流程: purchase 下单(status=pending, order_no=BP 前缀)
--   → 微信支付 → 回调开通权益(completed，更新 brand_vendors 等级)
-- 状态机: pending(待支付) → completed(已完成) → cancelled(已取消) / refunded(已退款)
-- 关联: brand_vendors（品牌）、brand_packages（套餐）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 品牌付费记录表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS brand_payments (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  brand_id UUID NOT NULL REFERENCES brand_vendors(id),
  user_id UUID NOT NULL REFERENCES users(id),
  package_id UUID NOT NULL REFERENCES brand_packages(id),
  order_no VARCHAR(50) NOT NULL,
  amount DECIMAL(10,2) NOT NULL,
  priority_level INTEGER NOT NULL,
  duration_days INTEGER NOT NULL,
  boost_score INTEGER DEFAULT 0,
  match_boost INTEGER DEFAULT 0,
  is_verified BOOLEAN DEFAULT false,
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'cancelled', 'refunded')),
  start_date TIMESTAMPTZ,
  end_date TIMESTAMPTZ,
  completed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX idx_brand_payments_brand_id ON brand_payments(brand_id);
CREATE INDEX idx_brand_payments_order_no ON brand_payments(order_no);
CREATE INDEX idx_brand_payments_status ON brand_payments(status);
CREATE INDEX idx_brand_payments_user_id ON brand_payments(user_id);

COMMENT ON TABLE brand_payments IS '品牌付费记录表';
COMMENT ON COLUMN brand_payments.priority_level IS '购买时快照的优先等级（套餐可能变更，以快照为准）';
COMMENT ON COLUMN brand_payments.end_date IS '权益到期时间（开通时 = 已有权益最大到期日 + duration_days 或 now + duration_days）';

COMMIT;
