-- 13_add_user_uploads_columns.sql
-- 目的：补齐 user_uploads 表缺失列，与 ORM schema (src/storage/database/shared/schema.ts) 对齐。
-- 背景：01_initial_schema.sql 中 user_uploads 表缺少 type/title/description/file_url 等列，
--       导致 /api/upload 保存记录时 PostgREST 报 PGRST204（找不到 description 列）。
-- 全部使用 ADD COLUMN IF NOT EXISTS，幂等，可安全重复执行。
-- 注意：reviewed_by / reviewed_at 列暂无功能使用且涉及类型推断，本次不补。

ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS type VARCHAR(50);
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS title VARCHAR(200);
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS description TEXT;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS file_url TEXT;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS points_awarded INTEGER;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS views INTEGER DEFAULT 0;
ALTER TABLE user_uploads ADD COLUMN IF NOT EXISTS downloads INTEGER DEFAULT 0;
