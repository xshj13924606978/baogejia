-- 033: 为 knowledge_entries 表添加 reject_reason 列
-- 修复审核拒绝功能 500 错误

ALTER TABLE knowledge_entries
ADD COLUMN IF NOT EXISTS reject_reason TEXT;

COMMENT ON COLUMN knowledge_entries.reject_reason IS '拒绝原因（审核拒绝时填写）';
