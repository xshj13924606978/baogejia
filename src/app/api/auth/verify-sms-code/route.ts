import { NextRequest, NextResponse } from 'next/server';
import { validatePhone } from '@/lib/validations/auth';
import { isAllowedPurpose, verifySmsCode } from '@/lib/sms-verification';

export const runtime = 'nodejs';

/**
 * POST /api/auth/verify-sms-code
 * body: { phone, code, purpose?: 'register' | 'bind' | 'general' }
 * 校验验证码（一次性消费）。供手机号绑定、独立校验等场景使用；
 * 注册场景由 /api/auth/register 内部直接校验。
 */
export async function POST(req: NextRequest) {
  let body: { phone?: unknown; code?: unknown; purpose?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const phone = typeof body.phone === 'string' ? body.phone.trim() : '';
  const code = typeof body.code === 'string' ? body.code.trim() : '';
  const purpose = isAllowedPurpose(body.purpose) ? body.purpose : 'general';

  if (!validatePhone(phone)) {
    return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: '请输入验证码' }, { status: 400 });
  }

  const result = await verifySmsCode(phone, code, purpose);
  if (!result.ok) {
    return NextResponse.json({ error: result.error || '验证码校验失败' }, { status: 400 });
  }

  return NextResponse.json({ success: true, verified: true });
}
