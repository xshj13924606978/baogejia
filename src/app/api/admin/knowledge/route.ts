import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * 知识库管理 API（管理员）
 *
 * GET: 获取知识条目列表（分页、搜索、类型筛选、状态筛选）
 */

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const db = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);

    const keyword = searchParams.get('keyword') || '';
    const type = searchParams.get('type') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const metadataFilterStr = searchParams.get('metadata_filter') || '';
    const tagFilter = searchParams.get('tag') || '';

    let query = db
      .from('knowledge_entries')
      .select('*', { count: 'exact' });

    // 搜索（标题）
    if (keyword) {
      query = query.ilike('title', `%${keyword}%`);
    }

    // 类型筛选
    if (type) {
      query = query.eq('type', type);
    }

    // metadata JSONB 筛选
    if (metadataFilterStr) {
      try {
        const filterObj = JSON.parse(metadataFilterStr);
        if (Object.keys(filterObj).length > 0) {
          query = query.contains('metadata', filterObj);
        }
      } catch {
        // metadata_filter 解析失败，忽略
      }
    }

    // 状态筛选
    if (status) {
      query = query.eq('status', status);
    }

    const offset = (page - 1) * limit;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ success: true, data: [], total: 0, page, limit });
    }

    // 批量获取上传者信息
    const userIds = [...new Set((data || []).map((item: any) => item.user_id).filter(Boolean))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      try {
        const { data: users } = await db
          .from('users')
          .select('id, username, full_name')
          .in('id', userIds);
        if (users) {
          users.forEach((u: any) => {
            userMap[u.id] = u.full_name || u.username || u.id;
          });
        }
      } catch { /* 用户信息查询失败不阻塞 */ }
    }

    // 批量获取 tags
    const entryIds = (data || []).map((item: any) => item.id);
    let tagMap: Record<string, string[]> = {};
    if (entryIds.length > 0) {
      try {
        const { data: tagRelations } = await db
          .from('knowledge_entry_tags')
          .select('entry_id, knowledge_tags(name)')
          .in('entry_id', entryIds);
        if (tagRelations) {
          tagRelations.forEach((r: any) => {
            if (!tagMap[r.entry_id]) tagMap[r.entry_id] = [];
            if (r.knowledge_tags?.name) tagMap[r.entry_id].push(r.knowledge_tags.name);
          });
        }
      } catch { /* tags 查询失败不阻塞 */ }
    }

    // 按 tag 筛选
    let filteredData = data || [];
    if (tagFilter && entryIds.length > 0) {
      filteredData = filteredData.filter((item: any) =>
        (tagMap[item.id] || []).includes(tagFilter)
      );
    }

    // 格式化数据
    const formatted = filteredData.map((item: any) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description || '',
      fileName: item.file_name,
      fileKey: item.file_key,
      fileUrl: item.file_url,
      fileSize: item.file_size,
      fileType: item.file_type,
      content: item.content,
      metadata: item.metadata || {},
      status: item.status,
      uploaderName: userMap[item.user_id] || item.user_id || '未知',
      uploaderId: item.user_id,
      tags: tagMap[item.id] || [],
      createdAt: item.created_at,
    }));

    // 统计各状态数量（始终返回，不受筛选条件影响）
    const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
      db.from('knowledge_entries').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
      db.from('knowledge_entries').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
      db.from('knowledge_entries').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
    ]);
    const statusCounts = {
      total: count || 0,
      pending: pendingRes.count || 0,
      approved: approvedRes.count || 0,
      rejected: rejectedRes.count || 0,
    };

    return NextResponse.json({
      success: true,
      data: formatted,
      total: tagFilter ? filteredData.length : (count || 0),
      page,
      limit,
      statusCounts,
    });
  } catch (error: any) {
    console.error('[Admin Knowledge API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取知识列表失败' }, { status: 500 });
  }
}
