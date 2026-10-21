import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { TeamService } from '@/lib/team-service';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * 获取当前用户在团队内的权限
 * #[20260902-0900] 身份由服务端 session 解析；非成员返回 404
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: teamId } = await params;
    const permissions = await TeamService.getUserPermissions(teamId, user.id);

    if (!permissions) {
      return NextResponse.json(
        {
          success: false,
          error: '团队不存在或您不是该团队成员',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: permissions,
    });
  } catch (error) {
    console.error('获取权限失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '获取权限失败'),
      },
      { status: 500 }
    );
  }
}
