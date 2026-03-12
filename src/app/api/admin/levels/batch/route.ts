import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { userLevelService } from '@/lib/user-level-service';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 批量更新等级API
 *
 * 功能：批量更新多个等级的权限配置
 * 权限：仅超级管理员
 */


export const POST = withPermissionCheck(
  {"minLevel":4,"roles":["super_admin"]},
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
      console.error('[AdminLevelsBatch API] 获取用户角色失败:', roleError);
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

    // 获取请求体
    const body = await request.json();
    const { updates } = body;

    if (!updates || !Array.isArray(updates) || updates.length === 0) {
      return NextResponse.json(
        { error: '缺少参数：updates（必须是非空数组）' },
        { status: 400 }
      );
    }

    // 验证每个更新项的格式
    for (const update of updates) {
      if (!update.level || !update.changes) {
        return NextResponse.json(
          { error: '每个更新项必须包含 level 和 changes 字段' },
          { status: 400 }
        );
      }
    }

    console.log('[AdminLevelsBatch API] 批量更新等级:', updates.length, '个等级');

    // 批量更新等级
    const result = await userLevelService.batchUpdateLevels(
      updates,
      Number(currentUser.id)
    );

    return NextResponse.json({
      success: true,
      data: result
    });
  } catch (error) {
    console.error('[AdminLevelsBatch API] 批量更新等级失败:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
