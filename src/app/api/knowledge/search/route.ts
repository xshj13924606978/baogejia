import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 跨库全局搜索 API
 *
 * GET /api/knowledge/search?keyword=xxx&types=document,case,standard&limit=10
 * - 跨库搜索：同时查询多个 type 的 knowledge_entries
 * - 搜索范围：title + description
 * - 只返回 status = 'approved' 的条目
 * - 返回按 type 分组的结果
 */

export async function GET(request: NextRequest) {
  try {
    const db = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);

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

    // 并行搜索各类型
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
        results[type] = data.map((item: any) => ({
          id: item.id,
          type: item.type,
          typeLabel: typeLabels[type] || type,
          title: item.title,
          description: item.description || '',
          file_name: item.file_name,
          file_url: item.file_url,
          file_size: item.file_size,
          file_type: item.file_type,
          metadata: item.metadata || {},
          created_at: item.created_at,
        }));
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
