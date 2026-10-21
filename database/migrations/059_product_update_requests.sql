-- ============================================================================
-- 059: 产品修改请求表（问题 #20260820-1130-2）
-- 需求：贡献者编辑自有产品 / 批量导入覆盖更新时，填写原因 → 进入管理员审批，
--       审批通过后更新 products 数据；审批不通过保持原数据。
-- 说明：
--   - original_data：修改前数据快照（用于展示差异与拒绝后保持原数据）
--   - new_data：修改/导入后的完整数据
--   - reason：修改原因（编辑或导入时填写）
--   - request_type：edit=单条编辑 | import=批量导入覆盖
--   - status：pending | approved | rejected
-- ============================================================================

CREATE TABLE IF NOT EXISTS public.product_update_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  product_id UUID NOT NULL,
  original_data JSONB,
  new_data JSONB NOT NULL,
  reason TEXT NOT NULL DEFAULT '',
  request_type VARCHAR(20) NOT NULL DEFAULT 'edit',
  status VARCHAR(20) NOT NULL DEFAULT 'pending',
  requester_id UUID,
  requester_name TEXT,
  reviewer_id UUID,
  review_comment TEXT,
  reviewed_at TIMESTAMPTZ,
  created_at TIMESTAMPTZ DEFAULT NOW()
);

CREATE INDEX IF NOT EXISTS idx_product_update_requests_status ON public.product_update_requests (status);
CREATE INDEX IF NOT EXISTS idx_product_update_requests_product ON public.product_update_requests (product_id);
CREATE INDEX IF NOT EXISTS idx_product_update_requests_requester ON public.product_update_requests (requester_id);
