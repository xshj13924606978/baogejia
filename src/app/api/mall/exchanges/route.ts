// 用户兑换记录 API
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getUserExchanges, confirmExchangeReceive } from '@/lib/mall-service';

export const dynamic = 'force-dynamic';

/** GET /api/mall/exchanges - 获取当前用户兑换记录 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const records = await getUserExchanges(user.id);
    return NextResponse.json({ success: true, records });
  } catch (error) {
    console.error('[MallExchanges] 查询失败:', error);
    return NextResponse.json({ success: false, error: '获取兑换记录失败' }, { status: 500 });
  }
}

/** POST /api/mall/exchanges - 用户确认收货 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { exchangeId } = body;
    if (!exchangeId) {
      return NextResponse.json({ success: false, error: '缺少兑换记录 ID' }, { status: 400 });
    }
    const result = await confirmExchangeReceive(user.id, exchangeId);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, exchange: result.exchange });
  } catch (error) {
    console.error('[MallExchangeConfirm] 确认收货失败:', error);
    return NextResponse.json({ success: false, error: '确认收货失败' }, { status: 500 });
  }
}
