export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { generateInviteCode } from '@/lib/contributor/service';

/**
 * 获取当前登录贡献者的邀请码
 * - 已登录用户：返回其邀请码（无则生成）
 * - 未登录 / 非贡献者：返回错误
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

    if (!contributor) {
      return NextResponse.json({ error: '请先注册成为贡献者' }, { status: 404 });
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
      inviteLink: `${request.nextUrl.origin}/contributor/upload?inviteCode=${contributor.invite_code}`,
    });
  } catch (error) {
    console.error('[Contributor] 获取邀请码异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
