export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 管理接口：获取所有用户的上传记录（含上传者信息）
 * 管理员专用，关联 users 表返回上传者名称
 */
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const db = getSupabaseServiceClient();
    const { data: records, error } = await db
      .from('user_uploads')
      .select(`
        *,
        users:user_id (id, username, full_name, email, metadata),
        deleted_by_user:deleted_by (id, username, full_name, email, metadata)
      `)
      .order('created_at', { ascending: false })
      .limit(200);

    if (error) {
      console.error('[Admin] 查询上传记录失败:', error);
      return NextResponse.json({ error: '查询失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      records: records || [],
    });
  } catch (error) {
    console.error('[Admin] 请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 批量删除上传记录（管理员，对全用户记录有效）
export async function DELETE(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const ids = body?.ids;
    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json({ error: '缺少要删除的记录ID' }, { status: 400 });
    }
    if (ids.length > 200) {
      return NextResponse.json({ error: '单次删除数量不能超过200条' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    const { data: records, error: queryError } = await db
      .from('user_uploads')
      .select('id, file_key')
      .in('id', ids);

    if (queryError) {
      console.error('[Admin] 查询待删除记录失败:', queryError);
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }

    const toDelete = (records || []).map((r) => r.id);
    if (toDelete.length === 0) {
      return NextResponse.json({ success: true, deletedCount: 0 });
    }

    const { error: deleteError } = await db.from('user_uploads').delete().in('id', toDelete);
    if (deleteError) {
      console.error('[Admin] 删除上传记录失败:', deleteError);
      return NextResponse.json({ error: '删除失败' }, { status: 500 });
    }

    // 尽力清理存储中的文件（失败不影响记录删除结果）
    const fileKeys = (records || []).map((r) => r.file_key).filter(Boolean) as string[];
    if (fileKeys.length > 0) {
      try {
        const { error: storageError } = await db.storage.from('quote-files').remove(fileKeys);
        if (storageError) console.warn('[Admin] 清理存储文件失败:', storageError);
      } catch (e) {
        console.warn('[Admin] 清理存储文件异常:', e);
      }
    }

    return NextResponse.json({ success: true, deletedCount: toDelete.length });
  } catch (error) {
    console.error('[Admin] 删除请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
