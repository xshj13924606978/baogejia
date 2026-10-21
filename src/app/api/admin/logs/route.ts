/**
 * 管理员审计日志查询 API（#[20260831-1700] P1-9）
 *
 * 数据来源：迁移 124 新建的 admin_audit_logs 表（user_id 为 uuid，正确关联 users.id）。
 * 支持按操作人、操作类型、资源类型、资源 ID、状态、时间范围筛选与分页。
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { queryAdminAuditLogs, AdminAuditRecord } from '@/lib/audit-log-service';
import { captureException } from '@/lib/error-log-service';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = request.nextUrl;

    const userId = searchParams.get('userId') || undefined;
    const action = searchParams.get('action') || undefined;
    const resourceType = searchParams.get('resourceType') || undefined;
    const resourceId = searchParams.get('resourceId') || undefined;
    const status = searchParams.get('status') || undefined;
    const startDate = searchParams.get('startDate') || undefined;
    const endDate = searchParams.get('endDate') || undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '20', 10) || 20));

    const { records, total } = await queryAdminAuditLogs({
      userId,
      action,
      resourceType,
      resourceId,
      status,
      startDate,
      endDate,
      page,
      pageSize,
    });

    const rows = records.map((record: AdminAuditRecord) => ({
      id: record.id,
      userId: record.user_id,
      userEmail: record.user_email,
      userRole: record.user_role,
      action: record.action,
      resourceType: record.resource_type,
      resourceId: record.resource_id,
      oldValue: record.old_value,
      newValue: record.new_value,
      changes: record.changes,
      reason: record.reason,
      ipAddress: record.ip_address,
      userAgent: record.user_agent,
      status: record.status,
      errorMessage: record.error_message,
      metadata: record.metadata,
      createdAt: record.created_at,
    }));

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: {
        page,
        pageSize,
        total,
        totalPages: Math.ceil(total / pageSize),
      },
    });
  } catch (error: any) {
    captureException(error, {
      source: 'api.admin.logs.GET',
      message: '查询审计日志未处理异常',
      requestMethod: 'GET',
      requestPath: '/api/admin/logs',
      statusCode: 500,
    });
    return NextResponse.json({ success: false, error: '查询审计日志失败' }, { status: 500 });
  }
}
