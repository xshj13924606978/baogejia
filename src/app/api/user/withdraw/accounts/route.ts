// 用户提现账户 API（绑定/查询）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getWithdrawAccount, saveWithdrawAccount, isUuidUserId } from '@/lib/withdraw-service';

export const dynamic = 'force-dynamic';

/** GET /api/user/withdraw/accounts - 获取当前用户提现账户 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    if (!isUuidUserId(user.id)) {
      return NextResponse.json({ success: true, account: null });
    }
    const account = await getWithdrawAccount(user.id);
    return NextResponse.json({ success: true, account });
  } catch (error) {
    console.error('[WithdrawAccounts] 查询失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}

/** POST /api/user/withdraw/accounts - 绑定/更新提现账户 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    if (!isUuidUserId(user.id)) {
      return NextResponse.json({ success: false, error: '当前账号未完成正式注册，暂不支持提现，请先注册并登录' }, { status: 400 });
    }

    const body = await request.json();
    const info = {
      wechat_openid: body.wechat_openid || null,
      alipay_account: body.alipay_account || null,
      bank_name: body.bank_name || null,
      bank_card: body.bank_card || null,
      bank_holder: body.bank_holder || null,
    };

    if (!info.wechat_openid && !info.alipay_account && !info.bank_card) {
      return NextResponse.json({ success: false, error: '至少填写一种提现方式（微信/支付宝/银行卡）' }, { status: 400 });
    }

    const result = await saveWithdrawAccount(user.id, info);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 500 });
    }
    return NextResponse.json({ success: true, account: result.account });
  } catch (error) {
    console.error('[WithdrawAccounts] 保存失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
