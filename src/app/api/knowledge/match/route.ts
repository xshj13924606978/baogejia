import { NextRequest, NextResponse } from 'next/server';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { matchKnowledgeDocuments, MODULE_TYPE_ALIASES } from '@/lib/knowledge/match-service';

/**
 * 知识库智能匹配 API（#20260822-2242 指令 3/3）
 * POST /api/knowledge/match
 * body: { query, moduleTypes?, limit?, excludeId? }
 * - 向量检索 + 全文检索混合召回，融合排序返回 Top-N（含相关性分数 0-100）
 * - embedding 失败时优雅降级为仅全文检索
 */
export async function POST(request: NextRequest) {
  try {
    const ctx = await resolveAuthContext(request);
    if (!ctx.isAuthenticated) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    let body: any = {};
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: '请求体格式错误' }, { status: 400 });
    }

    const query = String(body.query || '').trim();
    if (!query) {
      return NextResponse.json({ error: '缺少查询内容 query' }, { status: 400 });
    }
    if (query.length > 500) {
      return NextResponse.json({ error: '查询内容过长（最多 500 字）' }, { status: 400 });
    }

    const moduleTypes: string[] = Array.isArray(body.moduleTypes)
      ? body.moduleTypes.filter((t: any) => typeof t === 'string' && t.trim())
      : [];

    const limit = Math.max(1, Math.min(20, Number(body.limit) || 5));
    const excludeId = typeof body.excludeId === 'string' && body.excludeId ? body.excludeId : undefined;

    const results = await matchKnowledgeDocuments({ query, moduleTypes, limit, excludeId });

    return NextResponse.json({
      success: true,
      query,
      moduleTypes,
      limit,
      results,
      total: results.length,
      aliases: MODULE_TYPE_ALIASES,
    });
  } catch (error: any) {
    console.error('[KnowledgeMatch] 匹配失败:', error);
    return NextResponse.json(
      { success: false, error: '匹配失败，请稍后重试' },
      { status: 500 }
    );
  }
}
