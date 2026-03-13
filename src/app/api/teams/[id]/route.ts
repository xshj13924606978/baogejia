import { NextRequest, NextResponse } from 'next/server';
import { TeamService } from '@/lib/team-service';
import { UpdateTeamRequest } from '@/types/team';

/**
 * 获取团队详情
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: teamId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const team = await TeamService.getTeam(teamId, userId);

    if (!team) {
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
      data: team,
    });
  } catch (error) {
    console.error('获取团队详情失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取团队详情失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 更新团队信息
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: teamId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const body: UpdateTeamRequest = await request.json();

    const team = await TeamService.updateTeam(teamId, userId, body);

    if (!team) {
      return NextResponse.json(
        {
          success: false,
          error: '团队不存在或无权修改',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: team,
      message: '团队信息更新成功',
    });
  } catch (error) {
    console.error('更新团队失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '更新团队失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 删除团队
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const success = await TeamService.deleteTeam(teamId, userId);

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: '团队不存在或无权删除',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '团队删除成功',
    });
  } catch (error) {
    console.error('删除团队失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '删除团队失败',
      },
      { status: 500 }
    );
  }
}
