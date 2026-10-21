export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * POST - 用户批量操作
 * actions: enable | disable | delete | export
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { ids, action, filters } = body || {};

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ success: false, error: '请至少选择一个用户' }, { status: 400 });
    }

    if (ids.some((id: unknown) => typeof id !== 'string' || !id)) {
      return NextResponse.json({ success: false, error: '用户 ID 格式不正确' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const adminId = user.id;

    // 拉取目标用户的基本信息，用于权限保护（不能操作自己和超级管理员，除非操作者就是超管）
    // #20260827-0826-2 修复：users 表无 phone 列（手机号存于 metadata->>phone），去掉该列避免查询 500
    const { data: targetUsers, error: queryError } = await db
      .from('users')
      .select('id, role, status, username, email, full_name, metadata, points, created_at')
      .in('id', ids);

    if (queryError) {
      console.error('[Users Batch] 查询目标用户失败:', queryError);
      return NextResponse.json({ success: false, error: queryError.message }, { status: 500 });
    }

    const safeTargets = (targetUsers || []).filter((u) => {
      // 任何人都不能操作自己，避免误把自己禁用/删除
      if (u.id === adminId) return false;
      // 非超管不能操作超级管理员
      if (u.role === 'super_admin' && user.role !== 'super_admin') return false;
      return true;
    });

    const safeIds = safeTargets.map((u) => u.id);
    if (safeIds.length === 0 && action !== 'export') {
      return NextResponse.json(
        { success: false, error: '没有可执行操作的用户（不能操作自己或超级管理员）' },
        { status: 403 },
      );
    }

    switch (action) {
      case 'enable': {
        const { error } = await db.from('users').update({ status: 'active' }).in('id', safeIds);
        if (error) throw error;
        return NextResponse.json({
          success: true,
          data: { action, updated: safeIds.length, skipped: ids.length - safeIds.length },
        });
      }
      case 'disable': {
        const { error } = await db.from('users').update({ status: 'disabled' }).in('id', safeIds);
        if (error) throw error;
        return NextResponse.json({
          success: true,
          data: { action, updated: safeIds.length, skipped: ids.length - safeIds.length },
        });
      }
      case 'delete': {
        // 批量删除用户：使用数据库级联删除函数，先清理所有外键关联再删除 users 记录
        // #20260827-0826-2 修复：原直接 DELETE 因外键约束（quotes/enterprises/audit 字段等）导致 500
        const { error } = await db.rpc('delete_user_cascade', {
          user_ids: safeIds,
        });
        if (error) throw error;
        return NextResponse.json({
          success: true,
          data: { action, deleted: safeIds.length, skipped: ids.length - safeIds.length },
        });
      }
      case 'export': {
        // export 仅返回数据，由前端生成 CSV；不修改数据，因此允许导出全部选中项
        // #20260827-0826-2 修复：users 表无 phone 列，改为从 metadata 中提取
        const { data: exportRows, error: exportError } = await db
          .from('users')
          .select(
            'id, username, email, full_name, role, status, metadata, points, created_at, last_login',
          )
          .in('id', ids);
        if (exportError) throw exportError;
        const exportData = (exportRows || []).map((u) => ({
          ...u,
          phone: u.metadata?.phone || '',
        }));
        return NextResponse.json({
          success: true,
          data: exportData,
        });
      }
      default:
        return NextResponse.json({ success: false, error: '未知批量操作类型' }, { status: 400 });
    }
  } catch (error: any) {
    console.error('[Users Batch] 异常:', error);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(error, '批量操作失败') },
      { status: 500 },
    );
  }
}
