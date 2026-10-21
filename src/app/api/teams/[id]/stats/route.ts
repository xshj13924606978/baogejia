import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { TeamService } from '@/lib/team-service';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * 获取团队统计信息
 * #[20260902-0900] 身份由服务端 session 解析；非成员不可见
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: teamId } = await params;
    const stats = await TeamService.getTeamStats(teamId, user.id);

    if (!stats) {
      return NextResponse.json(
        {
          success: false,
          error: '团队不存在或无权访问',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('获取团队统计失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '获取团队统计失败'),
      },
      { status: 500 }
    );
  }
}
