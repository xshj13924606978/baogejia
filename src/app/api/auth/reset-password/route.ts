export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import bcrypt from 'bcrypt';
import { validatePhone } from '@/lib/validations/auth';
import { verifySmsCode, findUserByPhone } from '@/lib/sms-verification';
import { getSiteConfigValue } from '@/lib/site-config';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { revokeAllUserSessions } from '@/lib/session-version';
import { AuditLogService, extractClientIp as extractAuditClientIp } from '@/lib/audit-log-service';
import { logUserAction, deriveSessionId } from '@/lib/user-log-service';
import { captureException } from '@/lib/error-log-service';

/**
 * 重置密码：校验短信验证码后更新 password_hash
 * 请求：POST { phone, code, newPassword }
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { phone, code, newPassword } = body;

    if (!phone || typeof phone !== 'string') {
      return NextResponse.json({ error: '请输入手机号' }, { status: 400 });
    }
    if (!code || typeof code !== 'string') {
      return NextResponse.json({ error: '请输入验证码' }, { status: 400 });
    }
    if (!newPassword || typeof newPassword !== 'string') {
      return NextResponse.json({ error: '请输入新密码' }, { status: 400 });
    }

    const normalizedPhone = phone.trim();
    if (!validatePhone(normalizedPhone)) {
      return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 });
    }
    if (!/^\d{6}$/.test(code.trim())) {
      return NextResponse.json({ error: '请输入6位验证码' }, { status: 400 });
    }

    const minLen = Math.max(
      1,
      Number.parseInt((await getSiteConfigValue('password_min_length', '6')) ?? '6', 10) || 6
    );
    if (newPassword.length < minLen) {
      return NextResponse.json(
        { error: `密码长度至少 ${minLen} 位` },
        { status: 400 }
      );
    }

    const verify = await verifySmsCode(normalizedPhone, code.trim(), 'general');
    if (!verify.ok) {
      return NextResponse.json(
        { error: verify.error || '验证码错误或已过期' },
        { status: 400 }
      );
    }

    const user = await findUserByPhone(normalizedPhone);
    if (!user) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const supabase = getSupabaseServiceClient();

    // 读取完整用户信息用于审计快照
    const { data: fullUser } = await supabase
      .from('users')
      .select('id, email, password_hash, updated_at')
      .eq('id', user.id)
      .maybeSingle();
    if (!fullUser) {
      return NextResponse.json({ error: '用户不存在' }, { status: 404 });
    }

    const passwordHash = await bcrypt.hash(newPassword, 10);

    // #[20260831-1700] P0-2：清理遗留明文密码列（password 设为 null），
    // 即使该列在生产环境中不存在，也不会产生副作用。
    const { error: updateError } = await supabase
      .from('users')
      .update({
        password_hash: passwordHash,
        password: null,
        updated_at: new Date().toISOString(),
      })
      .eq('id', user.id);

    if (updateError) {
      console.error('[reset-password] 更新密码失败:', updateError);
      return NextResponse.json(
        { error: '密码重置失败，请稍后重试' },
        { status: 500 }
      );
    }

    // #[20260831-1700] P1-4：重置密码后递增 session_version，使该用户所有已签发 token 失效，
    // 强制使用旧密码（或旧 token）的设备重新登录。
    await revokeAllUserSessions(user.id);

    const clientIp = extractAuditClientIp(request);
    const userAgent = request.headers.get('user-agent');

    // P0-4：审计日志（密码变更属于关键账号安全操作，无论是否管理员发起都需留痕）
    await AuditLogService.log({
      userId: fullUser.id,
      userEmail: fullUser.email,
      action: 'UPDATE',
      resourceType: 'user.password',
      resourceId: fullUser.id,
      oldValue: { has_password_hash: !!fullUser.password_hash, updated_at: fullUser.updated_at },
      newValue: { has_password_hash: true, updated_at: new Date().toISOString() },
      reason: '用户通过短信验证码重置密码',
      ipAddress: clientIp ?? undefined,
      userAgent: userAgent ?? undefined,
    });

    // 用户操作日志
    await logUserAction({
      userId: user.id,
      actionType: 'reset_password',
      actionDetails: { phone: normalizedPhone, reason: 'sms_verified' },
      ipAddress: clientIp,
      userAgent,
      sessionId: deriveSessionId(null),
    });

    return NextResponse.json({
      success: true,
      message: '密码已重置，请使用新密码登录',
    });
  } catch (error) {
    captureException(error, {
      source: 'api.auth.reset-password',
      message: '重置密码未处理异常',
      requestMethod: 'POST',
      requestPath: '/api/auth/reset-password',
      statusCode: 500,
    });
    return NextResponse.json({ error: '服务器错误，请稍后重试' }, { status: 500 });
  }
}
