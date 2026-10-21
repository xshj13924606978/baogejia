/**
 * 邮件通道连通性测试（#[20260829-1700]）
 * - POST /api/admin/email-settings/test
 *   body: { email?: string, id?: number }
 * - 读取 email_settings 中启用的 SMTP 通道（30s 缓存 force 强制刷新），
 *   逐通道尝试发送测试邮件到指定邮箱（默认发往操作管理员邮箱）；
 *   id 指定时仅测试该通道。
 * - 鉴权：requireAdmin（数据库 roles 表 is_admin=true 驱动）
 */
import { NextRequest, NextResponse } from 'next/server';
import nodemailer from 'nodemailer';
import { requireAdmin } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { getEmailSettingsList } from '@/lib/email-verification';

export const runtime = 'nodejs';

type SmtpChannel = {
  id: number;
  priority: number | null;
  provider: string;
  enabled: boolean;
  smtp_host: string;
  smtp_port: number;
  smtp_secure: boolean | null;
  smtp_user: string;
  smtp_password: string;
  from_email: string;
  from_name: string | null;
};

function isSmtpConfigured(s: unknown): s is SmtpChannel {
  const c = s as SmtpChannel;
  return Boolean(c && c.provider === 'smtp' && c.enabled && c.smtp_host && c.smtp_port && c.smtp_user && c.smtp_password && c.from_email);
}

export async function POST(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.errorResponse) return auth.errorResponse;

  const body = await request.json().catch(() => ({}));
  const targetEmail = typeof body.email === 'string' && body.email.trim() ? body.email.trim() : '';
  const onlyId = typeof body.id === 'number' ? body.id : null;

  if (targetEmail && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(targetEmail)) {
    return NextResponse.json({ error: '目标邮箱格式不正确' }, { status: 400 });
  }
  const toEmail = targetEmail || auth.user.email || '';

  if (!toEmail) {
    return NextResponse.json({ error: '未指定测试邮箱，且当前管理员无邮箱' }, { status: 400 });
  }

  // force=true 强制刷新缓存，配置刚保存后立即可见
  const channels = (await getEmailSettingsList(true)).filter(isSmtpConfigured);
  if (channels.length === 0) {
    return NextResponse.json({ error: '暂无已启用且配置完整的 SMTP 通道' }, { status: 400 });
  }

  const candidates = onlyId ? channels.filter((c) => c.id === onlyId) : channels;
  if (candidates.length === 0) {
    return NextResponse.json({ error: `未找到 ID=${onlyId} 的可用 SMTP 通道` }, { status: 404 });
  }

  const results: { id: number; host: string; ok: boolean; error?: string }[] = [];
  let lastError = '';

  for (const channel of candidates) {
    // isSmtpConfigured 守卫已保证下列字段非空（与 email-verification.ts 同款非空断言）
    const transporter = nodemailer.createTransport({
      host: channel.smtp_host!,
      port: channel.smtp_port!,
      secure: channel.smtp_secure !== false,
      auth: { user: channel.smtp_user!, pass: channel.smtp_password! },
      connectionTimeout: 15000,
      greetingTimeout: 15000,
      socketTimeout: 20000,
    });

    try {
      await transporter.sendMail({
        from: `"${channel.from_name || '报价查询系统'}" <${channel.from_email}>`,
        to: toEmail,
        subject: '【报价查询系统】邮件通道连通性测试',
        text: '这是一封来自报价查询系统的 SMTP 邮件通道测试邮件。收到此邮件表示配置正常。',
        html: `<div style="font-family:'Microsoft YaHei',Arial,sans-serif;max-width:560px;margin:0 auto;border:1px solid #e5e7eb;border-radius:8px;overflow:hidden">
          <div style="background:#1e40af;color:#fff;padding:16px 24px;font-size:16px;font-weight:600">报价查询系统 · 邮件通道测试</div>
          <div style="padding:24px">
            <p style="color:#374151">这封邮件用于验证 SMTP 邮件通道是否配置正确。</p>
            <p style="color:#374151">收到此邮件表示 <b>${channel.smtp_host}</b> 通道工作正常。</p>
          </div>
        </div>`,
      });
      results.push({ id: channel.id, host: channel.smtp_host!, ok: true });
    } catch (err) {
      const msg = err instanceof Error ? err.message : String(err);
      lastError = msg;
      results.push({ id: channel.id, host: channel.smtp_host!, ok: false, error: msg });
    }
  }

  const ok = results.some((r) => r.ok);
  return NextResponse.json(
    {
      ok,
      to: toEmail,
      results,
      error: ok ? undefined : lastError || '所有通道发送失败',
    },
    { status: ok ? 200 : 500 }
  );
}
