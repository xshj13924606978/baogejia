import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { permissionService } from '@/lib/permission-service';

/**
 * 查看当前用户权限 API
 * 用于调试和查看权限配置
 */

export async function GET(request: NextRequest) {
  try {
    // 获取当前用户
    const user = await getCurrentUser(request);
    
    if (!user || !user.id) {
      return NextResponse.json(
        { error: '未登录或用户信息无效' },
        { status: 401 }
      );
    }

    // 获取用户权限信息
    const userPermissions = await permissionService.getUserPermissions(user.id);

    if (!userPermissions) {
      return NextResponse.json(
        { error: '获取用户权限失败' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: userPermissions
    });
  } catch (error: any) {
    console.error('[UserPermissions API] 错误:', error);
    return NextResponse.json(
      { error: '服务器错误', details: error.message },
      { status: 500 }
    );
  }
}
