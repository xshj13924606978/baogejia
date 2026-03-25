import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 审核管理 API
 *
 * GET: 获取审核列表
 *   - type=users: 查询待审核用户 (status=pending)
 *   - type=products: 查询待审核产品
 *   - 其他: 查询知识条目 (knowledge_entries)
 *
 * POST: 处理审核操作 (用户注册审核 / 产品上传审核)
 */

export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const auditType = searchParams.get('type') || '';
    const status = searchParams.get('status') || 'pending';
    const type = searchParams.get('type') || '';
    const keyword = searchParams.get('keyword') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const db = getSupabaseServiceClient();

    // 用户注册审核
    if (auditType === 'users') {
      const offset = (page - 1) * limit;
      let query = db
        .from('users')
        .select('id, username, email, phone, full_name, role, status, created_at', { count: 'exact' })
        .eq('status', 'pending');

      if (keyword) query = query.or(`username.ilike.%${keyword}%,email.ilike.%${keyword}%,full_name.ilike.%${keyword}%`);

      const { data, error, count } = await query
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return NextResponse.json({ success: true, users: [], total: 0 });
      }

      return NextResponse.json({
        success: true,
        users: (data || []).map((u: any) => ({
          id: u.id,
          username: u.username,
          email: u.email,
          phone: u.phone || '',
          company: u.full_name || '',
          contact: u.phone || '',
          role: u.role || 'free',
          status: u.status,
          created_at: u.created_at,
        })),
        total: count || 0,
      });
    }

    // 产品上传审核
    if (auditType === 'products') {
      const offset = (page - 1) * limit;
      const { data: entries, error, count } = await db
        .from('knowledge_entries')
        .select('*', { count: 'exact' })
        .eq('type', 'price')
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (error) {
        return NextResponse.json({ success: true, products: [], total: 0 });
      }

      const products = (entries || []).map((item: any) => ({
        id: item.id,
        name: item.title || '',
        brand: '',
        model: '',
        price: 0,
        manufacturer_id: item.user_id || '',
        users: { id: item.user_id || '', username: '', company: '' },
        created_at: item.created_at,
      }));

      return NextResponse.json({ success: true, products, total: count || 0 });
    }

    // 知识条目审核（默认）
    let query = db
      .from('knowledge_entries')
      .select('*', { count: 'exact' });

    if (status && status !== 'all') query = query.eq('status', status);
    if (type && type !== 'all' && type !== 'users' && type !== 'products') query = query.eq('type', type);
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

// POST: 处理用户注册审核 / 产品上传审核
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { target_id, type, action, reason } = body;

    if (!target_id || !type || !action) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    if (type === 'user') {
      // 用户注册审核
      const newStatus = action === 'approve' ? 'active' : 'rejected';
      const updateData: Record<string, any> = { status: newStatus };

      // 如果通过审核且有指定角色，更新角色
      if (action === 'approve' && reason) {
        const roleMap: Record<string, string> = {
          '普通用户': 'free',
          '高级用户': 'premium',
          '厂家': 'manufacturer',
        };
        updateData.role = roleMap[reason] || 'free';
      }

      const { error } = await db
        .from('users')
        .update(updateData)
        .eq('id', target_id);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: action === 'approve' ? '用户审核通过' : '用户注册已拒绝',
      });
    }

    if (type === 'product') {
      // 产品上传审核
      const newStatus = action === 'approve' ? 'approved' : 'rejected';
      const updateData: Record<string, any> = { status: newStatus };

      if (action === 'reject' && reason) {
        updateData.reject_reason = reason;
      }

      const { error } = await db
        .from('knowledge_entries')
        .update(updateData)
        .eq('id', target_id);

      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        message: action === 'approve' ? '产品审核通过' : '产品已拒绝',
      });
    }

    return NextResponse.json({ success: false, error: '不支持的审核类型' }, { status: 400 });
  } catch (error: any) {
    console.error('[Audit POST API] 异常:', error);
    return NextResponse.json({ success: false, error: '审核操作失败' }, { status: 500 });
  }
}
