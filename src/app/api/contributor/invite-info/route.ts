export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getUniversalInviteInfo, trackUniversalInviteClick } from '@/lib/contributor/service';

/**
 * 查询通用邀请码信息（公开接口）
 * - 有效：返回邀请人信息，并记录一次访问（点击 +1，首次访问记录渠道来源）
 * - 无效/已使用/已过期：返回 valid=false
 * 查询参数：code=邀请码&ref=渠道（wechat/qq/email/share 等）
 */
export async function GET(request: NextRequest) {
  try {
    const code = request.nextUrl.searchParams.get('code');
    if (!code) {
      return NextResponse.json({ error: '缺少邀请码参数' }, { status: 400 });
    }

    const info = await getUniversalInviteInfo(code);

    // 有效邀请码：记录一次访问（点击统计 + 渠道来源）
    if (info.valid) {
      const ref = request.nextUrl.searchParams.get('ref') || undefined;
      await trackUniversalInviteClick(code, ref);
    }

    return NextResponse.json({ success: true, ...info });
  } catch (error) {
    console.error('[Contributor] 查询通用邀请码异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
