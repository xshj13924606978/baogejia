-- 知识库条目操作日志
-- 在 knowledge_entries 上新增 audit_logs JSONB 数组字段
-- 每条日志格式：
-- {
--   "id": string,
--   "action": "create" | "edit" | "approve" | "reject" | "delete" | "batch_approve" | "batch_reject",
--   "operator_id": string,
--   "operator_name": string | null,
--   "timestamp": string (ISO 8601),
--   "details": object | null,
--   "reason": string | null
-- }

ALTER TABLE knowledge_entries
  ADD COLUMN IF NOT EXISTS audit_logs JSONB NOT NULL DEFAULT '[]'::jsonb;

COMMENT ON COLUMN knowledge_entries.audit_logs IS '知识库条目操作审计日志（按时间顺序追加）';

-- 追加审计日志（避免读改写竞态）
CREATE OR REPLACE FUNCTION knowledge_append_audit_log(
  p_entry_id UUID,
  p_log JSONB
) RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  UPDATE knowledge_entries
  SET audit_logs = COALESCE(audit_logs, '[]'::jsonb) || p_log
  WHERE id = p_entry_id;
END;
$$;

GRANT EXECUTE ON FUNCTION knowledge_append_audit_log(UUID, JSONB) TO authenticated, service_role;
