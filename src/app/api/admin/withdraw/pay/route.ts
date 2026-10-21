// 管理端提现确认打款 API（自动打款 / 手动登记）
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { payWithdraw } from '@/lib/withdraw-service';

async function handlePOST(request: NextRequest, user: any): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { id, mode, transactionId } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少提现记录 ID' }, { status: 400 });
    }

    const result = await payWithdraw(user?.id, id, mode === 'manual' ? 'manual' : 'auto', transactionId || undefined);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, withdraw: result.withdraw, paidMode: result.paidMode });
  } catch (error) {
    console.error('[AdminWithdrawPay] 失败:', error);
    return NextResponse.json({ success: false, error: '确认打款失败' }, { status: 500 });
  }
}

export const POST = withPermissionCheck({ permissions: 'admin.withdraw.pay' }, handlePOST);
