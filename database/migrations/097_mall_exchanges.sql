-- ============================================================
-- 迁移: 097_mall_exchanges
-- 说明: 积分兑换记录表（积分兑换 + 现金购买 双通道）
--   （#202608292400-阶段一-积分提现与积分商城）
-- 关联: users（user_id 为 UUID）、mall_products
-- 状态机: pending(待处理/待支付) → completed(已完成/虚拟已发放)
--         └ shipped(已发货·实物) / cancelled(已取消) / refunded(已退款)
-- 现金购买：pay_order_no 复用微信 Native 统一下单（前缀 MX），
--   回调成功后将 status 从 pending 置为 completed（虚拟）或 shipped（实物）
-- ============================================================

BEGIN;

-- ------------------------------------------------------------
-- 1. 积分兑换记录表
-- ------------------------------------------------------------
CREATE TABLE IF NOT EXISTS mall_exchanges (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  exchange_no VARCHAR(64) NOT NULL UNIQUE,      -- 兑换单号（EX/MX 前缀，唯一）
  user_id UUID NOT NULL REFERENCES users(id),
  product_id UUID NOT NULL REFERENCES mall_products(id),
  product_name VARCHAR(200),                    -- 下单时商品快照（防商品改名）
  category VARCHAR(50),                         -- 下单时分类快照
  points_used INTEGER DEFAULT 0,
  cash_paid DECIMAL(10,2) DEFAULT 0,            -- 现金支付金额（元）
  quantity INTEGER DEFAULT 1,
  pay_method VARCHAR(20) DEFAULT 'points' CHECK (pay_method IN ('points', 'cash')),
  pay_order_no VARCHAR(64),                     -- 现金支付商户订单号（MX 前缀）
  status VARCHAR(20) NOT NULL DEFAULT 'pending' CHECK (status IN ('pending', 'completed', 'shipped', 'cancelled', 'refunded')),
  delivery_info JSONB,                          -- 物流信息/兑换码/权益发放记录
  remark TEXT,
  created_at TIMESTAMPTZ DEFAULT NOW(),
  updated_at TIMESTAMPTZ DEFAULT NOW()
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_mall_exchanges_user_id ON mall_exchanges(user_id);
CREATE INDEX IF NOT EXISTS idx_mall_exchanges_product_id ON mall_exchanges(product_id);
CREATE INDEX IF NOT EXISTS idx_mall_exchanges_status ON mall_exchanges(status);
CREATE INDEX IF NOT EXISTS idx_mall_exchanges_pay_order_no ON mall_exchanges(pay_order_no);

COMMENT ON TABLE mall_exchanges IS '积分兑换记录表（积分兑换 + 现金购买）';
COMMENT ON COLUMN mall_exchanges.exchange_no IS '兑换单号：EX+时间戳+随机（积分兑换） / MX+时间戳+随机（现金购买）';
COMMENT ON COLUMN mall_exchanges.pay_method IS '支付方式: points(积分兑换)/cash(现金购买)';
COMMENT ON COLUMN mall_exchanges.status IS '状态: pending(待处理/待支付), completed(已完成/虚拟已发放), shipped(已发货·实物), cancelled(已取消), refunded(已退款)';
COMMENT ON COLUMN mall_exchanges.delivery_info IS '发放记录: 虚拟商品(权益类型/发放时间/发放人)，实物(物流单号/快递公司/发货时间)';

-- ------------------------------------------------------------
-- 2. 库存扣减说明（#202608292800 修正）
--    原 AFTER UPDATE 触发器因积分兑换 INSERT 直接 completed 不触发、
--    现金购买 pay_method='cash' 条件不满足而失效，已移除。
--    库存扣减改为服务层原子扣减（src/lib/mall-service.ts）：
--      - 积分兑换：兑换时扣减（乐观锁，失败退还积分）
--      - 现金购买：交付/发货时扣减
--    已应用本迁移的环境请执行 111_fix_mall_stock_trigger.sql 清理残留触发器。
-- ------------------------------------------------------------

COMMIT;
