import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { verifySessionToken } from '@/lib/session-token';
import { isSessionRevoked } from '@/lib/session-version';
import { logUserAction, extractClientIp } from '@/lib/user-log-service';

/**
 * OAuth 解绑 API
 * POST /api/auth/unlink
 * Body: { provider: 'wechat' | 'google' }
 * Header: x-user-token
 */
export async function POST(request: NextRequest) {
  try {
    // 优先使用 x-user-token header，兜底读取 httpOnly session_token cookie
    // #20260827-XXXX 修复：扫码登录（OAuth）只写 httpOnly cookie、localStorage 无 session_token，
    // 此前仅读 header → 扫码登录用户解绑请求永远 401 → 本地显示解绑成功但服务端绑定未删除 → 刷新后恢复绑定
    const token = request.headers.get('x-user-token') || request.cookies.get('session_token')?.value;
    if (!token) {
      return NextResponse.json({ success: false, error: '未提供认证令牌' }, { status: 401 });
    }

    const session = verifySessionToken(token);
    if (!session || !session.userId) {
      return NextResponse.json({ success: false, error: '认证令牌无效或已过期' }, { status: 401 });
    }
    // 「全部设备登出」撤销检查（#[20260829-1700]）
    if (await isSessionRevoked(session.userId, session.sessionVersion)) {
      return NextResponse.json({ success: false, error: '会话已失效，请重新登录' }, { status: 401 });
    }

    const body = await request.json();
    const { provider } = body;

    if (!provider) {
      return NextResponse.json({ success: false, error: '缺少 provider 参数' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();

    // 删除 OAuth 绑定记录
    const { error: deleteError } = await supabase
      .from('user_oauth_bindings')
      .delete()
      .eq('user_id', session.userId)
      .eq('provider', provider);

    if (deleteError) {
      console.error('[unlink] 删除 OAuth 绑定失败:', deleteError);
      return NextResponse.json({ success: false, error: '解绑失败' }, { status: 500 });
    }

    // 如果是微信解绑，清空微信相关字段
    if (provider === 'wechat') {
      try {
        await supabase
          .from('users')
          .update({
            wechat_openid: null,
            wechat_nickname: null,
            wechat_avatar: null,
            updated_at: new Date().toISOString(),
          })
          .eq('id', session.userId);
      } catch (columnError) {
        console.warn('[unlink] 微信字段清空失败（可能字段未创建）:', columnError);
      }
    }

    // 记录解绑操作日志（#[20260829-1700]）
    await logUserAction({
      userId: session.userId,
      actionType: 'unbind',
      actionDetails: { kind: 'oauth', provider },
      ipAddress: extractClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[unlink] 解绑异常:', error);
    return NextResponse.json({ success: false, error: '服务器内部错误' }, { status: 500 });
  }
}

/**
 * CORS 预检
 */
export async function OPTIONS() {
  return new NextResponse(null, {
    status: 204,
    headers: {
      'Access-Control-Allow-Origin': '*',
      'Access-Control-Allow-Methods': 'POST, OPTIONS',
      'Access-Control-Allow-Headers': 'Content-Type, x-user-token',
      'Access-Control-Max-Age': '86400',
    },
  });
}
