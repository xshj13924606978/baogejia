import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { TeamService } from '@/lib/team-service';
import { UpdateCommentRequest } from '@/types/team';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * #[20260902-0900] 评论编辑/删除
 * 身份由服务端 session 解析，且仅作者本人可修改或删除自己的评论。
 */

/**
 * 更新评论（仅作者本人）
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: commentId } = await params;
    const body: UpdateCommentRequest = await request.json();

    if (!body.content) {
      return NextResponse.json(
        {
          success: false,
          error: 'content 不能为空',
        },
        { status: 400 }
      );
    }

    const comment = await TeamService.updateComment(commentId, user.id, body);

    if (!comment) {
      return NextResponse.json(
        {
          success: false,
          error: '评论不存在或无权修改',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: comment,
      message: '评论更新成功',
    });
  } catch (error) {
    console.error('更新评论失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '更新评论失败'),
      },
      { status: 500 }
    );
  }
}

/**
 * 删除评论（仅作者本人）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: commentId } = await params;
    const success = await TeamService.deleteComment(commentId, user.id);

    if (!success) {
      return NextResponse.json(
        {
          success: false,
          error: '评论不存在或无权删除',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '评论删除成功',
    });
  } catch (error) {
    console.error('删除评论失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '删除评论失败'),
      },
      { status: 500 }
    );
  }
}
