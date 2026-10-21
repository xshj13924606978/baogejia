import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { TeamService } from '@/lib/team-service';
import { TeamRole } from '@/types/team';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * #[20260902-0900] 团队成员管理
 *
 * 说明：路径参数 memberId 实际是「目标用户的 userId」（沿用既有前端约定）。
 * 权限：owner/admin 可改他人角色与移除他人；成员可自行退出；创建者不可被改角色或移除。
 */

/**
 * 更新成员角色（owner / admin）
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: teamId, memberId: targetUserId } = await params;
    const body = await request.json();
    const { role } = body;

    if (!Object.values(TeamRole).includes(role)) {
      return NextResponse.json(
        {
          success: false,
          error: '无效的角色',
        },
        { status: 400 }
      );
    }

    const member = await TeamService.updateMemberRole(teamId, user.id, {
      userId: targetUserId,
      role,
    });

    if (!member) {
      return NextResponse.json(
        {
          success: false,
          error: '成员不存在或无权修改',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: member,
      message: '成员角色更新成功',
    });
  } catch (error) {
    console.error('更新成员角色失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '更新成员角色失败'),
      },
      { status: 500 }
    );
  }
}

/**
 * 移除成员（owner/admin 移除他人，或成员自行退出）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: teamId, memberId: targetUserId } = await params;
    const success = await TeamService.removeMember(teamId, user.id, targetUserId);

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: '成员不存在或无权移除',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '成员移除成功',
    });
  } catch (error) {
    console.error('移除成员失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '移除成员失败'),
      },
      { status: 500 }
    );
  }
}
