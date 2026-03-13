import { NextRequest, NextResponse } from 'next/server';
import { TeamService } from '@/lib/team-service';

/**
 * 获取用户权限
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: teamId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const permissions = await TeamService.getUserPermissions(teamId, userId);

    if (!permissions) {
      return NextResponse.json(
        {
          success: false,
          error: '权限不存在或无权访问',
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
        error: '获取权限失败',
      },
      { status: 500 }
    );
  }
}
