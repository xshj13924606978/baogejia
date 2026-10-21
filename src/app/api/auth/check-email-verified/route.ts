import { NextRequest, NextResponse } from 'next/server';
import { validateEmail, normalizeEmail } from '@/lib/validations/auth';
import { isEmailVerified } from '@/lib/email-verification';

export const runtime = 'nodejs';

/**
 * GET /api/auth/check-email-verified?email=xxx
 * 检查邮箱是否已验证（10 分钟 TTL 窗口内）
 *
 * #[20260828-1345] — 提交资料前必须确认邮箱已验证
 */
export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const email = normalizeEmail(searchParams.get('email'));

  if (!validateEmail(email)) {
    return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
  }

  const verified = await isEmailVerified(email);
  return NextResponse.json({ verified });
}