// 微信登录 API 路由 - 创建扫码登录

import { NextRequest, NextResponse } from 'next/server';
import { oauthService } from '@/lib/oauth-service';

/**
 * GET /api/auth/wechat - 获取微信扫码登录二维码
 */
export async function GET() {
  try {
    // 创建微信扫码登录二维码
    const result = await oauthService.createWechatQrCode();

    if (!result.success) {
      return NextResponse.json(
        { success: false, error: result.error },
        { status: 500 }
      );
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[Wechat OAuth] 获取二维码失败:', error);
    return NextResponse.json(
      { success: false, error: '获取二维码失败' },
      { status: 500 }
    );
  }
}
