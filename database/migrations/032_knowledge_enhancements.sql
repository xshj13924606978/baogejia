-- 知识库增强索引
-- 032_knowledge_enhancements.sql

-- 1. 为 metadata JSONB 字段创建 GIN 索引（加速 JSONB contains 查询）
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_metadata
  ON knowledge_entries USING GIN (metadata);

-- 2. 为 type + status + created_at 创建复合索引（加速列表查询）
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_type_status
  ON knowledge_entries (type, status, created_at DESC);

-- 3. 确保 content 字段存在
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS content TEXT;

-- 4. 确保 reject_reason 字段存在
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS reject_reason TEXT;

-- 5. 为 tags 关联表添加索引（如不存在）
CREATE INDEX IF NOT EXISTS idx_knowledge_entry_tags_entry_id
  ON knowledge_entry_tags (entry_id);

CREATE INDEX IF NOT EXISTS idx_knowledge_entry_tags_tag_id
  ON knowledge_entry_tags (tag_id);
