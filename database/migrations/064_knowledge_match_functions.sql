-- 064_knowledge_match_functions.sql
-- 知识库智能匹配 RPC 函数（#20260822-2242 指令 3/3）
-- 向量召回 + 全文召回，供 /api/knowledge/match 混合检索使用

-- 1. 向量召回：cosine 距离 → 相似度 0-100
CREATE OR REPLACE FUNCTION public.match_knowledge_entries(
  query_embedding vector(1536),
  match_count integer DEFAULT 10,
  filter_types text[] DEFAULT NULL
)
RETURNS TABLE(id uuid, relevance_score double precision)
LANGUAGE plpgsql
AS $fn$
BEGIN
  RETURN QUERY
  SELECT k.id,
         (1 - (k.embedding <=> query_embedding)) * 100 AS relevance_score
  FROM knowledge_entries k
  WHERE k.status = 'approved'
    AND k.embedding IS NOT NULL
    AND (filter_types IS NULL OR cardinality(filter_types) = 0 OR k.type = ANY(filter_types))
  ORDER BY k.embedding <=> query_embedding
  LIMIT match_count;
END;
$fn$;

-- 2. 全文召回：ts_rank 归一化到 0-100；中文 simple 分词整串 token 失效时
--    用 content_text/title ILIKE 子串兜底（中文语义检索主力为向量通道，此兜底保证降级可用）
CREATE OR REPLACE FUNCTION public.search_knowledge_entries_fts(
  query_text text,
  match_count integer DEFAULT 10,
  filter_types text[] DEFAULT NULL
)
RETURNS TABLE(id uuid, relevance_score double precision)
LANGUAGE plpgsql
AS $fn$
BEGIN
  RETURN QUERY
  SELECT k.id,
         LEAST(
           CASE
             WHEN k.search_tsv @@ plainto_tsquery('simple', query_text)
               THEN ts_rank(k.search_tsv, plainto_tsquery('simple', query_text)) * 100
             WHEN k.content_text ILIKE '%' || query_text || '%' THEN 60
             WHEN k.title ILIKE '%' || query_text || '%' THEN 50
             ELSE 0
           END,
           100
         ) AS relevance_score
  FROM knowledge_entries k
  WHERE k.status = 'approved'
    AND (
      k.search_tsv @@ plainto_tsquery('simple', query_text)
      OR k.content_text ILIKE '%' || query_text || '%'
      OR k.title ILIKE '%' || query_text || '%'
    )
    AND (filter_types IS NULL OR cardinality(filter_types) = 0 OR k.type = ANY(filter_types))
  ORDER BY relevance_score DESC
  LIMIT match_count;
END;
$fn$;
