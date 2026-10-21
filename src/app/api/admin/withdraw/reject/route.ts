// 管理端提现审核拒绝 API（退还积分）
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { rejectWithdraw } from '@/lib/withdraw-service';

async function handlePOST(request: NextRequest, user: any): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { id, reason } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少提现记录 ID' }, { status: 400 });
    }

    const result = await rejectWithdraw(user?.id, id, reason || '管理员拒绝');
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, withdraw: result.withdraw, refunded: result.refunded });
  } catch (error) {
    console.error('[AdminWithdrawReject] 失败:', error);
    return NextResponse.json({ success: false, error: '审核拒绝失败' }, { status: 500 });
  }
}

export const POST = withPermissionCheck({ permissions: 'admin.withdraw.reject' }, handlePOST);
