import { NextRequest, NextResponse } from 'next/server';
import { userLevelService } from '@/lib/user-level-service';
import { getCurrentUser } from '@/lib/auth-utils';

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
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
        { status: 401 }
      );
    }

    console.log('[UserLevel API] 获取用户等级:', currentUser.id);

    // 获取用户等级信息
    const levelInfo = await userLevelService.getUserLevel(currentUser.id);

    if (!levelInfo) {
      return NextResponse.json(
        { error: '获取等级信息失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: levelInfo
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
    const currentUser = await getCurrentUser(request);
    if (!currentUser || !currentUser.id) {
      return NextResponse.json(
        { error: '未登录' },
        { status: 401 }
      );
    }

    // 检查管理员权限
    if (currentUser.role !== 'super_admin' && currentUser.role !== 'admin') {
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

    if (level < 1 || level > 10) {
      return NextResponse.json(
        { error: '等级必须在1-10之间' },
        { status: 400 }
      );
    }

    console.log('[UserLevel API] 设置用户等级:', { userId, level, operator: currentUser.id });

    // 设置用户等级
    const success = await userLevelService.setUserLevel(userId, level);

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
