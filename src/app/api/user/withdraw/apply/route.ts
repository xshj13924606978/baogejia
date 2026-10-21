// 用户申请提现 API
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { applyWithdraw, getWithdrawConfig } from '@/lib/withdraw-service';

export const dynamic = 'force-dynamic';

/** POST /api/user/withdraw/apply - 申请提现
 * body: { points: number, account_type: 'wechat'|'alipay'|'bank', account_info: {...}, remark?: string }
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { points, account_type, account_info, remark } = body;

    if (!points || !account_type || !account_info) {
      return NextResponse.json({ success: false, error: '缺少必要参数' }, { status: 400 });
    }

    const config = await getWithdrawConfig();
    const result = await applyWithdraw({
      userId: user.id,
      points: Number(points),
      accountType: account_type,
      accountInfo: account_info,
      remark: remark || null,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason || '提现申请失败' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      withdraw: result.withdraw,
      message: '提现申请已提交，等待管理员审核',
      config: {
        minPoints: config.minPoints,
        minAmount: config.minAmount,
        rate: config.rate,
        feeRate: config.feeRate,
      },
    });
  } catch (error) {
    console.error('[WithdrawApply] 申请失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
