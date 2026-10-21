export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * GET /api/auth/wechat/nickname - 检测当前用户已绑定微信的昵称（#20260821-0930）
 * 用于注册/完善信息页预填用户名：
 * - 优先取绑定表 user_oauth_bindings.nickname
 * - 回退取 users.wechat_nickname（扫码登录回调回写）
 * 未绑定微信时返回 { nickname: null }
 */
export async function GET(request: NextRequest) {
  try {
    const { user, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;

    const db = getSupabaseServiceClient();

    // 1. 微信绑定记录
    const { data: binding } = await db
      .from('user_oauth_bindings')
      .select('nickname')
      .eq('user_id', user.id)
      .eq('provider', 'wechat')
      .order('updated_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    let nickname: string | null = binding?.nickname || null;

    // 2. 回退 users 表微信昵称
    if (!nickname) {
      const { data: u } = await db
        .from('users')
        .select('wechat_nickname')
        .eq('id', user.id)
        .maybeSingle();
      nickname = u?.wechat_nickname || null;
    }

    return NextResponse.json({ success: true, nickname });
  } catch (error) {
    console.error('[Auth] 获取微信昵称失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
