import { NextRequest, NextResponse } from 'next/server';
import { TeamService } from '@/lib/team-service';
import { ShareQuoteRequest } from '@/types/team';

/**
 * 获取团队共享的报价单
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const sharedQuotes = await TeamService.getTeamSharedQuotes(teamId, userId);

    return NextResponse.json({
      success: true,
      data: sharedQuotes,
    });
  } catch (error) {
    console.error('获取共享报价单失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取共享报价单失败',
      },
      { status: 500 }
    );
  }
}

/**
 * 共享报价单到团队
 */
export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: teamId } = await params;
    const userId = request.headers.get('x-user-id') || 'demo_user_1';

    const body: ShareQuoteRequest = await request.json();

    const sharedQuote = await TeamService.shareQuote(userId, body);

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
        error: '共享报价单失败',
      },
      { status: 500 }
    );
  }
}
