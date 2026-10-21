export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { generateInviteCode, generateUniversalInviteCode, getInviteBaseUrl } from '@/lib/contributor/service';

/**
 * 获取当前登录用户的邀请码
 * - 已登录贡献者：返回其专属邀请码（无则生成）
 * - 已登录非贡献者：自动生成/复用绑定该用户的专属邀请码（与登录用户关联）
 * - 未登录：返回错误
 */
export async function GET(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const db = getSupabaseServiceClient();

    // 查询贡献者记录
    const { data: contributor } = await db
      .from('contributors')
      .select('id, invite_code, user_id')
      .eq('user_id', user.id)
      .maybeSingle();

    // 已登录但尚未成为贡献者：自动生成/复用绑定该用户的专属邀请码
    // 专属邀请码与登录用户关联（通用码绑定创建者，被使用后该用户成为邀请人）
    if (!contributor) {
      const now = new Date().toISOString();
      // 优先复用该用户已有的有效邀请码，避免每次进入页面都生成新码
      const { data: existing } = await db
        .from('universal_invite_codes')
        .select('code')
        .eq('creator_id', user.id)
        .eq('status', 'active')
        .gt('expires_at', now)
        .order('created_at', { ascending: false })
        .limit(1)
        .maybeSingle();

      let inviteCode: string;
      if (existing?.code) {
        inviteCode = existing.code;
      } else {
        const gen = await generateUniversalInviteCode(user.id, 'personal');
        if (!gen.success || !gen.code) {
          return NextResponse.json({ error: '生成邀请码失败' }, { status: 500 });
        }
        inviteCode = gen.code;
      }

      return NextResponse.json({
        success: true,
        inviteCode,
        inviteLink: `${getInviteBaseUrl(request)}/contributor/upload?code=${inviteCode}`,
        type: 'personal',
      });
    }

    // 无邀请码则生成
    if (!contributor.invite_code) {
      const inviteCode = generateInviteCode();
      await db.from('contributors').update({ invite_code: inviteCode }).eq('id', contributor.id);
      contributor.invite_code = inviteCode;
    }

    return NextResponse.json({
      success: true,
      inviteCode: contributor.invite_code,
      inviteLink: `${getInviteBaseUrl(request)}/contributor/upload?inviteCode=${contributor.invite_code}`,
    });
  } catch (error) {
    console.error('[Contributor] 获取邀请码异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
