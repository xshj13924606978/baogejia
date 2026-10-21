import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { TeamService } from '@/lib/team-service';
import { InviteMemberRequest, TeamRole } from '@/types/team';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * #[20260902-0900] 团队邀请机制
 *
 * 修复前：邀请只写内存，接受邀请仅凭可枚举的 inviteId，且身份取自伪造请求头。
 * 修复后：
 *   - 邀请落库并生成一次性 token（32 字节随机串），受邀人凭 token 加入
 *   - 邀请人必须是团队 owner/admin
 *   - 接受者身份由服务端 session 解析，杜绝冒领
 */

/**
 * 获取团队邀请列表（owner / admin）
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: teamId } = await params;
    const invites = await TeamService.getTeamInvites(teamId, user.id);

    return NextResponse.json({
      success: true,
      data: invites,
    });
  } catch (error) {
    console.error('获取团队邀请失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '获取团队邀请失败'),
      },
      { status: 500 }
    );
  }
}

/**
 * 邀请成员（owner / admin）
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: teamId } = await params;
    const body: InviteMemberRequest = await request.json();

    if (!body.emails || body.emails.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '请输入邀请邮箱',
        },
        { status: 400 }
      );
    }

    if (body.role && !Object.values(TeamRole).includes(body.role)) {
      return NextResponse.json(
        {
          success: false,
          error: '无效的角色',
        },
        { status: 400 }
      );
    }

    const invites = await TeamService.inviteMembers(teamId, user.id, body);

    return NextResponse.json({
      success: true,
      data: invites,
      message: `已发送 ${invites.length} 个邀请`,
    });
  } catch (error) {
    console.error('邀请成员失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '邀请成员失败'),
      },
      { status: 500 }
    );
  }
}

/**
 * 说明：接受邀请接口位于静态路由 /api/teams/invites（PUT），
 *      因为受邀人打开邀请链接时只有 token、没有团队 ID。
 *      Next.js 中静态路由优先于 [id] 动态路由，两者不会冲突。
 */
