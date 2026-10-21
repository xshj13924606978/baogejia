import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { TeamService } from '@/lib/team-service';
import { UpdateTeamRequest } from '@/types/team';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * #[20260902-0900] 身份改由服务端 session 解析（requireAuth），
 * 团队可见/可改/可删均以「当前用户是否为该团队成员」为准。
 */

/**
 * 获取团队详情（非成员返回 404）
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: teamId } = await params;
    const team = await TeamService.getTeam(teamId, user.id);

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
        error: safeErrorMessage(error, '获取团队详情失败'),
      },
      { status: 500 }
    );
  }
}

/**
 * 更新团队信息（owner / admin）
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: teamId } = await params;
    const body: UpdateTeamRequest = await request.json();

    const team = await TeamService.updateTeam(teamId, user.id, body);

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
        error: safeErrorMessage(error, '更新团队失败'),
      },
      { status: 500 }
    );
  }
}

/**
 * 删除团队（仅 owner）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: teamId } = await params;
    const success = await TeamService.deleteTeam(teamId, user.id);

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
        error: safeErrorMessage(error, '删除团队失败'),
      },
      { status: 500 }
    );
  }
}
