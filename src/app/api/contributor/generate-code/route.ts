export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { generateUniversalInviteCode, getInviteBaseUrl } from '@/lib/contributor/service';

/**
 * 生成通用邀请码（无需登录，人人可转发）
 * - 已登录用户：邀请码绑定当前用户为创建者（首次被使用后成为邀请人）
 * - 未登录：生成未绑定的通用邀请码（仅用于分享，不产生邀请奖励）
 * 请求体（可选）：{ source?: string } 渠道来源（wechat/qq/email/share 等）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const source = typeof body.source === 'string' ? body.source.slice(0, 50) : undefined;

    // 已登录则绑定为创建者（未认证时 getCurrentUser 返回 null，不会抛错）
    let creatorId: string | undefined;
    try {
      const user = await getCurrentUser(request);
      if (user?.id) {
        creatorId = user.id;
      }
    } catch (e) {
      // 获取用户失败（如数据库异常）时，仍允许生成未绑定邀请码
      console.error('[Contributor] 生成通用邀请码时获取用户失败:', e);
    }

    const result = await generateUniversalInviteCode(creatorId, source);
    if (!result.success || !result.code) {
      return NextResponse.json({ error: result.error || '生成邀请码失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      code: result.code,
      link: `${getInviteBaseUrl(request)}/contributor/upload?code=${result.code}`,
      bound: Boolean(creatorId),
    });
  } catch (error) {
    console.error('[Contributor] 生成通用邀请码异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
