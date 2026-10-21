import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { extractAssetKeywords, matchKnowledgeAssets } from '@/lib/knowledge/match-service';

/**
 * 跨库全局搜索 API
 *
 * GET /api/knowledge/search?keyword=xxx&types=document,case,standard&limit=10
 * - 跨库搜索：同时查询多个 type 的 knowledge_entries
 * - 搜索范围：title + description
 * - 只返回 status = 'approved' 的条目
 * - 返回按 type 分组的结果，附带：
 *   - snippet：关键词匹配片段（关键词以 [[hl]]...[[/hl]] 标记，供前端高亮）
 *   - score：相关性分数（标题命中 ×3，描述命中 ×1）
 *
 * GET /api/knowledge/search?mode=asset&q=地表水排放标准&limit=5
 * - 资料中心资产匹配调试模式（#[20260827-1430]-1）：
 *   返回关键词提取详情（权重/是否编号）+ 匹配到的资料中心资产列表，供前端联调
 */

function escapeRegExp(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

/**
 * 在文本中定位第一个关键词命中，截取前后上下文生成片段。
 * 片段内所有关键词出现处以 [[hl]]...[[/hl]] 标记，供前端渲染高亮。
 */
function buildSnippet(text: string, keyword: string, radius = 40): string | null {
  const clean = (text || '').replace(/\s+/g, ' ').trim();
  if (!clean) return null;
  const lower = clean.toLowerCase();
  const kw = keyword.toLowerCase();
  const idx = lower.indexOf(kw);
  if (idx < 0) return null;

  const start = Math.max(0, idx - radius);
  const end = Math.min(clean.length, idx + kw.length + radius);
  let snippet = clean.slice(start, end);
  if (start > 0) snippet = `…${snippet}`;
  if (end < clean.length) snippet = `${snippet}…`;

  const escaped = escapeRegExp(keyword);
  snippet = snippet.replace(new RegExp(`(${escaped})`, 'ig'), '[[hl]]$1[[/hl]]');
  return snippet;
}

/** 相关性分数：标题命中 ×3，描述命中 ×1 */
function computeScore(title: string, description: string, keyword: string): number {
  const kw = keyword.toLowerCase();
  if (!kw) return 0;
  let score = 0;
  const titleLower = (title || '').toLowerCase();
  const descLower = (description || '').toLowerCase();

  let pos = titleLower.indexOf(kw);
  while (pos !== -1) {
    score += 3;
    pos = titleLower.indexOf(kw, pos + kw.length);
  }
  pos = descLower.indexOf(kw);
  while (pos !== -1) {
    score += 1;
    pos = descLower.indexOf(kw, pos + kw.length);
  }
  return score;
}

export async function GET(request: NextRequest) {
  try {
    const db = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);

    // ---- 资料中心资产匹配调试模式（#[20260827-1430]-1）----
    const mode = searchParams.get('mode') || '';
    if (mode === 'asset') {
      const q = searchParams.get('q') || searchParams.get('keyword') || '';
      if (!q) {
        return NextResponse.json({ success: false, error: '缺少 q 参数' }, { status: 400 });
      }
      const assetLimit = Math.max(1, Math.min(10, parseInt(searchParams.get('limit') || '5') || 5));
      const keys = extractAssetKeywords(q);
      const matches = await matchKnowledgeAssets(q, { limit: assetLimit });
      return NextResponse.json({
        success: true,
        mode: 'asset',
        query: q,
        keys: keys.map((k) => ({ text: k.text, weight: k.weight, isCode: !!k.isCode })),
        matchedCount: matches.length,
        matches: matches.map((m) => ({
          id: m.id,
          title: m.title,
          type: m.type,
          file_type: m.file_type || null,
          summary: m.summary || null,
          matchedKeys: m.matchedKeys,
          score: m.score,
          codeMatched: m.codeMatched,
          downloadUrl: `/api/knowledge/download/${m.id}`,
          librarySlug: m.type,
        })),
      });
    }

    const keyword = searchParams.get('keyword') || '';
    const typesStr = searchParams.get('types') || '';
    const limit = parseInt(searchParams.get('limit') || '10');

    if (!keyword) {
      return NextResponse.json({ success: true, results: {}, total: 0 });
    }

    // 解析要搜索的类型
    const types = typesStr
      ? typesStr.split(',').map(t => t.trim()).filter(Boolean)
      : ['document', 'case', 'standard', 'drawing', 'quota'];

    const typeLabels: Record<string, string> = {
      document: '技术文档',
      case: '案例',
      standard: '标准规范',
      drawing: '图纸图片',
      quota: '定额',
    };

    const results: Record<string, any[]> = {};
    let totalCount = 0;

    const searchPromises = types.map(async (type) => {
      const { data, error } = await db
        .from('knowledge_entries')
        .select('id, type, title, description, file_name, file_url, file_size, file_type, metadata, created_at')
        .eq('type', type)
        .eq('status', 'approved')
        .or(`title.ilike.%${keyword}%,description.ilike.%${keyword}%`)
        .order('created_at', { ascending: false })
        .limit(limit);

      if (!error && data) {
        results[type] = data
          .map((item: any) => {
            const titleSnippet = buildSnippet(item.title, keyword);
            const descSnippet = buildSnippet(item.description || '', keyword);
            return {
              id: item.id,
              type: item.type,
              typeLabel: typeLabels[type] || type,
              title: item.title,
              description: item.description || '',
              snippet: titleSnippet || descSnippet || (item.description || '').slice(0, 80),
              snippetField: titleSnippet ? 'title' : descSnippet ? 'description' : 'description',
              score: computeScore(item.title, item.description || '', keyword),
              file_name: item.file_name,
              file_url: item.file_url,
              file_size: item.file_size,
              file_type: item.file_type,
              metadata: item.metadata || {},
              created_at: item.created_at,
            };
          })
          // 相关度排序：分数相同按创建时间倒序
          .sort((a: any, b: any) => b.score - a.score);
        totalCount += data.length;
      } else {
        results[type] = [];
      }
    });

    await Promise.all(searchPromises);

    return NextResponse.json({
      success: true,
      results,
      total: totalCount,
    });
  } catch (error: any) {
    console.error('[Knowledge Search API] 异常:', error);
    return NextResponse.json({ success: false, error: '搜索失败' }, { status: 500 });
  }
}
