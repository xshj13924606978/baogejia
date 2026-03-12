import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { userLevelService } from '@/lib/user-level-service';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 单个等级配置管理API
 *
 * 功能：
 * - GET: 获取指定等级的配置信息
 * - PUT: 更新指定等级的权限配置
 * 权限：仅超级管理员
 */

/**
 * 获取单个等级配置
 */

export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.points.view'] },
  async (request: NextRequest, user: any) => {

  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
        { status: 401 });
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
      console.error('[AdminLevelDetail API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查超级管理员权限
    if (userRole.role !== 'super_admin') {
      return NextResponse.json(
        { error: '无权限，需要超级管理员权限' },
        { status: 403 }
      );
    }

    // 获取参数
    const { level } = await params;
    const levelNum = parseInt(level);

    console.log('[AdminLevelDetail API] 获取等级配置:', levelNum);

    // 获取等级配置
    const config = await userLevelService.getLevelFullConfig(levelNum);

    if (!config) {
      return NextResponse.json(
        { error: '等级不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      config
    });
  } catch (error) {
    console.error('[AdminLevelDetail API] 获取等级配置失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }

/**
 * 更新等级权限
 */

export const PUT = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.points.edit'] },
  async (request: NextRequest, user: any) => {

  try {
    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
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
      console.error('[AdminLevelDetail API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查超级管理员权限
    if (userRole.role !== 'super_admin') {
      return NextResponse.json(
        { error: '无权限，需要超级管理员权限' },
        { status: 403 }
      );
    }

    // 获取参数
    const { level } = await params;
    const levelNum = parseInt(level);

    // 获取请求体
    const body = await request.json();
    const { changes, reason } = body;

    if (!changes) {
      return NextResponse.json(
        { error: '缺少参数：changes' },
        { status: 400 }
      );
    }

    console.log('[AdminLevelDetail API] 更新等级权限:', { level: levelNum, reason });

    // 更新等级权限
    const result = await userLevelService.updateLevelPermissions(
      levelNum,
      Number(currentUser.id),
      changes,
      reason || '管理员手动调整'
    );

    if (!result) {
      return NextResponse.json(
        { error: '更新等级权限失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '等级权限更新成功'
    });
  } catch (error) {
    console.error('[AdminLevelDetail API] 更新等级权限失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
