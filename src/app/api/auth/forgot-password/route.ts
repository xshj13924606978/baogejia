export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import bcrypt from 'bcrypt';

/**
 * 忘记密码 API
 * 通过验证码重置密码
 *
 * 请求：POST { email, phone, code, newPassword }
 * - email 或 phone 至少提供一个定位用户
 * - code 为短信/邮箱验证码
 * - newPassword 为新密码
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { email, phone, code, newPassword } = body;

    if ((!email && !phone) || !code || !newPassword) {
      return NextResponse.json(
        { error: '缺少必要参数' },
        { status: 400 }
      );
    }

    if (newPassword.length < 6) {
      return NextResponse.json(
        { error: '密码长度至少 6 位' },
        { status: 400 }
      );
    }

    // 验证验证码
    const supabase = getSupabaseServiceClient();

    // 查找用户
    let existingUser: any = null;
    if (email) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .eq('email', email)
        .maybeSingle();
      if (data) existingUser = data;
    }
    if (!existingUser && phone) {
      const { data } = await supabase
        .from('users')
        .select('*')
        .filter('metadata->>phone', 'eq', phone)
        .maybeSingle();
      if (data) existingUser = data;
    }

    if (!existingUser) {
      return NextResponse.json(
        { error: '未找到该用户' },
        { status: 404 }
      );
    }

    // 验证验证码（通过 sms_verification_codes 表）
    const target = email || phone || '';
    const { data: codeRecord, error: codeError } = await supabase
      .from('sms_verification_codes')
      .select('*')
      .eq('receiver', target)
      .eq('code', code)
      .eq('used', false)
      .gte('expires_at', new Date().toISOString())
      .order('created_at', { ascending: false })
      .limit(1)
      .maybeSingle();

    if (codeError || !codeRecord) {
      return NextResponse.json(
        { error: '验证码无效或已过期' },
        { status: 400 }
      );
    }

    // 标记验证码为已使用
    await supabase
      .from('sms_verification_codes')
      .update({ used: true })
      .eq('id', codeRecord.id);

    // 更新密码
    const passwordHash = await bcrypt.hash(newPassword, 10);
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        updated_at: new Date().toISOString(),
      })
      .eq('id', existingUser.id);

    if (updateError) {
      console.error('[forgot-password] 更新密码失败:', updateError);
      return NextResponse.json(
        { error: '密码重置失败，请稍后重试' },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '密码重置成功，请重新登录',
    });
  } catch (error) {
    console.error('[forgot-password] 未预期错误:', error);
    return NextResponse.json(
      { error: '服务器错误，请稍后重试' },
      { status: 500 }
    );
  }
}
