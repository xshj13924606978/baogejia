// 绑定账号 API 路由

import { NextRequest, NextResponse } from 'next/server';
import { oauthService } from '@/lib/oauth-service';
import { OAuthProvider } from '@/types/oauth';
import { getCurrentUser, AuthDatabaseError } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import bcrypt from 'bcrypt';

/**
 * POST /api/auth/bind - 绑定第三方账号
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, openid, username, password, nickname, avatar } = body;

    // 验证必填参数
    if (!provider || !openid || !username || !password) {
      return NextResponse.json({ success: false, error: '缺少必填参数' }, { status: 400 });
    }

    // 验证提供商
    if (!Object.values(OAuthProvider).includes(provider)) {
      return NextResponse.json({ success: false, error: '不支持的登录提供商' }, { status: 400 });
    }

    // 从数据库验证用户名和密码
    const db = getSupabaseServiceClient();
    const { data: dbUser, error: queryError } = await db
      .from('users')
      .select('*')
      .eq('username', username)
      .eq('status', 'active')
      .single();

    if (queryError || !dbUser) {
      return NextResponse.json({ success: false, error: '用户名或密码错误' }, { status: 401 });
    }

    // 使用 bcrypt 验证密码
    const passwordMatch = await bcrypt.compare(password, dbUser.password_hash);
    if (!passwordMatch) {
      return NextResponse.json({ success: false, error: '用户名或密码错误' }, { status: 401 });
    }

    // 检查是否已绑定
    const existingBinding = await oauthService.getBinding(provider as OAuthProvider, openid);

    if (existingBinding) {
      return NextResponse.json({ success: false, error: '该账号已绑定' }, { status: 400 });
    }

    // 创建绑定
    await oauthService.createBinding(dbUser.id, {
      provider: provider as OAuthProvider,
      openid,
      nickname: nickname || dbUser.username,
      avatar: avatar || '',
    });

    return NextResponse.json({
      success: true,
      user: {
        id: dbUser.id,
        username: dbUser.username,
        nickname: nickname || dbUser.username,
        avatar: avatar || '',
        role: dbUser.role,
      },
    });
  } catch (error) {
    console.error('[Auth] 绑定账号失败:', error);
    return NextResponse.json({ success: false, error: '绑定账号失败' }, { status: 500 });
  }
}

/**
 * GET /api/auth/bind - 查询用户绑定列表
 */
export async function GET(request: NextRequest) {
  try {
    // 从认证中获取用户身份
    const authUser = await getCurrentUser(request);

    if (!authUser) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    // 查询用户的绑定列表
    const bindings = await oauthService.getUserBindings(authUser.id);

    return NextResponse.json({
      success: true,
      bindings,
    });
  } catch (error) {
    if (error instanceof AuthDatabaseError) {
      return NextResponse.json({ success: false, error: '服务暂不可用' }, { status: 503 });
    }
    console.error('[Auth] 查询绑定列表失败:', error);
    return NextResponse.json({ success: false, error: '查询绑定列表失败' }, { status: 500 });
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
      return NextResponse.json({ success: false, error: '缺少必填参数' }, { status: 400 });
    }

    // 验证提供商
    if (!Object.values(OAuthProvider).includes(provider)) {
      return NextResponse.json({ success: false, error: '不支持的登录提供商' }, { status: 400 });
    }

    // 从认证中获取用户身份
    const authUser = await getCurrentUser(request);

    if (!authUser) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    // 从数据库验证密码
    const db = getSupabaseServiceClient();
    const { data: dbUser } = await db
      .from('users')
      .select('password_hash')
      .eq('id', authUser.id)
      .single();

    if (!dbUser || !dbUser.password_hash) {
      return NextResponse.json({ success: false, error: '密码错误' }, { status: 401 });
    }

    const passwordMatch = await bcrypt.compare(password, dbUser.password_hash);
    if (!passwordMatch) {
      return NextResponse.json({ success: false, error: '密码错误' }, { status: 401 });
    }

    // 解绑账号
    const success = await oauthService.unbindAccount(authUser.id, provider as OAuthProvider);

    if (!success) {
      return NextResponse.json({ success: false, error: '未找到绑定记录' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
    });
  } catch (error) {
    if (error instanceof AuthDatabaseError) {
      return NextResponse.json({ success: false, error: '服务暂不可用' }, { status: 503 });
    }
    console.error('[Auth] 解绑账号失败:', error);
    return NextResponse.json({ success: false, error: '解绑账号失败' }, { status: 500 });
  }
}
