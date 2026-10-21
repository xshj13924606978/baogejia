import { NextRequest, NextResponse } from 'next/server';
import { validatePhone } from '@/lib/validations/auth';
import { checkSmsRateLimit } from '@/lib/rate-limit';
import {
  isAllowedPurpose,
  generateSmsCode,
  createSmsCodeRecord,
  invalidatePhoneCodes,
  findUserByPhone,
  checkSmsDbRateLimit,
} from '@/lib/sms-verification';
import { sendSmsVerificationCode } from '@/lib/sms-service';

export const runtime = 'nodejs';

function getClientIp(req: NextRequest): string {
  const forwarded = req.headers.get('x-forwarded-for');
  if (forwarded) return forwarded.split(',')[0].trim();
  return req.headers.get('x-real-ip') || 'unknown';
}

/**
 * POST /api/auth/send-sms-code
 * body: { phone, purpose?: 'register' | 'bind' | 'general' }
 * 发送短信验证码（含频率限制 / 注册场景手机号查重）
 */
export async function POST(req: NextRequest) {
  let body: { phone?: unknown; purpose?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const purpose = isAllowedPurpose(body.purpose) ? body.purpose : 'general';

  if (!validatePhone(phone)) {
    return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
  }

  // 频率限制：内存限流（单实例）+ 数据库限流（#[20260829-1700] 多实例共享，
  // 防止 PM2 cluster / 多容器部署下各进程独立计数导致限流失效）
  const limit = checkSmsRateLimit(phone, getClientIp(req));
  if (!limit.allowed) {
    return NextResponse.json({ error: limit.error || '请求过于频繁，请稍后再试' }, { status: 429 });
  }
  const dbLimit = await checkSmsDbRateLimit(phone);
  if (!dbLimit.allowed) {
    return NextResponse.json({ error: dbLimit.error || '请求过于频繁，请稍后再试' }, { status: 429 });
  }

  // 注册场景：手机号已注册则拒绝发送，防重复注册
  if (purpose === 'register') {
    const existing = await findUserByPhone(phone);
    if (existing) {
      return NextResponse.json({ error: '该手机号已注册，可直接登录' }, { status: 409 });
    }
  }

  const code = generateSmsCode();
  await invalidatePhoneCodes(phone);
  await createSmsCodeRecord(phone, code, purpose, getClientIp(req));

  const sms = await sendSmsVerificationCode(phone, code);
  if (!sms.success) {
    return NextResponse.json({ error: sms.error || '短信发送失败，请稍后再试' }, { status: 500 });
  }

  const payload: { success: boolean; message: string; code?: string } = {
    success: true,
    message: '验证码已发送',
  };
  // mock 模式（非生产 + SMS_MOCK_RETURN_CODE=true）返回验证码便于本地联调
  if (sms.mockReturnCode) {
    payload.code = sms.mockReturnCode;
  }
  return NextResponse.json(payload);
}
