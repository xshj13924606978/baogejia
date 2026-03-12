import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getCurrentUser } from '@/lib/auth-utils';

/**
 * 获取系统默认等级配置API
 *
 * 功能：获取系统默认的等级配置
 * 权限：仅超级管理员和管理员
 */

export async function GET(request: NextRequest) {
  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    console.log('[Defaults API] 当前用户:', currentUser);

    if (!currentUser || !currentUser.id) {
      console.log('[Defaults API] 用户未登录');
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      );
    }

    // 查询用户角色
    const supabase = getSupabaseClient();
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single();

    if (roleError || !userRole) {
      console.error('[Defaults API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查管理员权限
    if (userRole.role !== 'super_admin' && userRole.role !== 'admin') {
      console.log('[Defaults API] 权限不足:', userRole.role);
      return NextResponse.json(
        { error: '权限不足' },
        { status: 403 }
      );
    }

    console.log('[Defaults API] 获取系统默认配置');

    // 尝试从 level_definitions 表获取默认配置
    const { data: defaults, error: defaultsError } = await supabase
      .from('level_definitions')
      .select('*')
      .order('level', { ascending: true });

    if (defaultsError) {
      console.error('[Defaults API] 查询失败:', defaultsError);
      return NextResponse.json(
        { error: '获取失败' },
        { status: 500 }
      );
    }

    console.log('[Defaults API] 成功获取默认配置:', defaults?.length, '条记录');
    return NextResponse.json(defaults || []);
  } catch (error) {
    console.error('[Defaults API] 获取默认配置失败:', error);
    return NextResponse.json(
      { error: '获取失败' },
      { status: 500 }
    );
  }
}
