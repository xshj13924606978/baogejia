import { NextRequest, NextResponse } from 'next/server';
import { tokenBillingService } from '@/lib/token-billing-service';
import { requireAuth } from '@/lib/auth-utils';

/**
 * 用户消费记录API
 *
 * 功能：
 * - GET: 获取用户消费记录
 */

export async function GET(request: NextRequest) {
  try {
    // 获取当前用户
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    // 获取查询参数
    const { searchParams } = new URL(request.url);
    const limit = parseInt(searchParams.get('limit') || '50');
    const offset = parseInt(searchParams.get('offset') || '0');


    // 获取消费记录
    const logs = await tokenBillingService.getUserConsumptionLogs(
      parseInt(currentUser.id),
      limit,
      offset
    );

    return NextResponse.json({
      success: true,
      data: logs,
      total: logs.length,
    });
  } catch (error) {
    console.error('[UserConsumption API] 获取消费记录异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
