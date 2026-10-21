-- ============================================================
-- 迁移: 112_brand_payments_fk_fix
-- 说明: 修复 brand_payments 缺失的 brand_id → brand_vendors(id) 外键
--   （#202608292600 品牌付费迁移 106 定义过该 FK，但生产库实际未创建，
--   导致 PostgREST 无法 embed brand:brand_vendors(...) → 管理端品牌付费记录
--   列表 400/500。表当前为空，添加约束无数据风险。）
-- 幂等: 约束存在则跳过
-- ============================================================

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'brand_payments_brand_id_fkey'
      AND conrelid = 'brand_payments'::regclass
  ) THEN
    ALTER TABLE brand_payments
      ADD CONSTRAINT brand_payments_brand_id_fkey
      FOREIGN KEY (brand_id) REFERENCES brand_vendors(id);
  END IF;
END $$;

-- 刷新 PostgREST schema cache，使 embed 关系立即生效
NOTIFY pgrst, 'reload schema';
