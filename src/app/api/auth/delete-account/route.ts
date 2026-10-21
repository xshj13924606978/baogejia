import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { logUserAction, extractClientIp } from '@/lib/user-log-service';

/**
 * 注销账号（#[20260829-1700]）
 *
 * 真实生效：
 * - 若用户已设置密码，需验证当前密码（防误删/盗删）；
 * - 优先调用数据库级联删除函数 delete_user_cascade 真实删除用户及所有关联数据
 *   （与管理后台删除用户一致，引用外键全部清理）；
 * - RPC 不存在/失败时降级为「标记删除」：status='deleted' + 清理 OAuth 绑定 +
 *   清理待绑定凭据，verify-session 对非 active 用户返回 401，杜绝幽灵会话；
 * - 记录操作日志、清除 httpOnly cookie。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await request.json().catch(() => ({}));
    const password = typeof body.password === 'string' ? body.password : '';

    const db = getSupabaseServiceClient();

    // 读取完整用户信息
    const { data: fullUser } = await db
      .from('users')
      .select('id, email, username, password_hash, status')
      .eq('id', auth.user.id)
      .single();

    if (!fullUser) {
      return NextResponse.json({ error: '账号不存在' }, { status: 404 });
    }
    if (fullUser.status && fullUser.status !== 'active') {
      return NextResponse.json({ error: '账号已处于注销状态' }, { status: 400 });
    }

    // 已设置密码的账号必须校验当前密码
    if (fullUser.password_hash) {
      const match = await bcrypt.compare(password, fullUser.password_hash).catch(() => false);
      if (!match) {
        return NextResponse.json(
          { error: '密码不正确，无法注销账号', code: 'PASSWORD_MISMATCH' },
          { status: 400 }
        );
      }
    }

    // 记录注销日志（删除前记录，userId 仍有效）
    await logUserAction({
      userId: auth.user.id,
      actionType: 'delete_account',
      actionDetails: { source: 'profile-settings', email: fullUser.email || '' },
      ipAddress: extractClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    // 优先级联删除（与管理后台一致）；失败降级标记删除
    let deleted = false;
    const { error: rpcError } = await db.rpc('delete_user_cascade', {
      user_ids: [auth.user.id],
    });
    if (rpcError) {
      console.warn('[DeleteAccount] 级联删除失败，降级标记删除:', rpcError.message);
    } else {
      deleted = true;
    }

    if (!deleted) {
      // 降级：清理绑定关联 + 待绑定凭据 + 标记 status=deleted
      await db.from('user_oauth_bindings').delete().eq('user_id', auth.user.id);
      await db
        .from('oauth_pending_logins')
        .delete()
        .or(`user_id.eq.${auth.user.id}`);
      await db
        .from('users')
        .update({
          status: 'deleted',
          email: null,
          username: null,
          password_hash: null,
          wechat_openid: null,
          wechat_unionid: null,
          wechat_nickname: null,
          wechat_avatar: null,
          updated_at: new Date().toISOString(),
        })
        .eq('id', auth.user.id);
    }

    // 清除 httpOnly cookie
    const isSecure =
      request.headers.get('x-forwarded-proto') === 'https' || request.url.startsWith('https://');
    const response = NextResponse.json({ success: true, deleted });
    response.cookies.set('session_token', '', {
      httpOnly: true,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });
    response.cookies.set('user_role', '', {
      httpOnly: false,
      secure: isSecure,
      sameSite: 'lax',
      path: '/',
      maxAge: 0,
    });

    return response;
  } catch (error) {
    console.error('[DeleteAccount] 注销账号失败:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
