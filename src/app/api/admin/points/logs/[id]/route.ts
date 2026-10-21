import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * 单条积分流水记录操作 API（管理员）
 *
 * PATCH: 更新说明（仅当类型允许编辑）
 * DELETE: 删除流水记录（仅当类型允许删除，且不自动回滚积分）
 */

interface RouteContext {
  params: Promise<{ id: string }>;
}

export async function PATCH(request: NextRequest, { params }: RouteContext) {
  try {
    const { errorResponse, user } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseServiceClient();
    const { id } = await params;
    const body = await request.json().catch(() => ({}));
    const { description } = body || {};

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少记录 ID' }, { status: 400 });
    }

    if (typeof description !== 'string' || description.trim().length === 0) {
      return NextResponse.json({ success: false, error: '说明不能为空' }, { status: 400 });
    }

    // 读取原记录
    const { data: originalLog, error: originalError } = await supabase
      .from('point_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (originalError || !originalLog) {
      return NextResponse.json({ success: false, error: '流水记录不存在' }, { status: 404 });
    }

    // 校验类型是否允许编辑
    const { data: typeConfig } = await supabase
      .from('point_log_types')
      .select('is_editable, type_name')
      .eq('type_code', originalLog.type)
      .single();

    if (typeConfig && !typeConfig.is_editable) {
      return NextResponse.json(
        { success: false, error: `类型「${typeConfig.type_name || originalLog.type}」不允许编辑说明` },
        { status: 400 }
      );
    }

    // point_logs 表无 metadata 列，仅更新真实存在的 description 列（避免 42703）
    const { error: updateError } = await supabase
      .from('point_logs')
      .update({ description: description.trim() })
      .eq('id', id);

    if (updateError) {
      console.error('[PointsLogs API] 更新说明失败:', updateError);
      return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '说明已更新' });
  } catch (error: any) {
    console.error('[PointsLogs API] 更新说明异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest, { params }: RouteContext) {
  try {
    const { errorResponse, user } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseServiceClient();
    const { id } = await params;

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少记录 ID' }, { status: 400 });
    }

    // 读取原记录
    const { data: originalLog, error: originalError } = await supabase
      .from('point_logs')
      .select('*')
      .eq('id', id)
      .single();

    if (originalError || !originalLog) {
      return NextResponse.json({ success: false, error: '流水记录不存在' }, { status: 404 });
    }

    // 校验类型是否允许删除
    const { data: typeConfig } = await supabase
      .from('point_log_types')
      .select('is_deletable, type_name')
      .eq('type_code', originalLog.type)
      .single();

    if (typeConfig && !typeConfig.is_deletable) {
      return NextResponse.json(
        { success: false, error: `类型「${typeConfig.type_name || originalLog.type}」不允许删除` },
        { status: 400 }
      );
    }

    const adminName = user?.email || user?.name || user?.id;

    // 软删除：将记录移入 point_logs_deleted 表（如果存在），否则直接删除
    const { error: insertDeletedError } = await supabase.from('point_logs_deleted').insert({
      original_id: originalLog.id,
      user_id: originalLog.user_id,
      points: originalLog.points,
      type: originalLog.type,
      description: originalLog.description,
      balance_after: originalLog.balance_after,
      reference_id: originalLog.reference_id,
      metadata: originalLog.metadata,
      created_at: originalLog.created_at,
      deleted_by: adminName,
      deleted_at: new Date().toISOString(),
    });

    if (insertDeletedError && insertDeletedError.code !== '42P01') {
      console.warn('[PointsLogs API] 写入删除备份表失败:', insertDeletedError.message);
    }

    const { error: deleteError } = await supabase.from('point_logs').delete().eq('id', id);

    if (deleteError) {
      console.error('[PointsLogs API] 删除流水失败:', deleteError);
      return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '记录已删除' });
  } catch (error: any) {
    console.error('[PointsLogs API] 删除流水异常:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}
