/**
 * 知识库管理器（#[20260827-1030]-6 第二层：知识检索层，可选增强）
 *
 * - ENABLE_KNOWLEDGE_BASE=false（默认）→ 跳过检索，返回 []，由专家规则层兜底
 * - ENABLE_KNOWLEDGE_BASE=true → 调用现有 matchKnowledgeDocuments 向量/全文混合检索
 * - 任何异常均安全降级，不抛出
 *
 * 说明：向量存储/文档解析复用现有 embedding-service、upload-processor、
 * match-service 实现，本模块仅提供"开关 + 编排"。
 */

import { matchKnowledgeDocuments, type KnowledgeMatchResult } from './match-service';

export interface KnowledgeSearchResult {
  title: string;
  type: string;
  summary?: string;
  contentPreview?: string;
  relevanceScore: number;
  matchedBy: string;
}

/** 知识库总开关 */
export function isKnowledgeBaseEnabled(): boolean {
  const raw = process.env.ENABLE_KNOWLEDGE_BASE;
  return raw === 'true' || raw === '1';
}

/** 检索知识库（开关关闭或失败时返回空数组，绝不抛错） */
export async function searchKnowledge(
  query: string,
  opts?: { limit?: number; moduleTypes?: string[] }
): Promise<KnowledgeSearchResult[]> {
  if (!isKnowledgeBaseEnabled()) return [];
  if (!query.trim()) return [];
  try {
    const results: KnowledgeMatchResult[] = await matchKnowledgeDocuments({
      query,
      limit: opts?.limit ?? 5,
      moduleTypes: opts?.moduleTypes,
      embeddingTimeoutMs: 10000,
    });
    return results.map((r) => ({
      title: r.title,
      type: r.type,
      summary: r.summary,
      contentPreview: r.content_preview,
      relevanceScore: r.relevance_score,
      matchedBy: r.matched_by,
    }));
  } catch (e) {
    console.warn('[knowledge-manager] 知识库检索失败，跳过（使用规则层）:', e);
    return [];
  }
}