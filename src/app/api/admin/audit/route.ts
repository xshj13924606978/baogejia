import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 审核管理 API
 *
 * 直接复用 knowledge_entries 表的 status 字段
 * pending -> approved: 通过审核
 * pending -> rejected: 拒绝审核
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const status = searchParams.get('status') || 'pending';
    const type = searchParams.get('type') || '';
    const keyword = searchParams.get('keyword') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const db = getSupabaseServiceClient();
    let query = db
      .from('knowledge_entries')
      .select('*', { count: 'exact' });

    if (status && status !== 'all') query = query.eq('status', status);
    if (type && type !== 'all') query = query.eq('type', type);
    if (keyword) query = query.ilike('title', `%${keyword}%`);

    const offset = (page - 1) * limit;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.log('[Audit API] 表不存在或查询失败:', error.message);
      return NextResponse.json({ success: true, data: [], total: 0, page, limit });
    }

    // 批量获取上传者信息
    const userIds = [...new Set((data || []).map((item: any) => item.user_id).filter(Boolean))];
    let userMap: Record<string, string> = {};
    if (userIds.length > 0) {
      try {
        const { data: users } = await db.from('users').select('id, username, full_name').in('id', userIds);
        if (users) users.forEach((u: any) => { userMap[u.id] = u.full_name || u.username || u.id; });
      } catch { /* ignore */ }
    }

    const formatted = (data || []).map((item: any) => ({
      id: item.id,
      type: item.type,
      title: item.title,
      description: item.description || '',
      fileName: item.file_name,
      fileUrl: item.file_url,
      fileSize: item.file_size,
      status: item.status,
      uploaderName: userMap[item.user_id] || item.user_id || '未知',
      createdAt: item.created_at,
    }));

    return NextResponse.json({ success: true, data: formatted, total: count || 0, page, limit });
  } catch (error: any) {
    console.error('[Audit API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取审核列表失败' }, { status: 500 });
  }
}
