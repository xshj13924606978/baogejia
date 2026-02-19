import { NextRequest, NextResponse } from 'next/server';
import { TeamService } from '@/lib/team-service';
import { TeamRole } from '@/types/team';

/**
 * 更新成员角色
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: teamId, memberId: targetUserId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

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

    const member = await TeamService.updateMemberRole(teamId, userId, {
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
        error: '更新成员角色失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 移除成员
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string; memberId: string }> }
) {
  try {
    const { id: teamId, memberId: targetUserId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const success = await TeamService.removeMember(teamId, userId, targetUserId);

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
        error: '移除成员失败',
      },
      { status: 500 }
    );
  }
}
