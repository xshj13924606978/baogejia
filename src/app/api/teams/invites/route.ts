import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { TeamService } from '@/lib/team-service';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * #[20260902-0900] 接受团队邀请（静态路由，优先于 /api/teams/[id]/invites）
 *
 * 受邀人点击邀请链接（/team/join?token=xxx）时只有一次性 token、没有团队 ID，
 * 因此接受邀请接口独立于团队维度路由存在，凭 token 定位邀请记录。
 *
 * 安全：
 *   - 必须登录（requireAuth），身份取服务端 session，不接受请求体中的身份字段
 *   - token 一次性：接受成功后邀请状态置为 accepted，重复使用会失败
 *   - 过期自动置为 expired
 */

export async function PUT(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const body = await request.json();
    const { token } = body as { token?: string };

    if (!token) {
      return NextResponse.json(
        {
          success: false,
          error: '邀请 token 不能为空',
        },
        { status: 400 }
      );
    }

    const member = await TeamService.acceptInvite(String(token), user.id);

    if (!member) {
      return NextResponse.json(
        {
          success: false,
          error: '邀请不存在、已过期或已被使用',
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
        error: safeErrorMessage(error, '接受邀请失败'),
      },
      { status: 500 }
    );
  }
}
