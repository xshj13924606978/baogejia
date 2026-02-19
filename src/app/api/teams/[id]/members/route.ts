import { NextRequest, NextResponse } from 'next/server';
import { TeamService } from '@/lib/team-service';

/**
 * 获取团队成员列表
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const members = await TeamService.getTeamMembers(teamId, userId);

    return NextResponse.json({
      success: true,
      data: members,
    });
  } catch (error) {
    console.error('获取团队成员失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取团队成员失败',
      },
      { status: 500 }
    );
  }
}
