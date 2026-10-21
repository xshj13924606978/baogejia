// 用户提现记录 API
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getUserWithdrawRecords, isUuidUserId } from '@/lib/withdraw-service';

export const dynamic = 'force-dynamic';

/** GET /api/user/withdraw/records - 获取当前用户提现记录 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    if (!isUuidUserId(user.id)) {
      return NextResponse.json({ success: true, records: [] });
    }
    const records = await getUserWithdrawRecords(user.id);
    return NextResponse.json({ success: true, records });
  } catch (error) {
    console.error('[WithdrawRecords] 查询失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
