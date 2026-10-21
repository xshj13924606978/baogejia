/**
 * 资料库服务（#[20260827-1030]-7）
 *
 * 资料文档查询优先级：
 *   1️⃣ 资料库（用户上传的专业资料/书籍/文献，knowledge_entries 向量+全文检索）
 *   2️⃣ 联网搜索（补充检索）
 *   3️⃣ 规则内置（通用知识兜底）
 *
 * 本服务封装既有知识库检索能力（knowledge-manager），
 * 统一返回带"来源=资料库"标注的结果，供方案生成引用。
 */
import {
  searchKnowledge,
  isKnowledgeBaseEnabled,
  type KnowledgeSearchResult,
} from '@/lib/knowledge/knowledge-manager';

export interface KnowledgeAssetHit extends KnowledgeSearchResult {
  /** 数据来源标注：统一为 'knowledge_db'（资料库） */
  source: 'knowledge_db';
  /** 来源描述（展示用） */
  sourceDetail: string;
}

export interface SearchKnowledgeOptions {
  limit?: number;
  moduleTypes?: string[];
}

/** 资料库是否可用 */
export function isKnowledgeAvailable(): boolean {
  return isKnowledgeBaseEnabled();
}

/**
 * 检索资料库（含来源标注）
 * 返回 [] 表示无资料或知识库未启用，调用方应继续走"联网搜索 → 规则内置"链路
 */
export async function searchKnowledgeAssets(
  query: string,
  opts?: SearchKnowledgeOptions
): Promise<KnowledgeAssetHit[]> {
  try {
    const hits = await searchKnowledge(query, {
      limit: opts?.limit ?? 4,
      moduleTypes: opts?.moduleTypes,
    });
    return hits.map((h) => ({
      ...h,
      source: 'knowledge_db' as const,
      sourceDetail: `资料库（${h.type || '技术文档'}）`,
    }));
  } catch (e) {
    console.warn('[knowledge-service] 资料库检索失败:', e);
    return [];
  }
}

// 资料中心资产精确匹配（#[20260827-1430]：知识检索优先匹配资料中心已有文件）
export {
  matchKnowledgeAssets,
  searchKnowledgeWithAssetMatch,
  extractAssetKeywords,
  type KnowledgeAssetMatch,
  type AssetKeyword,
} from '@/lib/knowledge/match-service';

/** 将检索结果格式化为方案引用文本 */
export function knowledgeHitsToText(hits: KnowledgeAssetHit[]): string {
  if (!hits || hits.length === 0) return '';
  return hits
    .map(
      (h, i) =>
        `${i + 1}. ${h.title}${h.summary ? ' — ' + h.summary : ''}${
          h.contentPreview ? '\n   片段：' + h.contentPreview.slice(0, 120) : ''
        }`
    )
    .join('\n');
}
