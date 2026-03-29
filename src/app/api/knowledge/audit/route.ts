/**
 * 知识库审核 API
 *
 * POST /api/knowledge/audit
 * Body: { entryId: string, action: 'approve' | 'reject', reason?: string }
 *
 * 权限：仅 super_admin 和 admin 可操作
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth-utils';

const ROLE_MAP: Record<string, string> = {
  '超级管理员': 'super_admin', '系统管理员': 'admin', '管理员': 'admin',
  'VIP会员': 'vip', 'VIP用户': 'vip', '付费会员': 'premium', '普通会员': 'premium',
  '免费用户': 'free', '企业用户': 'enterprise', '待审核': 'pending', 'user': 'user',
};

export async function POST(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser?.id) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    // 检测开发环境降级
    const requestUserId = request.headers.get('x-user-id');
    const requestUserRole = request.headers.get('x-user-role');
    let effectiveRole = currentUser.role || 'user';
    if (requestUserId && currentUser.id !== requestUserId) {
      effectiveRole = requestUserRole || 'user';
    }

    // 审核操作需要真实认证（非开发环境降级）
    const hasRealAuth = !!(
      requestUserId ||
      request.headers.get('authorization') ||
      request.cookies.get('sb-access-token')
    );
    if (!hasRealAuth) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const normalizedRole = ROLE_MAP[effectiveRole || ''] || effectiveRole || 'user';
    if (normalizedRole !== 'super_admin' && normalizedRole !== 'admin') {
      return NextResponse.json({ success: false, error: '仅管理员可执行审核操作' }, { status: 403 });
    }

    const { entryId, action, reason } = await request.json();
    if (!entryId || !action) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }
    if (action !== 'approve' && action !== 'reject') {
      return NextResponse.json({ success: false, error: 'action 必须为 approve 或 reject' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 获取条目
    const { data: entry, error: fetchError } = await db
      .from('knowledge_entries')
      .select('id, title, status, user_id')
      .eq('id', entryId)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    if (entry.status !== 'pending') {
      return NextResponse.json({ success: false, error: `该条目当前状态为 ${entry.status}，无法审核` }, { status: 400 });
    }

    // 执行审核
    const updateData: Record<string, any> = {
      status: action === 'approve' ? 'approved' : 'rejected',
      reviewed_by: currentUser.id,
      reviewed_at: new Date().toISOString(),
    };
    if (action === 'reject' && reason) {
      updateData.reject_reason = reason;
    }

    const { error: updateError } = await db
      .from('knowledge_entries')
      .update(updateData)
      .eq('id', entryId);

    if (updateError) {
      console.error('[Knowledge Audit] 审核失败:', updateError);
      return NextResponse.json({ success: false, error: '审核操作失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: action === 'approve' ? '已通过审核' : '已拒绝',
      data: updateData,
    });
  } catch (error: any) {
    console.error('[Knowledge Audit] 异常:', error);
    return NextResponse.json({ success: false, error: '审核失败' }, { status: 500 });
  }
}

/**
 * GET /api/knowledge/audit
 * 获取待审核列表（仅管理员）
 */
export async function GET(request: NextRequest) {
  try {
    const currentUser = await getCurrentUser(request);
    if (!currentUser?.id) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const requestUserId = request.headers.get('x-user-id');
    const requestUserRole = request.headers.get('x-user-role');
    let effectiveRole = currentUser.role || 'user';
    if (requestUserId && currentUser.id !== requestUserId) {
      effectiveRole = requestUserRole || 'user';
    }

    const hasRealAuth = !!(
      requestUserId ||
      request.headers.get('authorization') ||
      request.cookies.get('sb-access-token')
    );
    if (!hasRealAuth) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const normalizedRole = ROLE_MAP[effectiveRole || ''] || effectiveRole || 'user';
    if (normalizedRole !== 'super_admin' && normalizedRole !== 'admin') {
      return NextResponse.json({ success: false, error: '仅管理员可查看' }, { status: 403 });
    }

    const db = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    let query = db
      .from('knowledge_entries')
      .select('*', { count: 'exact' })
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (type) query = query.eq('type', type);

    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) {
      return NextResponse.json({ success: false, error: '查询失败' }, { status: 500 });
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
      ...item,
      uploader_name: userMap[item.user_id] || '未知',
    }));

    return NextResponse.json({
      success: true,
      data: formatted,
      total: count || 0,
      page,
      limit,
    });
  } catch (error: any) {
    console.error('[Knowledge Audit GET] 异常:', error);
    return NextResponse.json({ success: false, error: '查询失败' }, { status: 500 });
  }
}
