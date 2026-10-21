import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { TeamService } from '@/lib/team-service';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * 获取团队成员列表
 * #[20260902-0900] 身份由服务端 session 解析；非成员返回空列表（不暴露团队是否存在）
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: teamId } = await params;
    const members = await TeamService.getTeamMembers(teamId, user.id);

    return NextResponse.json({
      success: true,
      data: members,
    });
  } catch (error) {
    console.error('获取团队成员失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '获取团队成员失败'),
      },
      { status: 500 }
    );
  }
}
