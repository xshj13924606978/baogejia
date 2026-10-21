/**
 * 邮件通道管理 API（#[20260828-1345]-1 → #[20260831-1700] P1-11 加密 + P0-4 审计）
 * - GET  ：列出全部通道（密码脱敏，仅返回 has_password 标记）
 * - POST ：新增 SMTP 通道（任意服务商，适用所有类型邮箱）
 *          SMTP 密码默认 AES-256-GCM 加密落库（无密钥时兼容明文）
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

async function getHandler(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.errorResponse) return auth.errorResponse;

  const db = getSupabaseServiceClient();
  const { data, error } = await db
    .from('email_settings')
    .select(
      'id, provider, priority, smtp_host, smtp_port, smtp_secure, smtp_user, smtp_password, smtp_password_encrypted, password_encrypted, from_email, from_name, enabled, updated_at'
    )
    .order('priority', { ascending: true, nullsFirst: false })
    .order('id', { ascending: true });

  if (error) {
    return NextResponse.json({ error: '查询失败：' + safeErrorMessage(error) }, { status: 500 });
  }

  const rows = (data as EmailSettingsRow[] | null)?.map((r) => ({
    id: r.id,
    provider: r.provider,
    priority: r.priority,
    smtp_host: r.smtp_host,
    smtp_port: r.smtp_port,
    smtp_secure: r.smtp_secure,
    smtp_user: r.smtp_user,
    has_password: Boolean(r.smtp_password || r.smtp_password_encrypted),
    password_encrypted: r.password_encrypted,
    from_email: r.from_email,
    from_name: r.from_name,
    enabled: r.enabled,
    updated_at: r.updated_at,
  })) ?? [];

  return NextResponse.json({ rows });
}

async function postHandler(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.errorResponse) return auth.errorResponse;

  const body = await request.json().catch(() => null);
  if (!body) {
    return NextResponse.json({ error: '请求体无效' }, { status: 400 });
  }

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

  if (!smtp_host || !smtp_user || !smtp_password || !from_email) {
    return NextResponse.json(
      { error: '请填写 SMTP 服务器地址、账号、密码与发件邮箱' },
      { status: 400 }
    );
  }
  if (!String(from_email).includes('@')) {
    return NextResponse.json({ error: '发件邮箱格式不正确' }, { status: 400 });
  }

  const db = getSupabaseServiceClient();

  // P1-11：SMTP 密码加密存储（无密钥时回退明文，保持兼容）
  const encryptedPassword = encryptSmtpPasswordCompact(String(smtp_password));
  const insertPayload: Record<string, unknown> = {
    provider: 'smtp',
    priority: Number.isInteger(Number(priority)) ? Number(priority) : 999,
    smtp_host: String(smtp_host).trim(),
    smtp_port: Number(smtp_port) || 465,
    smtp_secure: smtp_secure !== false,
    smtp_user: String(smtp_user).trim(),
    smtp_password: encryptedPassword ? null : String(smtp_password),
    smtp_password_encrypted: encryptedPassword || null,
    password_encrypted: Boolean(encryptedPassword),
    from_email: String(from_email).trim(),
    from_name: String(from_name || '报价查询系统').trim(),
    enabled: enabled !== false,
  };

  const { data, error } = await db
    .from('email_settings')
    .insert(insertPayload)
    .select(
      'id, provider, priority, smtp_host, smtp_port, smtp_user, from_email, from_name, enabled, updated_at, password_encrypted'
    )
    .single();

  if (error) {
    return NextResponse.json({ error: '保存失败：' + safeErrorMessage(error) }, { status: 500 });
  }

  // P0-4：管理员写操作审计
  await AuditLogService.log({
    userId: auth.user.id,
    userEmail: auth.user.email,
    userRole: auth.user.role,
    action: 'CREATE',
    resourceType: 'email_settings',
    resourceId: data.id,
    newValue: {
      ...insertPayload,
      smtp_password: '[REDACTED]',
      smtp_password_encrypted: insertPayload.smtp_password_encrypted ? '[REDACTED]' : null,
    },
    reason: '管理员新增 SMTP 通道',
    ipAddress: extractClientIp(request) ?? undefined,
    userAgent: request.headers.get('user-agent') ?? undefined,
  });

  return NextResponse.json({
    ok: true,
    row: data,
    encrypted: Boolean(encryptedPassword),
    encryptionEnabled: isEmailPasswordEncryptionEnabled(),
  });
}

export const GET = withErrorCapture('GET /api/admin/email-settings', getHandler);
export const POST = withErrorCapture('POST /api/admin/email-settings', postHandler);

// 兜底：捕获未处理异常时已经由 withErrorCapture 落库，这里仅做类型占位
function withErrorCapture(
  source: string,
  handler: (req: NextRequest) => Promise<NextResponse>
): (req: NextRequest) => Promise<NextResponse> {
  return async (req: NextRequest) => {
    try {
      return await handler(req);
    } catch (error) {
      captureException(error, {
        source,
        message: error instanceof Error ? safeErrorMessage(error) : '未处理异常',
        requestMethod: req.method,
        requestPath: req.url,
        statusCode: 500,
        ipAddress: extractClientIp(req) ?? undefined,
        userAgent: req.headers.get('user-agent') ?? undefined,
      });
      return NextResponse.json(
        { error: '服务器内部错误', detail: error instanceof Error ? safeErrorMessage(error) : String(error) },
        { status: 500 }
      );
    }
  };
}
