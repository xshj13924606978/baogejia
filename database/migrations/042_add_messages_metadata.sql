-- =============================================================================
-- 042_add_messages_metadata.sql
-- 为 messages 表添加 metadata 列，保存品牌对比、意图分析等结构化数据
-- 问题：之前 metadata 数据嵌入在 content 的 HTML 注释中，页面刷新后丢失
-- 执行时间：2026/08/08
-- =============================================================================

-- 添加 metadata 列（JSONB 类型，兼容 Supabase，支持索引和查询）
ALTER TABLE messages
ADD COLUMN IF NOT EXISTS metadata JSONB DEFAULT NULL;

-- 完成提示
DO $$
BEGIN
    RAISE NOTICE '========================================';
    RAISE NOTICE '042 迁移完成！';
    RAISE NOTICE '已为 messages 表添加 metadata 列 (JSONB)';
    RAISE NOTICE '========================================';
END $$;
