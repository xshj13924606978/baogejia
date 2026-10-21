export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { validatePhone } from '@/lib/validations/auth';
import { findUserByPhone, verifySmsCode } from '@/lib/sms-verification';
import { registerUserByPhone } from '@/lib/phone-register';
import { establishUserSession } from '@/lib/auth-session';

/**
 * 手机号 + 验证码登录（#20260820-1600）
 * - 已注册手机号：校验验证码后直接登录
 * - 未注册手机号：校验验证码后自动创建账号并登录（临时用户名/占位邮箱/随机密码）
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, code } = body;

    if (!phone || !code) {
      return NextResponse.json({ error: '请输入手机号及短信验证码' }, { status: 400 });
    }
    if (!validatePhone(phone)) {
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
    }

    // 校验验证码（登录场景 purpose 默认 general；一次性消费）
    const codeCheck = await verifySmsCode(phone, code, 'general');
    if (!codeCheck.ok) {
      return NextResponse.json({ error: codeCheck.error || '短信验证码校验失败' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 查询用户：已注册则直接登录，未注册则自动建号
    let userId: string | null = null;
    let isNewUser = false;

    const existingUser = await findUserByPhone(phone);
    if (existingUser) {
      userId = existingUser.id;
    } else {
      const { user: createdUser, error: createError } = await registerUserByPhone(phone);
      if (!createdUser) {
        return NextResponse.json(
          { error: createError || '登录失败，请稍后重试' },
          { status: 500 }
        );
      }
      userId = createdUser.id;
      isNewUser = true;
    }

    if (!userId) {
      return NextResponse.json({ error: '登录失败，请稍后重试' }, { status: 500 });
    }

    const { data: fullUser } = await db.from('users').select('*').eq('id', userId).single();
    if (!fullUser) {
      return NextResponse.json({ error: '用户信息加载失败' }, { status: 500 });
    }

    const response = await establishUserSession(
      request,
      fullUser,
      isNewUser ? 'sms_auto_register' : 'sms'
    );
    const bodyData = await response.json();
    const finalResponse = NextResponse.json({ ...bodyData, isNewUser });
    // 保留 establishUserSession 设置的会话 cookie
    response.cookies.getAll().forEach((cookie) => {
      finalResponse.cookies.set(cookie.name, cookie.value, {
        path: cookie.path,
        maxAge: cookie.maxAge,
        httpOnly: cookie.httpOnly,
        secure: cookie.secure,
        sameSite: cookie.sameSite,
      });
    });
    return finalResponse;
  } catch (error) {
    console.error('[Auth] 手机号验证码登录失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
