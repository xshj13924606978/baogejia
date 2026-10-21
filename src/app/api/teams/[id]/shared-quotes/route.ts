import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { TeamService } from '@/lib/team-service';
import { ShareQuoteRequest } from '@/types/team';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * #[20260902-0900] 团队共享报价单
 * 身份由服务端 session 解析；共享目标团队强制取 URL 中的团队 ID，
 * 忽略请求体里的 teamId，防止越权把报价共享到他人团队。
 */

/**
 * 获取团队共享的报价单（非成员返回空列表）
 */
export async function GET(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: teamId } = await params;
    const sharedQuotes = await TeamService.getTeamSharedQuotes(teamId, user.id);

    return NextResponse.json({
      success: true,
      data: sharedQuotes,
    });
  } catch (error) {
    console.error('获取共享报价单失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '获取共享报价单失败'),
      },
      { status: 500 }
    );
  }
}

/**
 * 共享报价单到团队（需为团队成员）
 */
export async function POST(request: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse || !user) return errorResponse;

    const { id: teamId } = await params;
    const body: ShareQuoteRequest = await request.json();

    if (!body.quoteId) {
      return NextResponse.json(
        {
          success: false,
          error: '报价单 ID 不能为空',
        },
        { status: 400 }
      );
    }

    // 强制使用 URL 中的团队 ID，避免请求体伪造团队归属
    const sharedQuote = await TeamService.shareQuote(user.id, {
      ...body,
      teamId,
    });

    if (!sharedQuote) {
      return NextResponse.json(
        {
          success: false,
          error: '团队不存在或您不是该团队成员',
        },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: sharedQuote,
      message: '报价单共享成功',
    });
  } catch (error) {
    console.error('共享报价单失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: safeErrorMessage(error, '共享报价单失败'),
      },
      { status: 500 }
    );
  }
}
