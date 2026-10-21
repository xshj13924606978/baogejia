import { NextRequest, NextResponse } from 'next/server';
import { validateEmail, normalizeEmail } from '@/lib/validations/auth';
import { requireAuth } from '@/lib/auth-utils';
import {
  sendEmailVerificationCode,
  findUserByEmail,
} from '@/lib/email-verification';

export const runtime = 'nodejs';

/**
 * POST /api/auth/send-email-code
 * body: { email, purpose?: 'register' | 'bind' | 'rebind' }
 * 发送邮箱验证码（数据库驱动：自定义 SMTP 多通道优先，无配置时 Supabase 内置邮件）
 *
 * 频率限制：60s 冷却 + 每日 10 次（持久化到 email_verification_codes 表）
 *
 * #[20260828-1345] — 邮箱场景必须验证邮箱真实性（防虚假注册）
 * #[20260829-1700] — 支持 purpose：
 *   - 默认/register/bind：邮箱若已被注册则拒绝（不向他人邮箱发码）；
 *   - rebind（换绑邮箱，需登录且邮箱必须为本人当前邮箱）：允许向已注册的本
 *     人邮箱发码，用于「旧邮箱验证码 + 新邮箱验证码」双验证换绑流程。
 */
export async function POST(req: NextRequest) {
  let body: { email?: unknown; purpose?: unknown };
  try {
    body = await req.json();
  } catch {
    return NextResponse.json({ error: '请求格式错误' }, { status: 400 });
  }

  const email = normalizeEmail(body.email);
  const purpose = typeof body.purpose === 'string' ? body.purpose : '';
  if (!validateEmail(email)) {
    return NextResponse.json({ error: '请输入正确的邮箱' }, { status: 400 });
  }

  // 换绑场景：必须登录且邮箱为本人当前邮箱（防止向任意已注册邮箱发码骚扰）
  if (purpose === 'rebind') {
    const auth = await requireAuth(req);
    if (auth.errorResponse) return auth.errorResponse;
    if (auth.user.email !== email) {
      return NextResponse.json({ error: '该邮箱不是当前账号绑定的邮箱' }, { status: 403 });
    }
  } else {
    // 已注册邮箱直接拒绝（避免给已注册用户发送无意义邮件/骚扰他人邮箱）
    const existing = await findUserByEmail(email);
    if (existing) {
      return NextResponse.json(
        { error: '该邮箱已注册，可直接登录' },
        { status: 409 }
      );
    }
  }

  const result = await sendEmailVerificationCode(email);
  if (!result.ok) {
    const status = result.cooldownSeconds ? 429 : 500;
    return NextResponse.json(
      { error: result.error || '邮件发送失败', cooldownSeconds: result.cooldownSeconds },
      { status }
    );
  }

  return NextResponse.json({
    success: true,
    message: '验证邮件已发送，请前往邮箱查看',
    cooldownSeconds: 60,
  });
}