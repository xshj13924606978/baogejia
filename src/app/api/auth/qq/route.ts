// QQ 登录 API 路由 - 创建授权链接

import {  NextResponse } from 'next/server';
import { oauthService } from '@/lib/oauth-service';

/**
 * GET /api/auth/qq - 获取QQ登录授权URL
 */
export async function GET() {
  try {
    // 创建QQ登录授权URL
    const result = await oauthService.createQQAuthUrl();

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('[QQ OAuth] 获取授权URL失败:', error);
    return NextResponse.json({ success: false, error: '获取授权URL失败' }, { status: 500 });
  }
}
