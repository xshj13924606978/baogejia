import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { TeamService } from '@/lib/team-service';
import { CreateCommentRequest } from '@/types/team';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * #[20260902-0900] 团队评论接口
 *
 * 修复前：身份与昵称均取自可伪造请求头（x-user-id / x-user-name），
 *        前端硬编码 'demo_user_1' 与 '演示用户'，导致评论全是虚假身份且数据存于内存。
 * 修复后：身份由服务端 session 解析，昵称/头像按 userId 从 users 表关联，
 *        评论必须发生在用户所属团队内（非成员不可读、不可写）。
 */

/**
 * 获取评论列表（需为团队成员）
 */
export async function GET(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { searchParams } = new URL(request.url);
    const targetId = searchParams.get('targetId');

    if (!targetId) {
      return NextResponse.json(
        {
          success: false,
          error: 'targetId 参数不能为空',
        },
        { status: 400 }
      );
    }

    // targetId 即团队 ID（评论功能当前仅在团队页使用）
    const comments = await TeamService.getComments(targetId, user.id);

    return NextResponse.json({
      success: true,
      data: comments,
    });
  } catch (error) {
    console.error('获取评论失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '获取评论失败'),
      },
      { status: 500 }
    );
  }
}

/**
 * 创建评论（需为团队成员且具备评论权限）
 */
export async function POST(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const body: CreateCommentRequest = await request.json();

    if (!body.targetId || !body.content) {
      return NextResponse.json(
        {
          success: false,
          error: 'targetId 和 content 不能为空',
        },
        { status: 400 }
      );
    }

    // 团队页场景下 targetId 即 teamId；若前端显式传入 teamId 则以之为准
    const teamId = body.teamId || body.targetId;

    const comment = await TeamService.createComment(user.id, {
      ...body,
      teamId,
    });

    if (!comment) {
      return NextResponse.json(
        {
          success: false,
          error: '团队不存在、您不是该团队成员或无评论权限',
        },
        { status: 403 }
      );
    }

    return NextResponse.json({
      success: true,
      data: comment,
      message: '评论发布成功',
    });
  } catch (error) {
    console.error('创建评论失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '创建评论失败'),
      },
      { status: 500 }
    );
  }
}
