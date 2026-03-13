import { NextRequest, NextResponse } from 'next/server';
import { TeamService } from '@/lib/team-service';
import { UpdateCommentRequest } from '@/types/team';

/**
 * 更新评论
 */
export async function PUT(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { id: commentId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

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

    const comment = await TeamService.updateComment(commentId, userId, body);

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
        error: '更新评论失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 删除评论
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: commentId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const success = await TeamService.deleteComment(commentId, userId);

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
        error: '删除评论失败',
      },
      { status: 500 }
    );
  }
}
