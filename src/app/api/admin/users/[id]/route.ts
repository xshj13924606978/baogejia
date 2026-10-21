import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { pointsService } from '@/lib/points-service';
import { AuditLogService, extractClientIp } from '@/lib/audit-log-service';
import { revokeAllUserSessions } from '@/lib/session-version';
import { logUserAction } from '@/lib/user-log-service';
import { captureException } from '@/lib/error-log-service';

/**
 * GET - 获取单个用户详情
 * #[20260831-1700] P1-8：软删除用户不在详情中返回（deleted_at IS NULL）
 */
export async function GET(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const params = await context.params;
    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('users')
      .select('*')
      .eq('id', params.id)
      .is('deleted_at', null)
      .maybeSingle();

    if (error || !data) {
      return NextResponse.json({ success: false, error: '用户不存在' }, { status: 404 });
    }

    return NextResponse.json({
      success: true,
      data: {
        id: data.id,
        // #20260822-1630：与前端 display 规则一致（metadata?.name || full_name || username）
        name: data.metadata?.name || data.full_name || data.username,
        email: data.email,
        username: data.username,
        role: data.role,
        status: data.status,
        phone: data.metadata?.phone || '',
        avatar: data.avatar_url || '',
        points: data.metadata?.points ?? data.points ?? 0,
        createdAt: data.created_at,
        lastLogin: data.last_login,
        metadata: data.metadata || {},
      },
    });
  } catch (error: any) {
    console.error('[User Detail API] 异常:', error);
    return NextResponse.json({ success: false, error: '获取用户详情失败' }, { status: 500 });
  }
}

/**
 * PUT - 更新用户信息
 *
 * #[20260831-1700] 修复点：
 * - P0-3：积分调整走 PointsService.adminSetPoints（原子 RPC + 流水 + 通知），
 *   不再直接覆盖 metadata.points。
 * - P1-5：角色变更同步写入 user_roles 表并递增 session_version 使会话失效。
 * - P1-8：status='deleted' 时走 soft_delete_user 软删除。
 * - P0-4：所有写操作写入 admin_audit_logs，包含字段级差异。
 */
export async function PUT(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user: admin, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const params = await context.params;
    const targetId = params.id;
    const body = await request.json();
    const db = getSupabaseServiceClient();
    const now = new Date().toISOString();

    // 读取目标用户当前快照（用于审计与合并 metadata）
    const { data: oldUser, error: oldUserError } = await db
      .from('users')
      .select('*')
      .eq('id', targetId)
      .is('deleted_at', null)
      .maybeSingle();

    if (oldUserError || !oldUser) {
      return NextResponse.json({ success: false, error: '用户不存在或已删除' }, { status: 404 });
    }

    // 禁止管理员修改自己（避免误操作导致自身被禁用/删除后无法恢复）
    if (targetId === admin.id) {
      return NextResponse.json({ success: false, error: '不允许修改当前登录管理员自身' }, { status: 403 });
    }

    const updates: Record<string, any> = { updated_at: now };
    const auditChanges: Record<string, { old: unknown; new: unknown }> = {};
    let sessionInvalidated = false;

    // ----- 角色变更（P1-5）-----
    if (body.role !== undefined && body.role !== oldUser.role) {
      updates.role = body.role;
      auditChanges.role = { old: oldUser.role, new: body.role };

      // 同步写入 user_roles 表，保留变更历史
      await db.from('user_roles').insert({
        user_id: targetId,
        role: body.role,
        granted_by: admin.id,
        granted_at: now,
        is_primary: true,
      });

      // 角色变更后必须使该用户所有会话失效（避免旧 token 仍携带旧角色）
      await revokeAllUserSessions(targetId);
      sessionInvalidated = true;

      await logUserAction({
        userId: targetId,
        actionType: 'update',
        actionDetails: { field: 'role', old: oldUser.role, new: body.role, by: admin.id },
        ipAddress: extractClientIp(request),
        userAgent: request.headers.get('user-agent'),
      });
    }

    // ----- 状态变更 / 软删除（P0-1 / P1-8）-----
    if (body.status !== undefined && body.status !== oldUser.status) {
      if (body.status === 'deleted') {
        // 走软删除流程并立即返回
        const { data: sdResult, error: sdError } = await db.rpc('soft_delete_user', {
          p_user_id: targetId,
          p_operator_id: admin.id,
        });
        if (sdError || !sdResult?.success) {
          console.error('[User Update API] 软删除失败:', sdError, sdResult);
          return NextResponse.json(
            { success: false, error: sdError?.message || sdResult?.reason || '软删除失败' },
            { status: 500 }
          );
        }

        await AuditLogService.log({
          userId: admin.id,
          userEmail: admin.email,
          userRole: admin.role,
          action: 'SOFT_DELETE',
          resourceType: 'user',
          resourceId: targetId,
          oldValue: sanitizeUserSnapshot(oldUser),
          changes: { status: { old: oldUser.status, new: 'deleted' } },
          reason: body.reason || '管理员软删除用户',
          ipAddress: extractClientIp(request) ?? undefined,
          userAgent: request.headers.get('user-agent') ?? undefined,
        });

        await logUserAction({
          userId: targetId,
          actionType: 'delete_account',
          actionDetails: { reason: 'admin_soft_delete', by: admin.id },
          ipAddress: extractClientIp(request),
          userAgent: request.headers.get('user-agent'),
        });

        return NextResponse.json({
          success: true,
          message: '用户已软删除，所有会话已失效',
          data: sdResult,
        });
      }

      // 其他状态变更（disabled / active / suspended 等）
      updates.status = body.status;
      auditChanges.status = { old: oldUser.status, new: body.status };
      if (!sessionInvalidated) {
        await revokeAllUserSessions(targetId);
        sessionInvalidated = true;
      }

      await logUserAction({
        userId: targetId,
        actionType: 'update',
        actionDetails: { field: 'status', old: oldUser.status, new: body.status, by: admin.id },
        ipAddress: extractClientIp(request),
        userAgent: request.headers.get('user-agent'),
      });
    }

    // ----- 普通字段 -----
    for (const field of ['full_name', 'email', 'username', 'avatar_url']) {
      if (body[field] !== undefined && body[field] !== oldUser[field]) {
        updates[field] = body[field];
        auditChanges[field] = { old: oldUser[field], new: body[field] };
      }
    }

    // ----- metadata（不含 points，points 单独走 RPC）-----
    const metadataUpdate: Record<string, any> = {};
    if (body.phone !== undefined && body.phone !== oldUser.metadata?.phone) {
      metadataUpdate.phone = body.phone;
    }
    if (Object.keys(metadataUpdate).length > 0) {
      updates.metadata = { ...(oldUser.metadata || {}), ...metadataUpdate };
      auditChanges.metadata = { old: oldUser.metadata || {}, new: updates.metadata };
    }

    // 执行普通字段 + metadata 更新
    if (Object.keys(updates).length > 1) {
      const { error: updateError } = await db.from('users').update(updates).eq('id', targetId);
      if (updateError) {
        console.error('[User Update API] 更新失败:', updateError);
        return NextResponse.json({ success: false, error: updateError.message }, { status: 500 });
      }
    }

    // ----- 积分调整（P0-3）-----
    let pointsAudit: { oldPoints: number; newPoints: number; diff: number } | null = null;
    if (body.points !== undefined && Number(body.points) !== Number(oldUser.points)) {
      const reason = body.pointsReason || '管理员调整积分';
      const refId = `admin_set_points:${admin.id}:${targetId}:${Date.now()}`;
      const setResult = await pointsService.adminSetPoints(
        admin.id,
        targetId,
        Number(body.points),
        reason,
        refId
      );

      if (!setResult.success) {
        return NextResponse.json(
          { success: false, error: setResult.reason || '积分调整失败' },
          { status: 500 }
        );
      }

      pointsAudit = {
        oldPoints: Number(oldUser.points || 0),
        newPoints: Number(body.points),
        diff: Number(body.points) - Number(oldUser.points || 0),
      };

      await AuditLogService.log({
        userId: admin.id,
        userEmail: admin.email,
        userRole: admin.role,
        action: 'POINTS_CHANGE',
        resourceType: 'user.points',
        resourceId: targetId,
        oldValue: { points: pointsAudit.oldPoints },
        newValue: { points: pointsAudit.newPoints, reason },
        changes: { points: { old: pointsAudit.oldPoints, new: pointsAudit.newPoints } },
        reason,
        ipAddress: extractClientIp(request) ?? undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
      });
    }

    // 重新读取最新数据用于返回与审计
    const { data: newUser } = await db
      .from('users')
      .select('*')
      .eq('id', targetId)
      .maybeSingle();

    // 写管理员综合审计日志（排除已单独记录的积分变更）
    if (Object.keys(auditChanges).length > 0) {
      await AuditLogService.log({
        userId: admin.id,
        userEmail: admin.email,
        userRole: admin.role,
        action: 'UPDATE',
        resourceType: 'user',
        resourceId: targetId,
        oldValue: sanitizeUserSnapshot(oldUser),
        newValue: sanitizeUserSnapshot(newUser || oldUser),
        changes: auditChanges,
        reason: body.reason || '管理员更新用户信息',
        ipAddress: extractClientIp(request) ?? undefined,
        userAgent: request.headers.get('user-agent') ?? undefined,
      });
    }

    return NextResponse.json({
      success: true,
      message: '用户信息更新成功',
      data: newUser
        ? {
            id: newUser.id,
            name: newUser.metadata?.name || newUser.full_name || newUser.username,
            email: newUser.email,
            username: newUser.username,
            role: newUser.role,
            status: newUser.status,
            phone: newUser.metadata?.phone || '',
            avatar: newUser.avatar_url || '',
            points: newUser.metadata?.points ?? newUser.points ?? 0,
            updatedAt: newUser.updated_at,
          }
        : null,
      pointsAudit,
      sessionInvalidated,
    });
  } catch (error: any) {
    captureException(error, {
      source: 'api.admin.users.[id].PUT',
      message: '更新用户未处理异常',
      requestMethod: 'PUT',
      requestPath: '/api/admin/users/[id]',
      statusCode: 500,
    });
    return NextResponse.json({ success: false, error: '更新用户失败' }, { status: 500 });
  }
}

/**
 * DELETE - 删除用户（#[20260831-1700] P1-8：改为软删除）
 */
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  const { user: admin, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const params = await context.params;
    const targetId = params.id;
    const db = getSupabaseServiceClient();

    if (targetId === admin.id) {
      return NextResponse.json({ success: false, error: '不允许删除当前登录管理员自身' }, { status: 403 });
    }

    // 读取删除前快照用于审计
    const { data: oldUser } = await db
      .from('users')
      .select('*')
      .eq('id', targetId)
      .is('deleted_at', null)
      .maybeSingle();

    if (!oldUser) {
      return NextResponse.json({ success: false, error: '用户不存在或已删除' }, { status: 404 });
    }

    const { data: sdResult, error: sdError } = await db.rpc('soft_delete_user', {
      p_user_id: targetId,
      p_operator_id: admin.id,
    });

    if (sdError || !sdResult?.success) {
      console.error('[User Delete API] 软删除失败:', sdError, sdResult);
      return NextResponse.json(
        { success: false, error: sdError?.message || sdResult?.reason || '删除用户失败' },
        { status: 500 }
      );
    }

    await AuditLogService.log({
      userId: admin.id,
      userEmail: admin.email,
      userRole: admin.role,
      action: 'SOFT_DELETE',
      resourceType: 'user',
      resourceId: targetId,
      oldValue: sanitizeUserSnapshot(oldUser),
      newValue: { deleted_at: sdResult.deleted_at, status: 'deleted' },
      changes: { status: { old: oldUser.status, new: 'deleted' } },
      reason: '管理员删除用户（软删除）',
      ipAddress: extractClientIp(request) ?? undefined,
      userAgent: request.headers.get('user-agent') ?? undefined,
    });

    await logUserAction({
      userId: targetId,
      actionType: 'delete_account',
      actionDetails: { reason: 'admin_soft_delete', by: admin.id },
      ipAddress: extractClientIp(request),
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({
      success: true,
      message: '用户已软删除，数据保留，会话已失效',
      data: sdResult,
    });
  } catch (error: any) {
    captureException(error, {
      source: 'api.admin.users.[id].DELETE',
      message: '删除用户未处理异常',
      requestMethod: 'DELETE',
      requestPath: '/api/admin/users/[id]',
      statusCode: 500,
    });
    return NextResponse.json({ success: false, error: '删除用户失败' }, { status: 500 });
  }
}

/** 裁剪用户快照中的敏感字段，避免进入审计日志 */
function sanitizeUserSnapshot(user: Record<string, any>): Record<string, any> {
  const { password, password_hash, metadata, ...rest } = user;
  return {
    ...rest,
    metadata: metadata
      ? {
          ...metadata,
          // 再次确保快照中不含密码或 token
          password: undefined,
          token: undefined,
          access_token: undefined,
        }
      : metadata,
  };
}
