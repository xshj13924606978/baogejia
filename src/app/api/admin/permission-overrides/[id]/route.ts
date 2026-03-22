/**
 * 权限覆盖 CRUD - 详情路由
 * PUT    /api/admin/permission-overrides/:id - 更新权限覆盖
 * DELETE /api/admin/permission-overrides/:id - 删除权限覆盖
 */
import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { clearCacheByTarget } from '@/lib/permission/permission-service';
import { withPermissionCheckWithParams } from '@/lib/permission-check';

export const PUT = withPermissionCheckWithParams(
  { roles: ['super_admin', 'admin'] },
  async (request: NextRequest, params: any, user: any) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const db = getSupabaseServiceClient();

      const allowed = ['is_visible', 'is_editable', 'priority'];
      const updateData: Record<string, any> = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }

      // 读取旧值用于日志
      const { data: oldData } = await db.from('permission_overrides').select('*').eq('id', id).single();
      if (!oldData) {
        return NextResponse.json({ success: false, error: '规则不存在' }, { status: 404 });
      }

      const { data, error } = await db
        .from('permission_overrides')
        .update(updateData)
        .eq('id', id)
        .select()
        .single();

      if (error) {
        return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 });
      }

      // 清除缓存
      await clearCacheByTarget(oldData.target_type, oldData.target_id);

      // 记录变更日志
      try {
        await db.from('permission_change_logs').insert({
          admin_id: user?.id || null,
          target_type: oldData.target_type,
          target_id: oldData.target_id,
          change_type: 'update',
          permission_type: oldData.permission_type,
          permission_key: oldData.permission_key,
          old_value: { is_visible: oldData.is_visible, is_editable: oldData.is_editable },
          new_value: updateData,
        });
      } catch { /* ignore */ }

      return NextResponse.json({ success: true, message: '更新成功', data });
    } catch (error) {
      console.error('[PermissionOverrides] PUT 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);

export const DELETE = withPermissionCheckWithParams(
  { roles: ['super_admin'] },
  async (request: NextRequest, params: any, user: any) => {
    try {
      const { id } = await params;
      const db = getSupabaseServiceClient();

      const { data: oldData } = await db
        .from('permission_overrides')
        .select('*')
        .eq('id', id)
        .single();

      if (!oldData) {
        return NextResponse.json({ success: false, error: '规则不存在' }, { status: 404 });
      }

      const { error } = await db.from('permission_overrides').delete().eq('id', id);
      if (error) {
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      // 清除缓存
      await clearCacheByTarget(oldData.target_type, oldData.target_id);

      // 记录变更日志
      try {
        await db.from('permission_change_logs').insert({
          admin_id: user?.id || null,
          target_type: oldData.target_type,
          target_id: oldData.target_id,
          change_type: 'delete',
          permission_type: oldData.permission_type,
          permission_key: oldData.permission_key,
          old_value: { is_visible: oldData.is_visible, is_editable: oldData.is_editable },
        });
      } catch { /* ignore */ }

      return NextResponse.json({ success: true, message: '已删除' });
    } catch (error) {
      console.error('[PermissionOverrides] DELETE 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
