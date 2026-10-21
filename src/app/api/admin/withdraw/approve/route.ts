// 管理端提现审核通过 API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { approveWithdraw } from '@/lib/withdraw-service';

async function handlePOST(request: NextRequest, user: any): Promise<NextResponse> {
  try {
    const body = await request.json();
    const { id } = body;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少提现记录 ID' }, { status: 400 });
    }

    const result = await approveWithdraw(user?.id, id);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, withdraw: result.withdraw });
  } catch (error) {
    console.error('[AdminWithdrawApprove] 失败:', error);
    return NextResponse.json({ success: false, error: '审核通过失败' }, { status: 500 });
  }
}

export const POST = withPermissionCheck({ permissions: 'admin.withdraw.approve' }, handlePOST);
