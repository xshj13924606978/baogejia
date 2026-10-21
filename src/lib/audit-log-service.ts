/**
 * 管理员操作审计日志服务
 *
 * #[20260831-1700] P0-4 / P1-3 重构说明：
 * - 原实现写入 `permission_audit_logs` 表，但该表 user_id 为 **bigint**，
 *   与 users.id（uuid）类型不符，存量 120 行均为无法关联真实用户的脏数据，
 *   且全系统 0 处业务调用 → 审计能力实际为空。
 * - 本次改为写入迁移 124 新建的 `admin_audit_logs` 表（user_id = uuid，正确关联），
 *   对外保持 AuditLogService 的既有 API 形状，便于各 admin API 直接接入。
 * - 底层使用 service_role 客户端绕过 RLS（该表仅允许 service_role 写入）。
 *
 * 设计原则：
 * - 日志写入失败**绝不阻断主业务**（审计不应影响功能可用性）；
 * - 所有字段真实落库，禁止任何模拟/占位数据；
 * - 敏感字段（密码、token）不进入日志，调用方需自行裁剪。
 */
import { NextRequest } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/** 审计操作类型 */
export type AuditActionType =
  | 'CREATE'
  | 'UPDATE'
  | 'DELETE'
  | 'GRANT'
  | 'REVOKE'
  | 'VIEW'
  | 'SOFT_DELETE'
  | 'STATUS_CHANGE'
  | 'POINTS_CHANGE'
  | 'LOGIN_FAIL';

export interface AdminAuditRecord {
  id: string;
  user_id: string | null;
  user_email: string | null;
  user_role: string | null;
  action: string;
  resource_type: string;
  resource_id: string | null;
  old_value: Record<string, unknown> | null;
  new_value: Record<string, unknown> | null;
  changes: Record<string, unknown> | null;
  reason: string | null;
  ip_address: string | null;
  user_agent: string | null;
  status: string;
  error_message: string | null;
  metadata: Record<string, unknown> | null;
  created_at: string;
}

export interface LogAdminActionInput {
  /** 操作人 users.id（uuid）；未知时传 null */
  userId?: string | null;
  /** 操作人邮箱快照 */
  userEmail?: string | null;
  /** 操作人角色快照 */
  userRole?: string | null;
  action: AuditActionType | string;
  resourceType: string;
  resourceId?: string | null;
  oldValue?: unknown;
  newValue?: unknown;
  changes?: Record<string, { old: unknown; new: unknown }>;
  reason?: string;
  ipAddress?: string | null;
  userAgent?: string | null;
  status?: 'success' | 'failure';
  errorMessage?: string;
  metadata?: Record<string, unknown>;
}

/** 从 NextRequest 提取客户端 IP（兼容反向代理链） */
export function extractClientIp(req?: Request | NextRequest): string | null {
  if (!req) return null;
  const xff = req.headers.get('x-forwarded-for');
  if (xff) {
    const first = xff.split(',')[0]?.trim();
    if (first) return first.replace(/^::ffff:/, '');
  }
  const realIp = req.headers.get('x-real-ip');
  return realIp || null;
}

/**
 * 计算字段级差异（仅比较顶层键，值使用 JSON 序列化后比对，避免对象引用差异）
 * 返回 { field: { old, new } }，只包含真正发生变化的字段。
 */
export function computeChanges(
  oldValue: Record<string, unknown> | null | undefined,
  newValue: Record<string, unknown> | null | undefined
): Record<string, { old: unknown; new: unknown }> {
  const changes: Record<string, { old: unknown; new: unknown }> = {};
  const o = oldValue ?? {};
  const n = newValue ?? {};
  const keys = new Set([...Object.keys(o), ...Object.keys(n)]);
  for (const key of keys) {
    const ov = (o as Record<string, unknown>)[key];
    const nv = (n as Record<string, unknown>)[key];
    if (JSON.stringify(ov ?? null) !== JSON.stringify(nv ?? null)) {
      changes[key] = { old: ov ?? null, new: nv ?? null };
    }
  }
  return changes;
}

/**
 * 写入一条管理员操作审计日志。
 * 失败仅打印错误并返回 false，绝不抛出异常（审计不应阻断业务）。
 */
export async function logAdminAction(input: LogAdminActionInput): Promise<boolean> {
  try {
    const supabase = getSupabaseServiceClient();

    // ip_address 列为 inet 类型：非法值置 null，避免整条日志因格式问题丢失
    let ip: string | null = input.ipAddress ?? null;
    if (ip && !/^[0-9a-fA-F.:]+$/.test(ip)) ip = null;

    const { error } = await supabase.from('admin_audit_logs').insert({
      user_id: input.userId ?? null,
      user_email: input.userEmail ?? null,
      user_role: input.userRole ?? null,
      action: input.action,
      resource_type: input.resourceType,
      resource_id: input.resourceId?.toString() ?? null,
      old_value: (input.oldValue as Record<string, unknown>) ?? null,
      new_value: (input.newValue as Record<string, unknown>) ?? null,
      changes: (input.changes as unknown as Record<string, unknown>) ?? null,
      reason: input.reason ?? null,
      ip_address: ip,
      user_agent: input.userAgent ?? null,
      status: input.status ?? 'success',
      error_message: input.errorMessage ?? null,
      metadata: input.metadata ?? null,
    });

    if (error) {
      console.error('[AdminAudit] 写入审计日志失败:', error.message);
      return false;
    }
    return true;
  } catch (error) {
    console.error('[AdminAudit] 写入审计日志异常:', error);
    return false;
  }
}

export interface QueryAdminAuditParams {
  userId?: string;
  action?: string;
  resourceType?: string;
  resourceId?: string;
  status?: string;
  keyword?: string;
  startDate?: Date | string;
  endDate?: Date | string;
  page?: number;
  pageSize?: number;
}

/**
 * 查询管理员审计日志（支持筛选 + 分页），供 /api/admin/logs 使用。
 */
export async function queryAdminAuditLogs(
  params: QueryAdminAuditParams
): Promise<{ records: AdminAuditRecord[]; total: number }> {
  try {
    const supabase = getSupabaseServiceClient();
    const page = Math.max(1, params.page ?? 1);
    const pageSize = Math.min(200, Math.max(1, params.pageSize ?? 20));

    let query = supabase.from('admin_audit_logs').select('*', { count: 'exact' });

    if (params.userId) query = query.eq('user_id', params.userId);
    if (params.action) query = query.eq('action', params.action);
    if (params.resourceType) query = query.eq('resource_type', params.resourceType);
    if (params.resourceId) query = query.eq('resource_id', params.resourceId);
    if (params.status) query = query.eq('status', params.status);
    if (params.startDate) query = query.gte('created_at', new Date(params.startDate).toISOString());
    if (params.endDate) query = query.lte('created_at', new Date(params.endDate).toISOString());

    const from = (page - 1) * pageSize;
    const { data, error, count } = await query
      .order('created_at', { ascending: false })
      .range(from, from + pageSize - 1);

    if (error) {
      console.error('[AdminAudit] 查询审计日志失败:', error.message);
      return { records: [], total: 0 };
    }

    return { records: (data ?? []) as AdminAuditRecord[], total: count ?? 0 };
  } catch (error) {
    console.error('[AdminAudit] 查询审计日志异常:', error);
    return { records: [], total: 0 };
  }
}

/**
 * 审计日志服务（保持既有调用形状：AuditLogService.log / query）
 *
 * 注：与早期版本相比，底层表由 permission_audit_logs 切换为 admin_audit_logs，
 * userId 类型由 number 放宽为 string（uuid），以便正确关联 users.id。
 */
export class AuditLogService {
  /**
   * 记录审计日志
   * @param params.userId 操作人 users.id（uuid 字符串）
   */
  static async log(params: {
    userId?: string | null;
    username?: string;
    userEmail?: string;
    userRole?: string;
    action: AuditActionType | string;
    resourceType: string;
    resourceId?: string | number | null;
    oldValue?: unknown;
    newValue?: unknown;
    changes?: Record<string, { old: unknown; new: unknown }>;
    reason?: string;
    ipAddress?: string;
    userAgent?: string;
    status?: 'success' | 'failure';
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }): Promise<boolean> {
    return logAdminAction({
      userId: params.userId ?? null,
      userEmail: params.userEmail ?? params.username ?? null,
      userRole: params.userRole ?? null,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId?.toString() ?? null,
      oldValue: params.oldValue,
      newValue: params.newValue,
      changes: params.changes,
      reason: params.reason,
      ipAddress: params.ipAddress ?? null,
      userAgent: params.userAgent ?? null,
      status: params.status ?? 'success',
      errorMessage: params.errorMessage,
      metadata: {
        ...(params.metadata ?? {}),
        // username 作为兼容字段保留在 metadata（新版以 user_email 为主）
        ...(params.username ? { username: params.username } : {}),
      },
    });
  }

  /** 查询审计日志 */
  static async query(params: {
    userId?: string;
    action?: string;
    resourceType?: string;
    resourceId?: string | number;
    status?: string;
    startDate?: Date;
    endDate?: Date;
    limit?: number;
    offset?: number;
  }): Promise<AdminAuditRecord[]> {
    const limit = params.limit ?? 100;
    const offset = params.offset ?? 0;
    const page = Math.floor(offset / limit) + 1;
    const { records } = await queryAdminAuditLogs({
      userId: params.userId,
      action: params.action,
      resourceType: params.resourceType,
      resourceId: params.resourceId?.toString(),
      status: params.status,
      startDate: params.startDate,
      endDate: params.endDate,
      page,
      pageSize: limit,
    });
    return records;
  }

  /** 获取某资源的变更历史 */
  static async getResourceHistory(
    resourceType: string,
    resourceId: string | number,
    limit = 50
  ): Promise<AdminAuditRecord[]> {
    const { records } = await queryAdminAuditLogs({
      resourceType,
      resourceId: resourceId.toString(),
      page: 1,
      pageSize: Math.min(200, limit),
    });
    return records;
  }
}

/**
 * 便捷函数：在 API 路由中记录审计日志（自动提取 IP / User-Agent）
 */
export async function auditLog(
  request: Request,
  params: {
    userId?: string | null;
    userEmail?: string | null;
    userRole?: string | null;
    action: AuditActionType | string;
    resourceType: string;
    resourceId?: string | number | null;
    oldValue?: unknown;
    newValue?: unknown;
    changes?: Record<string, { old: unknown; new: unknown }>;
    reason?: string;
    status?: 'success' | 'failure';
    errorMessage?: string;
    metadata?: Record<string, unknown>;
  }
): Promise<boolean> {
  return logAdminAction({
    ...params,
    resourceId: params.resourceId?.toString() ?? null,
    ipAddress: extractClientIp(request),
    userAgent: request.headers.get('user-agent') ?? null,
  });
}
