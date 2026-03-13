import { NextRequest, NextResponse } from 'next/server';
import { TeamService } from '@/lib/team-service';
import { CreateCommentRequest, UpdateCommentRequest } from '@/types/team';

/**
 * 获取评论列表
 */
export async function GET(request: NextRequest) {
  try {
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

    const comments = await TeamService.getComments(targetId);

    return NextResponse.json({
      success: true,
      data: comments,
    });
  } catch (error) {
    console.error('获取评论失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取评论失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 创建评论
 */
export async function POST(request: NextRequest) {
  try {
    const userId = request.headers.get('x-user-id') || 'demo_user_1';
    const userName = request.headers.get('x-user-name') || `用户${userId.substring(0, 6)}`;
    const userAvatar = request.headers.get('x-user-avatar') || undefined;

    const body: CreateCommentRequest = await request.json();

    // 验证必填字段
    if (!body.targetId || !body.content) {
      return NextResponse.json(
        {
          success: false,
          error: 'targetId 和 content 不能为空',
        },
        { status: 400 }
      );
    }

    const comment = await TeamService.createComment(userId, userName, userAvatar, body);

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
        error: '创建评论失败',
      },
      { status: 500 }
    );
  }
}
