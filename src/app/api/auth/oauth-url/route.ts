export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { isOAuthConfigured, getWechatAuthUrl } from '@/lib/oauth';
import { getCurrentUser, AuthDatabaseError } from '@/lib/auth-utils';

/**
 * 微信扫码登录授权 URL 入口（#20260820-1600）
 * GET /api/auth/oauth-url?provider=wechat&mode=login|bind
 *
 * - mode=login：未登录状态发起微信扫码登录
 * - mode=bind：已登录用户绑定微信（state 携带 bind:<userId>:<随机>，回调时识别）
 * - 微信凭据未配置时返回明确错误（不 mock、不伪造用户）
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const provider = searchParams.get('provider') || 'wechat';
    const mode = searchParams.get('mode') || 'login';

    if (provider !== 'wechat') {
      return NextResponse.json({ success: false, error: '暂不支持该登录方式' }, { status: 400 });
    }

    // 凭据未配置：优雅降级提示（前端应隐藏/禁用微信入口）
    if (!isOAuthConfigured('wechat')) {
      return NextResponse.json(
        { success: false, error: '微信登录暂未开通，请使用手机号或密码登录' },
        { status: 503 }
      );
    }

    let state: string;
    if (mode === 'bind') {
      // 绑定模式：需要当前已登录用户
      const user = await getCurrentUser(request);
      if (!user) {
        return NextResponse.json({ success: false, error: '请先登录后再绑定微信' }, { status: 401 });
      }
      state = `bind:${user.id}:${randomBytes(8).toString('hex')}`;
    } else {
      state = `login:${randomBytes(8).toString('hex')}`;
    }

    const url = getWechatAuthUrl(state);
    return NextResponse.json({ success: true, url, provider, mode });
  } catch (error) {
    if (error instanceof AuthDatabaseError) {
      return NextResponse.json({ success: false, error: '服务暂不可用' }, { status: 503 });
    }
    console.error('[OAuth] 生成授权 URL 失败:', error);
    return NextResponse.json({ success: false, error: '获取微信登录信息失败' }, { status: 500 });
  }
}
