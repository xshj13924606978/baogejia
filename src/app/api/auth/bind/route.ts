// 绑定账号 API 路由

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
  },
];

/**
 * POST /api/auth/bind - 绑定第三方账号
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, openid, username, password, nickname, avatar } = body;

    // 验证必填参数
    if (!provider || !openid || !username || !password) {
      return NextResponse.json(
        { success: false, error: '缺少必填参数' },
        { status: 400 }
      );
    }

    // 验证提供商
    if (!Object.values(OAuthProvider).includes(provider)) {
      return NextResponse.json(
        { success: false, error: '不支持的登录提供商' },
        { status: 400 }
      );
    }

    // 验证用户名和密码
    const user = mockUsers.find(
      (u) => u.username === username && u.password === password
    );

    if (!user) {
      return NextResponse.json(
        { success: false, error: '用户名或密码错误' },
        { status: 401 }
      );
    }

    // 检查是否已绑定
    const existingBinding = await oauthService.getBinding(
      provider as OAuthProvider,
      openid
    );

    if (existingBinding) {
      return NextResponse.json(
        { success: false, error: '该账号已绑定' },
        { status: 400 }
      );
    }

    // 创建绑定
    await oauthService.createBinding(user.id, {
      provider: provider as OAuthProvider,
      openid,
      nickname: nickname || user.nickname,
      avatar: avatar || user.avatar,
    });

    console.log(`[Auth] 用户 ${username} 绑定 ${provider} 成功`);

    // 更新用户信息（头像和昵称）
    if (nickname || avatar) {
      if (nickname) user.nickname = nickname;
      if (avatar) user.avatar = avatar;
    }

    return NextResponse.json({
      success: true,
      user: {
        id: user.id,
        username: user.username,
        nickname: user.nickname,
        avatar: user.avatar,
        role: user.role,
        points: user.points,
      },
    });
  } catch (error) {
    console.error('[Auth] 绑定账号失败:', error);
    return NextResponse.json(
      { success: false, error: '绑定账号失败' },
      { status: 500 }
    );
  }
}

/**
 * GET /api/auth/bind - 查询用户绑定列表
 */
export async function GET(request: NextRequest) {
  try {
    // 从Authorization header获取用户信息
    const authHeader = request.headers.get('authorization');
    if (!authHeader) {
      return NextResponse.json(
        { success: false, error: '未登录' },
        { status: 401 }
      );
    }

    // 简化处理：从localStorage获取（实际应该从token解析）
    const userId = 1; // 模拟

    // 查询用户的绑定列表
    const bindings = await oauthService.getUserBindings(userId);

    return NextResponse.json({
      success: true,
      bindings,
    });
  } catch (error) {
    console.error('[Auth] 查询绑定列表失败:', error);
    return NextResponse.json(
      { success: false, error: '查询绑定列表失败' },
      { status: 500 }
    );
  }
}

/**
 * DELETE /api/auth/bind - 解绑第三方账号
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, password } = body;

    // 验证必填参数
    if (!provider || !password) {
      return NextResponse.json(
        { success: false, error: '缺少必填参数' },
        { status: 400 }
      );
    }

    // 验证提供商
    if (!Object.values(OAuthProvider).includes(provider)) {
      return NextResponse.json(
        { success: false, error: '不支持的登录提供商' },
        { status: 400 }
      );
    }

    // 验证密码
    const userId = 1; // 模拟
    const user = mockUsers.find((u) => u.id === userId);

    if (!user || user.password !== password) {
      return NextResponse.json(
        { success: false, error: '密码错误' },
        { status: 401 }
      );
    }

    // 解绑账号
    const success = await oauthService.unbindAccount(userId, provider as OAuthProvider);

    if (!success) {
      return NextResponse.json(
        { success: false, error: '未找到绑定记录' },
        { status: 404 }
      );
    }

    console.log(`[Auth] 用户 ${userId} 解绑 ${provider} 成功`);

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    console.error('[Auth] 解绑账号失败:', error);
    return NextResponse.json(
      { success: false, error: '解绑账号失败' },
      { status: 500 }
    );
  }
}
