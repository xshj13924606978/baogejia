export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { getCurrentUser } from '@/lib/auth-utils';
import { getSiteConfigValue } from '@/lib/site-config';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 修改密码：已登录用户验证旧密码后更新 password_hash
 * 请求：POST { oldPassword, newPassword }
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { oldPassword, newPassword } = body;

    if (!oldPassword || typeof oldPassword !== 'string') {
      return NextResponse.json({ error: '请输入旧密码' }, { status: 400 });
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json({ error: '请输入新密码' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: fullUser, error: fullUserError } = await supabase
      .from('users')
      .select('password_hash')
      .eq('id', user.id)
      .single();

    if (fullUserError || !fullUser) {
      console.error('[change-password] 查询用户信息失败:', fullUserError);
      return NextResponse.json({ error: '获取用户信息失败' }, { status: 500 });
    }

    if (!fullUser.password_hash) {
      return NextResponse.json(
        { error: '当前账号未设置密码，请先设置密码' },
        { status: 400 }
      );
    }

    const valid = await bcrypt.compare(oldPassword, fullUser.password_hash);
    if (!valid) {
      return NextResponse.json({ error: '旧密码错误' }, { status: 400 });
    }

    const minLen = Math.max(
      1,
      Number.parseInt((await getSiteConfigValue('password_min_length', '8')) ?? '8', 10) || 8
    );
    if (newPassword.length < minLen) {
      return NextResponse.json(
        { error: `密码长度至少 ${minLen} 位` },
        { status: 400 }
      );
    }
    if (oldPassword === newPassword) {
      return NextResponse.json(
        { error: '新密码不能与旧密码相同' },
        { status: 400 }
      );
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[change-password] 更新失败:', updateError);
      return NextResponse.json(
        { error: '密码修改失败，请稍后重试' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '密码已修改',
    });
  } catch (error) {
    console.error('[change-password] 未预期错误:', error);
    return NextResponse.json({ error: '服务器错误，请稍后重试' }, { status: 500 });
  }
}
