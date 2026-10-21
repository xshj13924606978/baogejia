import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { validatePhone } from '@/lib/validations/auth';
import { verifySmsCode, findUserByPhone } from '@/lib/sms-verification';
import { logUserAction, extractClientIp } from '@/lib/user-log-service';

export const runtime = 'nodejs';

/**
 * POST /api/auth/phone/bind
 * body: { phone, code, oldPhone?, oldCode? }
 *
 * 统一绑定/换绑手机号流程（#[20260829-1700]）：
 * - 绑定（用户当前无手机号）：校验新手机号短信验证码（purpose='bind'）；
 * - 换绑（用户已有手机号）：必须同时校验「旧手机号验证码 + 新手机号验证码」，
 *   防止账号被他人恶意换绑；
 * - 新手机号必须未被其他账号占用；
 * - 成功后即时更新 metadata.phone（users 表无顶层 phone 列），
 *   若 username 恰为 11 位旧手机号则同步更新为新手机号；
 * - 记录操作日志；响应返回最新 phone 供前端即时刷新。
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await requireAuth(request);
    if (auth.errorResponse) return auth.errorResponse;

    const body = await request.json().catch(() => ({}));
    const newPhone = typeof body.phone === 'string' ? body.phone.trim() : '';
    const newCode = typeof body.code === 'string' ? body.code.trim() : '';
    const oldPhone = typeof body.oldPhone === 'string' ? body.oldPhone.trim() : '';
    const oldCode = typeof body.oldCode === 'string' ? body.oldCode.trim() : '';

    if (!validatePhone(newPhone)) {
      return NextResponse.json({ error: '请输入正确的手机号' }, { status: 400 });
    }
    if (!newCode) {
      return NextResponse.json({ error: '请输入新手机号验证码' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 读取当前用户信息（手机号、用户名）
    const { data: fullUser } = await db
      .from('users')
      .select('id, username, email, metadata, status')
      .eq('id', auth.user.id)
      .single();

    if (!fullUser) {
      return NextResponse.json({ error: '账号不存在' }, { status: 404 });
    }
    if (fullUser.status && fullUser.status !== 'active') {
      return NextResponse.json({ error: '账号状态异常，无法操作' }, { status: 403 });
    }

    const currentPhone = (fullUser.metadata?.phone as string) || '';

    // 换绑场景：必须校验旧手机号验证码
    if (currentPhone && currentPhone !== newPhone) {
      if (!oldPhone || !oldCode) {
        return NextResponse.json(
          { error: '更换手机号需先验证旧手机号验证码', code: 'OLD_CODE_REQUIRED' },
          { status: 400 }
        );
      }
      if (oldPhone !== currentPhone) {
        return NextResponse.json({ error: '旧手机号与当前绑定手机号不一致' }, { status: 400 });
      }
      const oldVerify = await verifySmsCode(oldPhone, oldCode, 'bind');
      if (!oldVerify.ok) {
        return NextResponse.json(
          { error: `旧手机号验证失败：${oldVerify.error}` },
          { status: 400 }
        );
      }
    } else if (currentPhone === newPhone) {
      return NextResponse.json({ error: '新手机号与当前绑定手机号相同' }, { status: 400 });
    }

    // 校验新手机号验证码
    const newVerify = await verifySmsCode(newPhone, newCode, 'bind');
    if (!newVerify.ok) {
      return NextResponse.json(
        { error: `新手机号验证失败：${newVerify.error}` },
        { status: 400 }
      );
    }

    // 新手机号唯一性检查（排除自己）
    const existing = await findUserByPhone(newPhone);
    if (existing && existing.id !== auth.user.id) {
      return NextResponse.json({ error: '该手机号已被其他账号使用' }, { status: 409 });
    }

    // 更新 metadata.phone；username 若为 11 位旧手机号则同步更新
    const metadata = { ...(fullUser.metadata || {}), phone: newPhone, phone_verified: 'true' };
    const updateData: Record<string, unknown> = {
      metadata,
      updated_at: new Date().toISOString(),
    };
    if (/^1\d{10}$/.test(fullUser.username || '') && currentPhone && fullUser.username === currentPhone) {
      updateData.username = newPhone;
    }

    const { error: updateError } = await db.from('users').update(updateData).eq('id', auth.user.id);
    if (updateError) {
      console.error('[PhoneBind] 更新手机号失败:', updateError.message);
      return NextResponse.json({ error: '绑定失败，请稍后重试' }, { status: 500 });
    }

    // 记录操作日志
    await logUserAction({
      userId: auth.user.id,
      actionType: currentPhone ? 'rebind' : 'bind',
      actionDetails: {
        kind: 'phone',
        from: currentPhone ? currentPhone.replace(/^(\d{3})\d{4}/, '$1****') : '',
        to: newPhone.replace(/^(\d{3})\d{4}/, '$1****'),
      },
      ipAddress: extractClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ success: true, phone: newPhone });
  } catch (error) {
    console.error('[PhoneBind] 绑定/换绑手机号失败:', error);
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}
