// 微信登录回调 API 路由

import { NextRequest, NextResponse } from 'next/server';
import { oauthService } from '@/lib/oauth-service';
import { OAuthProvider } from '@/types/oauth';

// 模拟用户数据
const mockUsers = [
  {
    id: 1,
    username: 'admin',
    password: '123456',
    email: 'admin@example.com',
    nickname: '管理员',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=admin',
    role: 'admin',
    points: 10000,
    created_at: new Date(),
  },
  {
    id: 2,
    username: 'user',
    password: '123456',
    email: 'user@example.com',
    nickname: '普通用户',
    avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=user',
    role: 'user',
    points: 100,
    created_at: new Date(),
  },
];

/**
 * GET /api/auth/wechat/callback - 处理微信登录回调
 */
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const code = searchParams.get('code');
    const state = searchParams.get('state');

    if (!code) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/login?error=no_code`
      );
    }

    // 处理微信登录回调
    const oauthUser = await oauthService.handleWechatCallback(code, state || '');

    if (!oauthUser) {
      return NextResponse.redirect(
        `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/login?error=oauth_failed`
      );
    }

    // 查询是否已有绑定
    const binding = await oauthService.getBinding(OAuthProvider.WECHAT, oauthUser.openid);

    if (binding) {
      // 已绑定，直接登录
      const user = mockUsers.find(u => u.id === binding.user_id);
      if (user) {
        return NextResponse.redirect(
          `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/login?success=true&provider=wechat`
        );
      }
    }

    // 未绑定，跳转到绑定页面
    const bindUrl = new URL(`${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/login`);
    bindUrl.searchParams.set('action', 'bind');
    bindUrl.searchParams.set('provider', 'wechat');
    bindUrl.searchParams.set('openid', oauthUser.openid);
    bindUrl.searchParams.set('nickname', oauthUser.nickname);
    bindUrl.searchParams.set('avatar', oauthUser.avatar || '');

    return NextResponse.redirect(bindUrl.toString());
  } catch (error) {
    console.error('[Wechat OAuth Callback] 处理回调失败:', error);
    return NextResponse.redirect(
      `${process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000'}/login?error=server_error`
    );
  }
}
