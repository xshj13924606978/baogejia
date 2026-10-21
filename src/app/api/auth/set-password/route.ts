export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { getCurrentUser } from '@/lib/auth-utils';
import { verifySmsCode } from '@/lib/sms-verification';
import { getSiteConfigValue } from '@/lib/site-config';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 设置密码：已登录用户通过短信验证码设置 password_hash
 * 请求：POST { code, newPassword }
 * 场景：手机号+验证码注册后从未设置过密码
 */
export async function POST(request: NextRequest) {
  try {
    const user = await getCurrentUser(request);
    if (!user) {
      return NextResponse.json({ error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { code, newPassword } = body;

    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: '请输入验证码' }, { status: 400 });
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json({ error: '请输入新密码' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(code.trim())) {
      return NextResponse.json({ error: '请输入6位验证码' }, { status: 400 });
    }

    const supabase = getSupabaseServiceClient();
    const { data: fullUser, error: fullUserError } = await supabase
      .from('users')
      .select('phone, metadata, password_hash')
      .eq('id', user.id)
      .single();

    if (fullUserError || !fullUser) {
      console.error('[set-password] 查询用户信息失败:', fullUserError);
      return NextResponse.json({ error: '获取用户信息失败' }, { status: 500 });
    }

    // 兼容 metadata 中的手机号
    let phone: string | null | undefined = fullUser.phone;
    if (!phone && fullUser.metadata && typeof fullUser.metadata === 'object') {
      const metadataPhone = (fullUser.metadata as Record<string, unknown>).phone;
      if (typeof metadataPhone === 'string') phone = metadataPhone;
    }
    if (!phone) {
      return NextResponse.json(
        { error: '当前账号未绑定手机号，无法通过短信验证' },
        { status: 400 }
      );
    }

    const verify = await verifySmsCode(phone, code.trim(), 'general');
    if (!verify.ok) {
      return NextResponse.json(
        { error: verify.error || '验证码错误或已过期' },
        { status: 400 }
      );
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

    const passwordHash = await bcrypt.hash(newPassword, 10);
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[set-password] 更新失败:', updateError);
      return NextResponse.json(
        { error: '密码设置失败，请稍后重试' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '密码设置成功，下次可使用密码登录',
    });
  } catch (error) {
    console.error('[set-password] 未预期错误:', error);
    return NextResponse.json({ error: '服务器错误，请稍后重试' }, { status: 500 });
  }
}
