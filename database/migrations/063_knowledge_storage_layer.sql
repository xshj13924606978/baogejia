-- ============================================================================
-- 063_knowledge_storage_layer.sql
-- 知识库存储层重构：pgvector 全文/向量检索 + 签名 URL 下载基础设施
-- 对话窗：#20260822-2242-9A 指令 1/3
--
-- 说明：
--   - 本文件为迁移记录，实际执行请通过 POST /api/migrate/knowledge-storage-layer
--   - storage bucket（knowledge）与 CORS 由迁移 API 通过 storage API 创建
--   - exec_sql RPC 不支持事务块和 DO $$ 块，每条语句独立执行
-- ============================================================================

-- 1. 启用 pgvector 扩展
CREATE EXTENSION IF NOT EXISTS vector;

-- 2. 扩展 knowledge_entries 表（兼容已有列，幂等）
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS content_text TEXT;
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS keywords TEXT[] DEFAULT '{}';
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS summary TEXT;
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS embedding vector(1536);
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS search_tsv tsvector;
-- 签名 URL 下载所需：存储路径与所属 bucket（存量数据回退 file_key / knowledge-base）
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS storage_path TEXT;
ALTER TABLE knowledge_entries ADD COLUMN IF NOT EXISTS storage_bucket TEXT DEFAULT 'knowledge-base';

-- 3. 全文检索索引（search_tsv GIN）
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_search_tsv
  ON knowledge_entries USING GIN (search_tsv);

-- 4. 向量索引（embedding ivfflat cosine）
CREATE INDEX IF NOT EXISTS idx_knowledge_entries_embedding
  ON knowledge_entries USING ivfflat (embedding vector_cosine_ops) WITH (lists = 100);

-- 5. search_tsv 自动更新触发器
CREATE OR REPLACE FUNCTION public.update_knowledge_entries_search_tsv()
RETURNS trigger
LANGUAGE plpgsql
AS $fn$
BEGIN
  NEW.search_tsv := to_tsvector(
    'simple',
    coalesce(NEW.content_text, '') || ' ' ||
    coalesce(NEW.title, '') || ' ' ||
    coalesce(NEW.summary, '')
  );
  RETURN NEW;
END;
$fn$;

DROP TRIGGER IF EXISTS trg_knowledge_entries_search_tsv ON knowledge_entries;
CREATE TRIGGER trg_knowledge_entries_search_tsv
  BEFORE INSERT OR UPDATE OF content_text, title, summary ON knowledge_entries
  FOR EACH ROW EXECUTE FUNCTION public.update_knowledge_entries_search_tsv();

-- 6. 存量数据回填 search_tsv
UPDATE knowledge_entries SET search_tsv = to_tsvector('simple', coalesce(content_text, '') || ' ' || coalesce(title, '') || ' ' || coalesce(summary, ''))
WHERE search_tsv IS NULL;

-- 7. storage.objects RLS 策略：允许已认证用户对 knowledge bucket 上传/读取
DROP POLICY IF EXISTS "knowledge_bucket_upload" ON storage.objects;
CREATE POLICY "knowledge_bucket_upload" ON storage.objects
  FOR INSERT TO authenticated WITH CHECK (bucket_id = 'knowledge');

DROP POLICY IF EXISTS "knowledge_bucket_read" ON storage.objects;
CREATE POLICY "knowledge_bucket_read" ON storage.objects
  FOR SELECT TO authenticated USING (bucket_id = 'knowledge');

DROP POLICY IF EXISTS "knowledge_bucket_update" ON storage.objects;
CREATE POLICY "knowledge_bucket_update" ON storage.objects
  FOR UPDATE TO authenticated USING (bucket_id = 'knowledge' AND owner = auth.uid());

DROP POLICY IF EXISTS "knowledge_bucket_delete" ON storage.objects;
CREATE POLICY "knowledge_bucket_delete" ON storage.objects
  FOR DELETE TO authenticated USING (bucket_id = 'knowledge' AND owner = auth.uid());
