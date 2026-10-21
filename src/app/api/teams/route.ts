import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { TeamService } from '@/lib/team-service';
import { CreateTeamRequest } from '@/types/team';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * #[20260902-0900] 团队接口鉴权与持久化改造
 *
 * 修复前：身份取自可伪造的请求头 `x-user-id`，且兜底为常量 'demo_user_1'，
 *        导致所有用户共享同一身份、团队数据互相可见。
 * 修复后：身份一律由服务端 session 解析（requireAuth），数据经 TeamService 落库并按成员关系隔离。
 */

/**
 * 获取「我」的团队列表
 */
export async function GET(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const teams = await TeamService.getUserTeams(user.id);

    return NextResponse.json({
      success: true,
      data: teams,
    });
  } catch (error) {
    console.error('获取团队列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '获取团队列表失败'),
      },
      { status: 500 }
    );
  }
}

/**
 * 创建团队（创建者自动成为 owner）
 */
export async function POST(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const body: CreateTeamRequest = await request.json();

    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '团队名称不能为空',
        },
        { status: 400 }
      );
    }

    const team = await TeamService.createTeam(user.id, body);

    return NextResponse.json({
      success: true,
      data: team,
      message: '团队创建成功',
    });
  } catch (error) {
    console.error('创建团队失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '创建团队失败'),
      },
      { status: 500 }
    );
  }
}
