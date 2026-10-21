/**
 * 知识库单条详情 API
 *
 * GET /api/knowledge/[id]
 *
 * 权限：
 * - 未登录：只能看 approved
 * - 普通用户：只能看 approved 或自己上传的
 * - 超管/管理员：可看全部
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { getUserPermissions } from '@/lib/permission/permission-service';
import { logUserAction } from '@/lib/user-log-service';
import { addAuditLog } from '@/lib/knowledge/audit-log';

export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const db = getSupabaseServiceClient();

    const { data: entry, error } = await db
      .from('knowledge_entries')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !entry) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    // 统一认证上下文解析（含降级检测）
    const ctx = await resolveAuthContext(request);
    const currentUserId = ctx.currentUserId;
    const normalizedRole = ctx.hasRealAuth ? ctx.effectiveRole : null;

    // 权限判断
    if (entry.status !== 'approved') {
      // 非approved条目：仅超管/管理员/上传者本人可见
      const isSelf = currentUserId === entry.user_id;
      const isAdmin = normalizedRole === 'super_admin' || normalizedRole === 'admin';
      if (!isSelf && !isAdmin) {
        return NextResponse.json({ success: false, error: '无权限查看' }, { status: 403 });
      }
    }

    // 获取上传者信息
    let uploaderName = '未知';
    if (entry.user_id) {
      try {
        const { data: user } = await db
          .from('users')
          .select('id, username, full_name')
          .eq('id', entry.user_id)
          .single();
        if (user) uploaderName = user.full_name || user.username || user.id;
      } catch { /* ignore */ }
    }

    // 获取 tags
    let tags: string[] = [];
    try {
      const { data: tagRelations } = await db
        .from('knowledge_entry_tags')
        .select('tag_id, knowledge_tags(name)')
        .eq('entry_id', id);
      if (tagRelations) {
        tags = tagRelations.map((r: any) => r.knowledge_tags?.name).filter(Boolean);
      }
    } catch { /* ignore */ }

    // 下载权限（#[20260827-2000]-3：与下载接口 download-url 的 getUserPermissions 判断保持一致，
    // 已登录用户的下载能力由权限配置决定，未登录一律不可下载）
    let canDownload = !!currentUserId;
    if (currentUserId) {
      try {
        const perms = await getUserPermissions(currentUserId, ctx.effectiveRole);
        canDownload = perms.actions['knowledge:download'] ?? true;
      } catch {
        canDownload = true;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        ...entry,
        uploader_name: uploaderName,
        tags,
      },
      permissions: { can_download: canDownload },
    });
  } catch (error: any) {
    console.error('[Knowledge Detail] 异常:', error);
    return NextResponse.json({ success: false, error: '获取详情失败' }, { status: 500 });
  }
}

/**
 * PATCH /api/knowledge/[id]
 * 编辑资料（编辑限本人，管理员可编辑全部）
 * - 本人编辑：仅可修改 title/description/metadata，状态重置为 pending（重新提交审核），清除拒绝原因
 * - 管理员编辑：可同时修改 type/status 等（与管理端一致）
 */
export async function PATCH(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await resolveAuthContext(request);
    if (!ctx.isAuthenticated) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }
    const normalizedRole = ctx.effectiveRole;
    const isAdmin = normalizedRole === 'super_admin' || normalizedRole === 'admin';

    const { id } = await params;
    const db = getSupabaseServiceClient();

    const { data: entry, error: fetchError } = await db
      .from('knowledge_entries')
      .select('id, user_id, status, title, type')
      .eq('id', id)
      .single();

    if (fetchError || !entry) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    const isOwner = entry.user_id === ctx.currentUserId;
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ success: false, error: '仅可编辑自己上传的资料' }, { status: 403 });
    }

    const body = await request.json();
    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };

    // 本人可编辑字段
    if (body.title !== undefined) updateData.title = String(body.title).trim() || entry.title;
    if (body.description !== undefined) updateData.description = body.description;
    if (body.metadata !== undefined) updateData.metadata = body.metadata;

    if (!isAdmin) {
      // 非管理员禁止直接改状态/类型；本人编辑需重新提交审核
      if (body.status !== undefined && body.status !== entry.status) {
        return NextResponse.json({ success: false, error: '无权直接修改状态' }, { status: 403 });
      }
      updateData.status = 'pending';
      updateData.reject_reason = null;
    } else {
      // 管理员可管理状态/类型
      if (body.status !== undefined) {
        if (!['pending', 'approved', 'rejected'].includes(body.status)) {
          return NextResponse.json({ success: false, error: '无效的状态值' }, { status: 400 });
        }
        updateData.status = body.status;
      }
      if (body.type !== undefined) updateData.type = body.type;
      if (body.reject_reason !== undefined) updateData.reject_reason = body.reject_reason;
    }

    const { data: updated, error: updateError } = await db
      .from('knowledge_entries')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (updateError) {
      console.error('[Knowledge User Edit] 更新失败:', updateError);
      return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 });
    }

    // 记录日志
    await logUserAction({
      userId: ctx.currentUserId!,
      actionType: 'update',
      actionDetails: {
        entry_id: id,
        title: entry.title,
        by_owner: isOwner,
        reset_to_pending: !isAdmin,
      },
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: request.headers.get('user-agent'),
    });

    // 写审计日志（非阻塞）
    await addAuditLog(
      id,
      isAdmin && updateData.status === 'approved'
        ? 'approve'
        : isAdmin && updateData.status === 'rejected'
          ? 'reject'
          : 'edit',
      ctx.currentUserId || 'system',
      {
        title: updated.title || entry.title,
        from_status: entry.status,
        to_status: updated.status || entry.status,
        by_owner: isOwner,
        reset_to_pending: !isAdmin,
      },
      isAdmin && updateData.status === 'rejected' ? updateData.reject_reason : undefined
    );

    return NextResponse.json({ success: true, message: isOwner ? '已保存，等待重新审核' : '更新成功', data: updated });
  } catch (error: any) {
    console.error('[Knowledge User Edit] 异常:', error);
    return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 });
  }
}

/**
 * DELETE /api/knowledge/[id]
 * 删除资料：仅管理员可删除（删除仅管理员）
 */
export async function DELETE(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const ctx = await resolveAuthContext(request);
    if (!ctx.isAuthenticated) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }
    const normalizedRole = ctx.effectiveRole;
    if (normalizedRole !== 'super_admin' && normalizedRole !== 'admin') {
      return NextResponse.json({ success: false, error: '仅管理员可删除资料' }, { status: 403 });
    }

    const { id } = await params;
    const db = getSupabaseServiceClient();

    const { data: item, error: fetchError } = await db
      .from('knowledge_entries')
      .select('file_key, file_name, title')
      .eq('id', id)
      .single();

    if (fetchError || !item) {
      return NextResponse.json({ success: false, error: '条目不存在' }, { status: 404 });
    }

    // 写审计日志（删除前，尽量保留记录；失败不影响删除）
    await addAuditLog(id, 'delete', ctx.currentUserId || 'system', { title: item.title, file_name: item.file_name, via: 'user' });

    const { error: deleteError } = await db.from('knowledge_entries').delete().eq('id', id);
    if (deleteError) {
      console.error('[Knowledge User Delete] 删除记录失败:', deleteError);
      return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 });
    }

    if (item.file_key) {
      try {
        await db.storage.from('knowledge-base').remove([item.file_key]);
      } catch (storageErr: any) {
        console.warn('[Knowledge User Delete] 删除存储文件失败（已忽略）:', storageErr.message);
      }
    }

    // 记录日志
    await logUserAction({
      userId: ctx.currentUserId!,
      actionType: 'delete',
      actionDetails: { entry_id: id, file_name: item.file_name },
      ipAddress: request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || null,
      userAgent: request.headers.get('user-agent'),
    });

    return NextResponse.json({ success: true, message: '已删除' });
  } catch (error: any) {
    console.error('[Knowledge User Delete] 异常:', error);
    return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 });
  }
}
