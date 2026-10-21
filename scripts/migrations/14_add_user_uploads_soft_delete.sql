-- 迁移 014：user_uploads 软删除支持
-- 普通用户删除记录 = 软删除（deleted_at/deleted_by），管理员最近记录仍可见并标注删除者
-- 管理员删除记录 = 硬删除（物理删除，不走本字段）
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES users(id) ON DELETE SET NULL;

-- 为管理员最近记录查询已删除记录建立索引
CREATE INDEX IF NOT EXISTS idx_user_uploads_deleted_at ON user_uploads (deleted_at) WHERE deleted_at IS NOT NULL;
