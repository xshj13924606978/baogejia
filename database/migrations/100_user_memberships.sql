-- ============================================================
-- 迁移: 100_user_memberships
-- 说明: 用户会员订阅表（阶段二 #202608292500-会员与Token套餐）
-- 订单流程: purchase 下单(status=pending, order_no=MB 前缀)
--   → 微信支付 → 回调激活(active) / 续费延长 end_date
-- 状态机: pending(待支付) → active(生效中) → expired(已过期)
--                               └ cancelled(已取消)
-- 唯一部分索引保证每用户最多一条 active 记录（续费走延长而非新增）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 用户会员订阅表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS user_memberships (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id UUID NOT NULL REFERENCES users(id),
  plan_id UUID NOT NULL REFERENCES membership_plans(id),
  order_no VARCHAR(50) NOT NULL,
  level_code VARCHAR(20) NOT NULL,
  start_date TIMESTAMPTZ NOT NULL,
  end_date TIMESTAMPTZ NOT NULL,
  status VARCHAR(20) NOT NULL DEFAULT 'active' CHECK (status IN ('active', 'expired', 'cancelled', 'pending')),
  auto_renew BOOLEAN DEFAULT false,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_user_memberships_user_id ON user_memberships(user_id);
CREATE INDEX IF NOT EXISTS idx_user_memberships_status ON user_memberships(status);
CREATE INDEX IF NOT EXISTS idx_user_memberships_end_date ON user_memberships(end_date);
CREATE UNIQUE INDEX IF NOT EXISTS idx_user_memberships_active ON user_memberships(user_id) WHERE status = 'active';

COMMENT ON TABLE user_memberships IS '用户会员订阅表';
COMMENT ON INDEX idx_user_memberships_active IS '每个用户只能有一条有效会员记录（续费时延长 end_date）';

COMMIT;
