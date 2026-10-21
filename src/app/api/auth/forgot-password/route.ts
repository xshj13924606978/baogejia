export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { validatePhone } from '@/lib/validations/auth';
import { checkSmsRateLimit } from '@/lib/rate-limit';
import {
  generateSmsCode,
  createSmsCodeRecord,
  invalidatePhoneCodes,
  findUserByPhone,
} from '@/lib/sms-verification';
import { sendSmsVerificationCode } from '@/lib/sms-service';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * 忘记密码：向用户手机号发送短信验证码
 * 调用方：/forgot-password 页面输入手机号后请求
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone } = body;

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ error: '请输入手机号' }, { status: 400 });
    }

    const normalizedPhone = phone.trim();
    if (!validatePhone(normalizedPhone)) {
      return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 });
    }

    // 检查用户是否存在（不暴露账号是否存在，统一返回成功）
    const user = await findUserByPhone(normalizedPhone);
    if (!user) {
      return NextResponse.json(
        { success: true, message: '如果该手机号已注册，验证码将稍后发送' },
        { status: 200 }
      );
    }

    // 频率限制
    const limit = checkSmsRateLimit(normalizedPhone, getClientIp(request));
    if (!limit.allowed) {
      return NextResponse.json(
        { error: limit.error || '请求过于频繁，请稍后再试' },
        { status: 429 }
      );
    }

    const code = generateSmsCode();
    await invalidatePhoneCodes(normalizedPhone);
    await createSmsCodeRecord(normalizedPhone, code, 'general', getClientIp(request));

    const smsResult = await sendSmsVerificationCode(normalizedPhone, code);
    if (!smsResult.success) {
      return NextResponse.json(
        { error: smsResult.error || '短信发送失败，请稍后重试' },
        { status: 500 }
      );
    }

    const response: { success: boolean; message: string; code?: string } = {
      success: true,
      message: '验证码已发送',
    };
    if (smsResult.mockReturnCode) {
      response.code = smsResult.mockReturnCode;
    }
    return NextResponse.json(response);
  } catch (error) {
    console.error('[forgot-password] 未预期错误:', error);
    return NextResponse.json({ error: '发送失败，请稍后重试' }, { status: 500 });
  }
}
