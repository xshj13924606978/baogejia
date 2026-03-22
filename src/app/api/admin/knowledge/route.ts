import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 知识库管理 API（管理员）
 *
 * GET: 获取知识条目列表（分页、搜索、类型筛选、状态筛选）
 */

export async function GET(request: NextRequest) {
  try {
    const db = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);

    const keyword = searchParams.get('keyword') || '';
    const type = searchParams.get('type') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

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

    // 状态筛选
    if (status) {
      query = query.eq('status', status);
    }

    const offset = (page - 1) * limit;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.log('[Admin Knowledge API] 表不存在或查询失败:', error.message);
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

    // 格式化数据
    const formatted = (data || []).map((item: any) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description || '',
      fileName: item.file_name,
      fileKey: item.file_key,
      fileUrl: item.file_url,
      fileSize: item.file_size,
      fileType: item.file_type,
      status: item.status,
      uploaderName: userMap[item.user_id] || item.user_id || '未知',
      uploaderId: item.user_id,
      createdAt: item.created_at,
    }));

    // 统计各状态数量
    let statusCounts = null;
    if (!keyword && !type && !status) {
      const [pendingRes, approvedRes, rejectedRes] = await Promise.all([
        db.from('knowledge_entries').select('*', { count: 'exact', head: true }).eq('status', 'pending'),
        db.from('knowledge_entries').select('*', { count: 'exact', head: true }).eq('status', 'approved'),
        db.from('knowledge_entries').select('*', { count: 'exact', head: true }).eq('status', 'rejected'),
      ]);
      statusCounts = {
        total: count || 0,
        pending: pendingRes.count || 0,
        approved: approvedRes.count || 0,
        rejected: rejectedRes.count || 0,
      };
    }

    return NextResponse.json({
      success: true,
      data: formatted,
      total: count || 0,
      page,
      limit,
      ...(statusCounts && { statusCounts }),
    });
  } catch (error: any) {
    console.error('[Admin Knowledge API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取知识列表失败' }, { status: 500 });
  }
}
