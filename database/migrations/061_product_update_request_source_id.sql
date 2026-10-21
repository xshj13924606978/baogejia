-- ============================================================================
-- 061: 产品修改请求增加 source_id，用于按提交批次汇总（问题 #20260821-1837）
-- 需求：一次批量导入覆盖会生成多条 product_update_requests，管理员端需要
--       按「一次提交」汇总展示，而不是每个产品一条记录。
-- 说明：
--   - source_id：批量导入覆盖时写入对应 upload.id；单条编辑时写入 request.id
--   - 已有历史数据：edit 类型回填为自身 id，import 类型无法反推 upload id，保持 NULL
--     （前端/后端对 NULL source_id 会按 request.id 分组，保持独立显示）
-- ============================================================================

ALTER TABLE public.product_update_requests
  ADD COLUMN IF NOT EXISTS source_id TEXT;

CREATE INDEX IF NOT EXISTS idx_product_update_requests_source_id
  ON public.product_update_requests (source_id);

-- 回填 edit 类型已有数据（自身即一个批次）
UPDATE public.product_update_requests
SET source_id = id::text
WHERE source_id IS NULL AND request_type = 'edit';
