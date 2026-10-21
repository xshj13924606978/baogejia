// 绑定账号 API 路由（#20260820-1600 重构：直接落库 user_oauth_bindings，去掉内存 Map）

import { NextRequest, NextResponse } from 'next/server';
import { OAuthProvider } from '@/types/oauth';
import { getCurrentUser, AuthDatabaseError } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import bcrypt from 'bcrypt';

/**
 * POST /api/auth/bind - 绑定第三方账号
 * Body: { provider, openid, username, password, nickname?, avatar? }
 * 验证用户名密码后，将 openid 绑定到该用户（直接写入 user_oauth_bindings 表）
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

    // 检查该 openid 是否已绑定其他用户
    const { data: existingBinding } = await db
      .from('user_oauth_bindings')
      .select('user_id')
      .eq('provider', provider)
      .eq('provider_id', openid)
      .maybeSingle();

    if (existingBinding) {
      if (existingBinding.user_id === dbUser.id) {
        return NextResponse.json({ success: false, error: '该账号已绑定' }, { status: 400 });
      }
      return NextResponse.json({ success: false, error: '该微信已绑定其他账号' }, { status: 400 });
    }

    const now = new Date().toISOString();

    // 写入绑定记录（落库）
    await db.from('user_oauth_bindings').upsert(
      {
        user_id: dbUser.id,
        provider,
        provider_id: openid,
        nickname: nickname || dbUser.username || dbUser.name || '',
        avatar: avatar || '',
        updated_at: now,
      },
      { onConflict: 'provider,provider_id' }
    );

    // 同步更新微信字段（仅 wechat）
    if (provider === OAuthProvider.WECHAT) {
      try {
        await db
          .from('users')
          .update({
            wechat_openid: openid,
            wechat_nickname: nickname || dbUser.username || '',
            wechat_avatar: avatar || '',
            updated_at: now,
          })
          .eq('id', dbUser.id);
      } catch (columnError) {
        console.warn('[Bind] 微信字段更新失败（可能字段未创建）:', columnError);
      }
    }

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
 * GET /api/auth/bind - 查询当前用户绑定列表
 */
export async function GET(request: NextRequest) {
  try {
    const authUser = await getCurrentUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

    const db = getSupabaseServiceClient();
    const { data: bindings } = await db
      .from('user_oauth_bindings')
      .select('id, provider, provider_id, nickname, avatar, created_at, updated_at')
      .eq('user_id', authUser.id)
      .order('created_at', { ascending: false });

    return NextResponse.json({
      success: true,
      bindings: bindings || [],
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
 * Body: { provider, password }
 */
export async function DELETE(request: NextRequest) {
  try {
    const body = await request.json();
    const { provider, password } = body;

    if (!provider || !password) {
      return NextResponse.json({ success: false, error: '缺少必填参数' }, { status: 400 });
    }
    if (!Object.values(OAuthProvider).includes(provider)) {
      return NextResponse.json({ success: false, error: '不支持的登录提供商' }, { status: 400 });
    }

    const authUser = await getCurrentUser(request);
    if (!authUser) {
      return NextResponse.json({ success: false, error: '未登录' }, { status: 401 });
    }

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

    const { data: deleted, error: deleteError } = await db
      .from('user_oauth_bindings')
      .delete()
      .eq('user_id', authUser.id)
      .eq('provider', provider)
      .select('id');

    if (deleteError || !deleted?.length) {
      return NextResponse.json({ success: false, error: '未找到绑定记录' }, { status: 404 });
    }

    // 微信解绑时同步清空 users 表微信字段
    if (provider === OAuthProvider.WECHAT) {
      try {
        await db
          .from('users')
          .update({
            wechat_openid: null,
            wechat_nickname: null,
            wechat_avatar: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', authUser.id);
      } catch (columnError) {
        console.warn('[Bind] 微信字段清空失败:', columnError);
      }
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    if (error instanceof AuthDatabaseError) {
      return NextResponse.json({ success: false, error: '服务暂不可用' }, { status: 503 });
    }
    console.error('[Auth] 解绑账号失败:', error);
    return NextResponse.json({ success: false, error: '解绑账号失败' }, { status: 500 });
  }
}
