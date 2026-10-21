/**
 * 邮件通道管理 API（#[20260828-1345]-1 → #[20260831-1700] P1-11 加密 + P0-4 审计 + P1-6 异常落库）
 * - PUT   ：更新通道（密码留空 = 保持原密码，不覆盖）
 * - DELETE：删除通道
 * 鉴权：requireAdmin（数据库 roles 表 is_admin=true 驱动）
 */
import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { AuditLogService, extractClientIp } from '@/lib/audit-log-service';
import { captureException } from '@/lib/error-log-service';
import {
  encryptSmtpPasswordCompact,
  isEmailPasswordEncryptionEnabled,
} from '@/lib/email-password-crypto';
import { safeErrorMessage } from '@/lib/error-handler';

type RouteContext = { params: Promise<{ id: string }> };

type EmailSettingsRow = {
  id: number;
  provider: string;
  priority: number;
  smtp_host: string | null;
  smtp_port: number | null;
  smtp_secure: boolean | null;
  smtp_user: string | null;
  smtp_password: string | null;
  smtp_password_encrypted: string | null;
  password_encrypted: boolean;
  from_email: string | null;
  from_name: string | null;
  enabled: boolean;
  updated_at: string;
};

export async function PUT(request: NextRequest, ctx: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (auth.errorResponse) return auth.errorResponse;

    const { id } = await ctx.params;
    const rowId = Number(id);
    if (!Number.isInteger(rowId) || rowId <= 0) {
      return NextResponse.json({ error: '无效的通道 ID' }, { status: 400 });
    }

    const body = await request.json().catch(() => null);
    if (!body) {
      return NextResponse.json({ error: '请求体无效' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const { data: existing } = await db
      .from('email_settings')
      .select('*')
      .eq('id', rowId)
      .maybeSingle();
    if (!existing) {
      return NextResponse.json({ error: '通道不存在' }, { status: 404 });
    }

    const oldRow = existing as EmailSettingsRow;

    const {
      priority,
      smtp_host,
      smtp_port,
      smtp_secure,
      smtp_user,
      smtp_password,
      from_email,
      from_name,
      enabled,
    } = body;

    const patch: Record<string, unknown> = { updated_at: new Date().toISOString() };
    const auditChanges: Record<string, { old: unknown; new: unknown }> = {};

    if (priority !== undefined && priority !== null && priority !== '' && Number.isInteger(Number(priority))) {
      patch.priority = Number(priority);
      if (oldRow.priority !== patch.priority) auditChanges.priority = { old: oldRow.priority, new: patch.priority };
    }
    if (typeof smtp_host === 'string' && smtp_host.trim()) {
      patch.smtp_host = smtp_host.trim();
      if (oldRow.smtp_host !== patch.smtp_host) auditChanges.smtp_host = { old: oldRow.smtp_host, new: patch.smtp_host };
    }
    if (smtp_port !== undefined && smtp_port !== null && smtp_port !== '') {
      patch.smtp_port = Number(smtp_port) || 465;
      if (oldRow.smtp_port !== patch.smtp_port) auditChanges.smtp_port = { old: oldRow.smtp_port, new: patch.smtp_port };
    }
    if (smtp_secure !== undefined) {
      patch.smtp_secure = smtp_secure !== false;
      if (oldRow.smtp_secure !== patch.smtp_secure) auditChanges.smtp_secure = { old: oldRow.smtp_secure, new: patch.smtp_secure };
    }
    if (typeof smtp_user === 'string' && smtp_user.trim()) {
      patch.smtp_user = smtp_user.trim();
      if (oldRow.smtp_user !== patch.smtp_user) auditChanges.smtp_user = { old: oldRow.smtp_user, new: patch.smtp_user };
    }
    // 密码留空 = 保持原密码；提供新密码时加密存储
    if (typeof smtp_password === 'string' && smtp_password.trim()) {
      const encryptedPassword = encryptSmtpPasswordCompact(smtp_password);
      patch.smtp_password = encryptedPassword ? null : smtp_password;
      patch.smtp_password_encrypted = encryptedPassword || null;
      patch.password_encrypted = Boolean(encryptedPassword);
      auditChanges.password_changed = { old: Boolean(oldRow.smtp_password || oldRow.smtp_password_encrypted), new: true };
    }
    if (typeof from_email === 'string' && from_email.trim()) {
      if (!from_email.includes('@')) {
        return NextResponse.json({ error: '发件邮箱格式不正确' }, { status: 400 });
      }
      patch.from_email = from_email.trim();
      if (oldRow.from_email !== patch.from_email) auditChanges.from_email = { old: oldRow.from_email, new: patch.from_email };
    }
    if (typeof from_name === 'string' && from_name.trim()) {
      patch.from_name = from_name.trim();
      if (oldRow.from_name !== patch.from_name) auditChanges.from_name = { old: oldRow.from_name, new: patch.from_name };
    }
    if (typeof enabled === 'boolean') {
      patch.enabled = enabled;
      if (oldRow.enabled !== patch.enabled) auditChanges.enabled = { old: oldRow.enabled, new: patch.enabled };
    }

    const { data, error } = await db
      .from('email_settings')
      .update(patch)
      .eq('id', rowId)
      .select(
        'id, provider, priority, smtp_host, smtp_port, smtp_user, from_email, from_name, enabled, updated_at, password_encrypted'
      )
      .single();

    if (error) {
      return NextResponse.json({ error: '更新失败：' + safeErrorMessage(error) }, { status: 500 });
    }

    await AuditLogService.log({
      userId: auth.user.id,
      userEmail: auth.user.email,
      userRole: auth.user.role,
      action: 'UPDATE',
      resourceType: 'email_settings',
      resourceId: rowId,
      oldValue: sanitizeEmailSettingsForAudit(oldRow),
      newValue: sanitizeEmailSettingsForAudit(data as EmailSettingsRow),
      changes: auditChanges,
      reason: '管理员更新 SMTP 通道',
      ipAddress: extractClientIp(request) ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    return NextResponse.json({
      ok: true,
      row: data,
      encrypted: Boolean(patch.smtp_password_encrypted),
      encryptionEnabled: isEmailPasswordEncryptionEnabled(),
    });
  } catch (error) {
    captureException(error, {
      source: 'api.admin.email-settings.[id].PUT',
      message: '更新 SMTP 通道未处理异常',
      requestMethod: 'PUT',
      requestPath: '/api/admin/email-settings/[id]',
      statusCode: 500,
    });
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, ctx: RouteContext) {
  try {
    const auth = await requireAdmin(request);
    if (auth.errorResponse) return auth.errorResponse;

    const { id } = await ctx.params;
    const rowId = Number(id);
    if (!Number.isInteger(rowId) || rowId <= 0) {
      return NextResponse.json({ error: '无效的通道 ID' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const { data: existing } = await db
      .from('email_settings')
      .select('*')
      .eq('id', rowId)
      .maybeSingle();

    if (existing) {
      await AuditLogService.log({
        userId: auth.user.id,
        userEmail: auth.user.email,
        userRole: auth.user.role,
        action: 'DELETE',
        resourceType: 'email_settings',
        resourceId: rowId,
        oldValue: sanitizeEmailSettingsForAudit(existing as EmailSettingsRow),
        reason: '管理员删除 SMTP 通道',
        ipAddress: extractClientIp(request) ?? undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
      });
    }

    const { error } = await db.from('email_settings').delete().eq('id', rowId);

    if (error) {
      return NextResponse.json({ error: '删除失败：' + safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ ok: true });
  } catch (error) {
    captureException(error, {
      source: 'api.admin.email-settings.[id].DELETE',
      message: '删除 SMTP 通道未处理异常',
      requestMethod: 'DELETE',
      requestPath: '/api/admin/email-settings/[id]',
      statusCode: 500,
    });
    return NextResponse.json({ error: '服务器内部错误' }, { status: 500 });
  }
}

function sanitizeEmailSettingsForAudit(row: EmailSettingsRow): Record<string, unknown> {
  const { smtp_password, smtp_password_encrypted, ...rest } = row;
  return {
    ...rest,
    has_password: Boolean(smtp_password || smtp_password_encrypted),
  };
}
