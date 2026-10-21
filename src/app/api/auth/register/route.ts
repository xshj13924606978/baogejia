export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { getSiteConfigValues } from '@/lib/site-config';
import { validatePhone } from '@/lib/validations/auth';
import { findUserByPhone, verifySmsCode } from '@/lib/sms-verification';
import { registerUserByPhone, handleInviteReward } from '@/lib/phone-register';
import { establishUserSession } from '@/lib/auth-session';

// 注册用户（#20260820-1600：仅手机号+短信验证码必填，注册即登录）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { username, password, email, phone, company, contact, invite_code, sms_code } = body;

    // 仅手机号 + 短信验证码必填，其余字段选填（注册后引导补全）
    if (!phone || !sms_code) {
      return NextResponse.json({ error: '请输入手机号及短信验证码' }, { status: 400 });
    }
    if (!validatePhone(phone)) {
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
    }

    // 检查是否开放注册
    const securityConfig = await getSiteConfigValues([
      'allow_register',
      'password_min_length',
    ]);
    if (securityConfig.allow_register === 'false') {
      return NextResponse.json({ error: '当前已关闭新用户注册' }, { status: 403 });
    }

    const db = getSupabaseServiceClient();

    // 手机号唯一性检查（防重复注册：metadata.phone 或历史纯数字用户名）
    const existingByPhone = await findUserByPhone(phone);
    if (existingByPhone) {
      return NextResponse.json({ error: '该手机号已注册，可直接登录' }, { status: 409 });
    }

    // 可选字段校验（选填，填了才校验）
    const minLength = Math.max(1, parseInt(securityConfig.password_min_length || '6', 10));
    if (password && typeof password === 'string' && password.length < minLength) {
      return NextResponse.json({ error: `密码长度不能少于${minLength}位` }, { status: 400 });
    }
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (email && typeof email === 'string' && !emailRegex.test(email)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
    }
    if (
      username &&
      typeof username === 'string' &&
      !/^[\w\u4e00-\u9fa5]{2,30}$/.test(username.trim())
    ) {
      return NextResponse.json(
        { error: '用户名需为2-30位字母、数字、下划线或中文' },
        { status: 400 }
      );
    }

    // 用户提供用户名时校验唯一性（未提供则自动生成临时名，见 registerUserByPhone）
    if (username && typeof username === 'string') {
      const { data: existingUsername } = await db
        .from('users')
        .select('id')
        .eq('username', username.trim())
        .maybeSingle();
      if (existingUsername) {
        return NextResponse.json({ error: '用户名已存在' }, { status: 409 });
      }
    }

    // 校验短信验证码（一次性消费，purpose=register）
    const codeCheck = await verifySmsCode(phone, sms_code, 'register');
    if (!codeCheck.ok) {
      return NextResponse.json({ error: codeCheck.error || '短信验证码校验失败' }, { status: 400 });
    }

    // 创建用户（username/email/password 缺省时自动占位）
    const { user, error: createError } = await registerUserByPhone(phone, {
      username: typeof username === 'string' ? username.trim() : undefined,
      password: typeof password === 'string' ? password : undefined,
      email: typeof email === 'string' ? email.trim() : undefined,
      company: typeof company === 'string' ? company.trim() : undefined,
      contact: typeof contact === 'string' ? contact.trim() : undefined,
    });
    if (!user) {
      return NextResponse.json({ error: createError || '注册失败' }, { status: 500 });
    }

    // 处理邀请关系：若携带邀请码，绑定邀请人并发放邀请奖励积分
    if (invite_code && typeof invite_code === 'string') {
      try {
        await handleInviteReward(db, user.id, invite_code.trim());
      } catch (inviteError) {
        console.error('[Auth] 邀请奖励处理失败:', inviteError);
      }
    }

    // 注册即登录：签发完整会话
    const { data: fullUser } = await db.from('users').select('*').eq('id', user.id).single();
    if (!fullUser) {
      return NextResponse.json({ success: true, message: '注册成功' });
    }
    return await establishUserSession(request, fullUser, 'register');
  } catch (error) {
    console.error('[Auth] 注册请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
