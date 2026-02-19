import { NextRequest, NextResponse } from 'next/server';
import { TeamService } from '@/lib/team-service';
import { InviteMemberRequest } from '@/types/team';

/**
 * 邀请成员
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const body: InviteMemberRequest = await request.json();

    // 验证必填字段
    if (!body.emails || body.emails.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '请输入邀请邮箱',
        },
        { status: 400 }
      );
    }

    const invites = await TeamService.inviteMembers(teamId, userId, body);

    return NextResponse.json({
      success: true,
      data: invites,
      message: `已发送 ${invites.length} 个邀请`,
    });
  } catch (error: any) {
    console.error('邀请成员失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '邀请成员失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 接受邀请
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const body = await request.json();
    const { inviteId, nickname, email, avatar } = body;

    if (!inviteId) {
      return NextResponse.json(
        {
          success: false,
          error: '邀请ID不能为空',
        },
        { status: 400 }
      );
    }

    const member = await TeamService.acceptInvite(inviteId, userId, {
      nickname,
      email,
      avatar,
    });

    if (!member) {
      return NextResponse.json(
        {
          success: false,
          error: '邀请不存在或已过期',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: member,
      message: '已成功加入团队',
    });
  } catch (error) {
    console.error('接受邀请失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '接受邀请失败',
      },
      { status: 500 }
    );
  }
}
