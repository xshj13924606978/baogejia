// 微信登录 API 路由 - 获取扫码登录授权地址（#20260820-1600 重构，去掉 mock 伪造）

import { NextRequest, NextResponse } from 'next/server';
import { randomBytes } from 'crypto';
import { isOAuthConfigured, getWechatAuthUrl } from '@/lib/oauth';

/**
 * GET /api/auth/wechat - 获取微信扫码登录授权 URL
 * 兼容旧前端字段名 qr_code_url（新窗口打开即微信授权页）
 */
export async function GET(request: NextRequest) {
  try {
    if (!isOAuthConfigured('wechat')) {
      return NextResponse.json(
        { success: false, error: '微信登录暂未开通，请使用手机号或密码登录' },
        { status: 503 }
      );
    }

    const state = `login:${randomBytes(8).toString('hex')}`;
    const url = getWechatAuthUrl(state);

    return NextResponse.json({
      success: true,
      qr_code_url: url,
      expire_time: 300,
    });
  } catch (error) {
    console.error('[Wechat OAuth] 获取授权地址失败:', error);
    return NextResponse.json({ success: false, error: '获取微信登录信息失败' }, { status: 500 });
  }
}
