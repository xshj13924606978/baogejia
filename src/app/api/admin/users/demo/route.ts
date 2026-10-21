import { NextRequest, NextResponse } from 'next/server';
import {
  withUserCreate,
  withUserEdit,
  withUserDelete,
  withPermissionCheck
} from '@/lib/permission-check';

/**
 * 用户管理示例 API
 * 演示如何使用新的权限系统
 */

/**
 * GET - 查看用户列表
 * 需要 admin.users.view 权限
 */
export const GET = withPermissionCheck(
  { permissions: 'admin.users.view' },
  async (_request: NextRequest, _context: any) => {
    try {
    // 获取用户列表（业务逻辑）
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const _supabase = getSupabaseClient();

    const { data: users, error } = await _supabase
      .from('users')
      .select('id, email, username, role, level, points, created_at')
      .order('created_at', { ascending: false })
      .limit(20);

    if (error) {
      throw error;
    }

    return NextResponse.json({
      success: true,
      data: users || [],
      message: '获取用户列表成功'});
  } catch (error: any) {
    console.error('[Users Demo API] 获取用户列表失败:', error);
    return NextResponse.json(
      { error: '获取用户列表失败' },
      { status: 500 }
    );
  }
});

/**
 * POST - 创建新用户
 * 使用 withUserCreate 包装器（需要 user.create 权限）
 */
export const POST = withUserCreate(async (request: NextRequest, _context: any) => {
  try {
    const body = await request.json();
    const { email, username, password, role } = body;

    // 验证参数
    if (!email || !username || !password) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    // 创建用户（业务逻辑）
    const { getSupabaseClient } = await import('@/storage/database/supabase-client');
    const _supabase = getSupabaseClient();

    // 这里应该实现实际的用户创建逻辑
    // 例如：使用 Supabase Auth 创建用户，然后在 users 表中插入记录

    return NextResponse.json({
      success: true,
      message: '用户创建成功',
      data: {
        email,
        username,
        role: role || 'user'}});
  } catch (error: any) {
    console.error('[Users Demo API] 创建用户失败:', error);
    return NextResponse.json({ error: '创建用户失败' }, { status: 500 });
  }
});

/**
 * PUT - 更新用户
 * 需要 admin.users.edit 权限
 */
export const PUT = withPermissionCheck(
  { permissions: 'admin.users.edit' },
  async (request: NextRequest, _context: any) => {
    try {
      const body = await request.json();
      const { userId, updates } = body;

      // 验证参数
      if (!userId || !updates) {
        return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
      }

      // 更新用户（业务逻辑）
      const { getSupabaseClient } = await import('@/storage/database/supabase-client');
      const _supabase = getSupabaseClient();

      const { data, error } = await _supabase
        .from('users')
        .update(updates)
        .eq('id', userId)
        .select()
        .single();

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        message: '用户更新成功',
        data});
    } catch (error: any) {
      console.error('[Users Demo API] 更新用户失败:', error);
      return NextResponse.json({ error: '更新用户失败' }, { status: 500 });
    }
  }
);

/**
 * DELETE - 删除用户
 * 需要 admin.users.disable 权限（禁用/删除用户）
 */
export const DELETE = withPermissionCheck(
  { permissions: 'admin.users.disable' },
  async (request: NextRequest, _context: any) => {
    try {
      const body = await request.json();
      const { userId } = body;

      // 验证参数
      if (!userId) {
        return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
      }

      // 删除用户（业务逻辑）
      // #20260827-0826-2 修复：原直接 DELETE 因外键约束导致 500，改为级联删除函数
      const { getSupabaseServiceClient } = await import('@/storage/database/supabase-client');
      const _supabase = getSupabaseServiceClient();

      const { error } = await _supabase.rpc('delete_user_cascade', {
        user_ids: [userId],
      });

      if (error) {
        throw error;
      }

      return NextResponse.json({
        success: true,
        message: '用户删除成功'});
    } catch (error: any) {
      console.error('[Users Demo API] 删除用户失败:', error);
      return NextResponse.json({ error: '删除用户失败' }, { status: 500 });
    }
  }
);
