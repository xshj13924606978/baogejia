import { NextRequest, NextResponse } from 'next/server';
import { TeamService } from '@/lib/team-service';
import { CreateTeamRequest, UpdateTeamRequest } from '@/types/team';

/**
 * 获取用户的所有团队
 */
export async function GET(request: NextRequest) {
  try {
    // 从请求中获取用户ID（实际项目中应该从session或token中获取）
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const teams = await TeamService.getUserTeams(userId);

    return NextResponse.json({
      success: true,
      data: teams,
    });
  } catch (error) {
    console.error('获取团队列表失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取团队列表失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 创建团队
 */
export async function POST(request: NextRequest) {
  try {
    // 从请求中获取用户ID
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const body: CreateTeamRequest = await request.json();

    // 验证必填字段
    if (!body.name || body.name.trim().length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '团队名称不能为空',
        },
        { status: 400 }
      );
    }

    const team = await TeamService.createTeam(userId, body);

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
        error: '创建团队失败',
      },
      { status: 500 }
    );
  }
}
