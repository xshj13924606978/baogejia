// 提现配置 API（用户端只读，配置来自 site_config）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getWithdrawConfig } from '@/lib/withdraw-service';

export const dynamic = 'force-dynamic';

/** GET /api/user/withdraw/config - 获取提现配置（最低积分/比例/手续费/开关） */
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const config = await getWithdrawConfig();
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('[WithdrawConfig] 读取失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
