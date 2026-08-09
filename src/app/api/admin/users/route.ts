export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * GET - 获取用户列表
 * 支持分页、搜索、角色筛选、状态筛选
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword') || '';
    const role = searchParams.get('role') || '';
    const status = searchParams.get('status') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');

    const db = getSupabaseServiceClient();
    let query = db.from('users').select('*', { count: 'exact' });

    // 关键词搜索
    if (keyword) {
      query = query.or(`email.ilike.%${keyword}%,username.ilike.%${keyword}%,full_name.ilike.%${keyword}%`);
    }

    // 角色筛选
    if (role) {
      query = query.eq('role', role);
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
      console.error('[Users API] 查询失败:', error);
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    // 格式化用户数据
    const formattedUsers = (data || []).map((u: any) => ({
      id: u.id,
      name: u.full_name || u.username,
      email: u.email,
      username: u.username,
      role: u.role || 'user',
      status: u.status || 'active',
      phone: u.metadata?.phone || '',
      avatar: u.avatar_url || u.metadata?.avatar_url || '',
      points: u.metadata?.points || 0,
      createdAt: u.created_at,
      lastLogin: u.last_login,
      metadata: u.metadata || {},
    }));

    // 批量获取用户等级
    const userIds = formattedUsers.map((u) => u.id);
    const { data: userLevels } = await db
      .from('user_levels')
      .select('user_id, level')
      .in('user_id', userIds);

    const levelMap = new Map((userLevels || []).map((l: any) => [l.user_id, l.level]));
    const finalUsers = formattedUsers.map((u) => ({ ...u, level: levelMap.get(u.id) || 1 }));

    return NextResponse.json({
      success: true,
      data: finalUsers,
      total: count || 0,
      page,
      limit,
    });
  } catch (error: any) {
    console.error('[Users API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取用户列表失败' }, { status: 500 });
  }
}

/**
 * POST - 创建新用户
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { email, username, password, fullName, role, phone } = body;

    if (!email || !username || !password) {
      return NextResponse.json(
        { success: false, error: '邮箱、用户名和密码不能为空' },
        { status: 400 }
      );
    }

    const db = getSupabaseServiceClient();

    // 密码加密（使用 bcrypt）
    const bcrypt = await import('bcrypt');
    const saltRounds = 10;
    const passwordHash = await bcrypt.hash(password, saltRounds);

    const { data, error } = await db
      .from('users')
      .insert({
        email,
        username,
        password_hash: passwordHash,
        full_name: fullName || username,
        role: role || 'user',
        status: 'active',
        metadata: {
          phone: phone || '',
          points: 0,
        },
      })
      .select()
      .single();

    if (error) {
      console.error('[Users API] 创建失败:', error);
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        return NextResponse.json(
          { success: false, error: '该邮箱或用户名已存在' },
          { status: 409 }
        );
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '用户创建成功',
      data: { id: data.id, email: data.email, username: data.username },
    });
  } catch (error: any) {
    console.error('[Users API] 创建异常:', error);
    return NextResponse.json({ success: false, error: '创建用户失败' }, { status: 500 });
  }
}
