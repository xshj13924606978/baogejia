import { NextRequest, NextResponse } from 'next/server';
import { validateEmail, normalizeEmail } from '@/lib/validations/auth';
import { verifyEmailCode } from '@/lib/email-verification';

export const runtime = 'nodejs';

/**
 * POST /api/auth/verify-email-code
 * body: { email, code }
 * 校验邮箱验证码
 *
 * 兼容 6 位数字 OTP 和完整 magic link URL（含 #access_token=xxx 或 ?token=xxx）
 * 用户从邮件中复制 6 位数字或完整链接粘贴到表单
 *
 * #[20260828-1345]
 */
export async function POST(req: NextRequest) {
  let body: { email?: unknown; code?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const code = typeof body.code === 'string' ? body.code.trim() : '';

  if (!validateEmail(email)) {
    return NextResponse.json({ error: '请输入正确的邮箱' }, { status: 400 });
  }
  if (!code) {
    return NextResponse.json({ error: '请输入验证码' }, { status: 400 });
  }

  const result = await verifyEmailCode(email, code);
  if (!result.ok) {
    return NextResponse.json(
      { error: result.error || '验证码校验失败' },
      { status: 400 }
    );
  }

  return NextResponse.json({
    success: true,
    verified: true,
    method: result.method,
  });
}