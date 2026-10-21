import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseClient } from '@/storage/database/supabase-client';
// #202608302400 阶段1：等级范围与名称统一来源
import { getLevelName, MAX_LEVEL, MIN_LEVEL, type LevelSource } from '@/lib/level-constants';

/**
 * 用户等级管理API
 * 
 * 功能：
 * - GET: 获取当前用户等级信息
 * - POST: 设置用户等级（需要管理员权限）
 */

/**
 * 获取当前用户等级信息
 */
export async function GET(request: NextRequest) {
  try {
    // 获取当前用户
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;


    // 获取用户等级信息（内部会自动处理临时等级过期降级，#202608302400 P0-3）
    const levelInfo = await userLevelService.getUserLevel(currentUser.id);

    // 即使没有等级信息也返回默认值，不报错
    return NextResponse.json({
      success: true,
      data: levelInfo || {
        level: MIN_LEVEL,
        current_points: 0,
        next_level_points: 1000,
        level_name: getLevelName(MIN_LEVEL),
        role: 'free',
        progress: 0,
        expiry_date: null,
        level_source: 'points' as LevelSource,
        is_expired: false,
      }
    });
  } catch (error) {
    console.error('[UserLevel API] 获取等级信息异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}

/**
 * 设置用户等级（需要管理员权限）
 */
export async function POST(request: NextRequest) {
  try {
    // 获取当前用户
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    // 查询用户角色
    const supabase = getSupabaseClient();
    const { data: userRole, error: roleError } = await supabase
      .from('user_roles')
      .select('role')
      .eq('user_id', currentUser.id)
      .single();

    if (roleError || !userRole) {
      console.error('[UserLevel API] 获取用户角色失败:', roleError);
      return NextResponse.json(
        { error: '获取用户角色失败' },
        { status: 500 }
      );
    }

    // 检查管理员权限
    if (userRole.role !== 'super_admin' && userRole.role !== 'admin') {
      return NextResponse.json(
        { error: '需要管理员权限' },
        { status: 403 }
      );
    }

    const body = await request.json();
    const { userId, level } = body;

    if (!userId || !level) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    // #202608302400 阶段1：等级范围统一为 1-5（原为 1-10，与真实五级体系不符）
    if (level < MIN_LEVEL || level > MAX_LEVEL) {
      return NextResponse.json(
        { error: `等级必须在${MIN_LEVEL}-${MAX_LEVEL}之间` },
        { status: 400 }
      );
    }

    // 设置用户等级（管理员设置为永久等级，不带有效期）
    const success = await userLevelService.setUserLevel(userId, level, { source: 'admin' });

    if (success) {
      return NextResponse.json({
        success: true,
        message: '设置成功'
      });
    } else {
      return NextResponse.json(
        { error: '设置失败' },
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('[UserLevel API] 设置等级异常:', error);
    return NextResponse.json(
      { error: '服务器错误' },
      { status: 500 }
    );
  }
}
