-- ============================================================
-- 迁移: 111_fix_mall_stock_trigger
-- 说明: 移除失效的商城库存扣减触发器（#202608292800 修复）
--
-- 背景：097 中的 AFTER UPDATE 触发器存在两个缺陷导致库存扣减失效：
--   1. 积分兑换虚拟商品通过 INSERT 直接 status='completed'，
--      AFTER UPDATE 触发器不会触发；
--   2. 现金购买记录 pay_method='cash'，触发器条件
--      IF NEW.pay_method = 'points' 不满足，同样不会扣减。
-- 修复：库存扣减已改为服务层原子扣减（src/lib/mall-service.ts，
--   乐观锁防并发超卖；积分兑换扣减 + 现金购买交付扣减）。
-- 本迁移仅清理已应用 097 的环境中残留的触发器与函数，
-- 避免与服务层扣减重复（如 points 实物确认收货时被触发器再次扣减）。
-- 幂等：可重复执行。
-- ============================================================

DROP TRIGGER IF EXISTS trg_mall_exchange_decrement_stock ON mall_exchanges;
DROP FUNCTION IF EXISTS decrement_mall_product_stock();
