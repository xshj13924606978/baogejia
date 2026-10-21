import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { validateEmail } from '@/lib/validations/auth';
import { sendEmailVerificationCode, verifyEmailCode, findUserByEmail } from '@/lib/email-verification';
import { logUserAction, extractClientIp } from '@/lib/user-log-service';

export const runtime = 'nodejs';

/** 占位邮箱（手机号注册等场景生成，视为"未绑定真实邮箱"，可直接绑定新邮箱） */
function isPlaceholderEmail(email: string): boolean {
  return /@(contributor\.local|local|example\.com)$/i.test(email) || !email;
}

/**
 * POST /api/auth/email/bind
 * body: { email, code, oldEmail?, oldCode? }
 *
 * 统一绑定/换绑邮箱流程（#[20260829-1700]）：
 * - 绑定（当前无真实邮箱）：校验新邮箱验证码（SMTP/Supabase 双通道，数据库驱动）；
 * - 换绑（已有真实邮箱）：必须同时校验「旧邮箱验证码 + 新邮箱验证码」；
 * - 新邮箱必须未被其他账号占用；
 * - 成功后即时更新 users.email，记录操作日志，响应返回最新 email 供前端即时刷新。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await request.json().catch(() => ({}));
    const newEmail = typeof body.email === 'string' ? body.email.trim().toLowerCase() : '';
    const newCode = typeof body.code === 'string' ? body.code.trim() : '';
    const oldEmail = typeof body.oldEmail === 'string' ? body.oldEmail.trim().toLowerCase() : '';
    const oldCode = typeof body.oldCode === 'string' ? body.oldCode.trim() : '';

    if (!validateEmail(newEmail)) {
      return NextResponse.json({ error: '请输入正确的邮箱地址' }, { status: 400 });
    }
    if (!newCode) {
      return NextResponse.json({ error: '请输入新邮箱验证码' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    const { data: fullUser } = await db
      .from('users')
      .select('id, username, email, status')
      .eq('id', auth.user.id)
      .single();

    if (!fullUser) {
      return NextResponse.json({ error: '账号不存在' }, { status: 404 });
    }
    if (fullUser.status && fullUser.status !== 'active') {
      return NextResponse.json({ error: '账号状态异常，无法操作' }, { status: 403 });
    }

    const currentEmail = fullUser.email || '';

    // 换绑场景：已有真实邮箱且邮箱不同 → 必须校验旧邮箱验证码
    const hasRealEmail = currentEmail && !isPlaceholderEmail(currentEmail);
    if (hasRealEmail && currentEmail !== newEmail) {
      if (!oldEmail || !oldCode) {
        return NextResponse.json(
          { error: '更换邮箱需先验证旧邮箱验证码', code: 'OLD_CODE_REQUIRED' },
          { status: 400 }
        );
      }
      if (oldEmail !== currentEmail) {
        return NextResponse.json({ error: '旧邮箱与当前绑定邮箱不一致' }, { status: 400 });
      }
      const oldVerify = await verifyEmailCode(oldEmail, oldCode);
      if (!oldVerify.ok) {
        return NextResponse.json(
          { error: `旧邮箱验证失败：${oldVerify.error}` },
          { status: 400 }
        );
      }
    } else if (currentEmail === newEmail) {
      return NextResponse.json({ error: '新邮箱与当前绑定邮箱相同' }, { status: 400 });
    }

    // 校验新邮箱验证码
    const newVerify = await verifyEmailCode(newEmail, newCode);
    if (!newVerify.ok) {
      return NextResponse.json(
        { error: `新邮箱验证失败：${newVerify.error}` },
        { status: 400 }
      );
    }

    // 新邮箱唯一性检查（排除自己；占位邮箱占用不阻塞真实邮箱绑定）
    const existing = await findUserByEmail(newEmail);
    if (existing && existing.id !== auth.user.id && !isPlaceholderEmail(newEmail)) {
      return NextResponse.json({ error: '该邮箱已被其他账号使用' }, { status: 409 });
    }

    const { error: updateError } = await db
      .from('users')
      .update({ email: newEmail, updated_at: new Date().toISOString() })
      .eq('id', auth.user.id);
    if (updateError) {
      console.error('[EmailBind] 更新邮箱失败:', updateError.message);
      return NextResponse.json({ error: '绑定失败，请稍后重试' }, { status: 500 });
    }

    // 记录操作日志
    await logUserAction({
      userId: auth.user.id,
      actionType: hasRealEmail ? 'rebind' : 'bind',
      actionDetails: {
        kind: 'email',
        from: hasRealEmail ? currentEmail : '',
        to: newEmail,
      },
      ipAddress: extractClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ success: true, email: newEmail });
  } catch (error) {
    console.error('[EmailBind] 绑定/换绑邮箱失败:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
