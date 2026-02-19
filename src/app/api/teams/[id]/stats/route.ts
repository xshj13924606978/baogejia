import { NextRequest, NextResponse } from 'next/server';
import { TeamService } from '@/lib/team-service';

/**
 * 获取团队统计信息
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const stats = await TeamService.getTeamStats(teamId, userId);

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
        error: '获取团队统计失败',
      },
      { status: 500 }
    );
  }
}
