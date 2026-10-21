/**
 * 用户级字段覆盖 CRUD - 详情路由
 * GET    /api/admin/config/overrides/[id] - 获取覆盖规则详情
 * PUT    /api/admin/config/overrides/[id] - 更新覆盖规则
 * DELETE /api/admin/config/overrides/[id] - 删除覆盖规则
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { logConfigChange, getAdminId } from '@/lib/config-change-log';
import { safeErrorMessage } from '@/lib/error-handler';

export const GET = withPermissionCheckWithParams(
  { roles: ['super_admin', 'admin'] },
  async (request: NextRequest, params: any) => {
    try {
      const { id } = await params;
      const db = getSupabaseServiceClient();
      const { data, error } = await db.from('user_field_overrides').select('*, field:system_fields(id, field_key, label_zh)').eq('id', id).single();
      if (error || !data) return NextResponse.json({ success: false, error: '覆盖规则不存在' }, { status: 404 });
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[OverrideAPI] GET detail 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);

export const PUT = withPermissionCheckWithParams(
  { roles: ['super_admin', 'admin'] },
  async (request: NextRequest, params: any, user: any) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const db = getSupabaseServiceClient();

      const { data: oldData } = await db.from('user_field_overrides').select('*').eq('id', id).single();
      if (!oldData) return NextResponse.json({ success: false, error: '覆盖规则不存在' }, { status: 404 });

      const allowed = ['user_id', 'field_id', 'field_value', 'is_visible', 'is_editable'];
      const updateData: Record<string, any> = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }

      const { data, error } = await db.from('user_field_overrides').update(updateData).eq('id', id).select().single();
      if (error) return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });

      await logConfigChange({ adminId: getAdminId(request, user), targetType: 'user_override', targetId: id, oldValue: oldData, newValue: data, description: body.description || `更新用户字段覆盖` });

      return NextResponse.json({ success: true, message: '覆盖规则更新成功', data });
    } catch (error) {
      console.error('[OverrideAPI] PUT 失败:', error);
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

      const { data: oldData } = await db.from('user_field_overrides').select('*').eq('id', id).single();
      if (!oldData) return NextResponse.json({ success: false, error: '覆盖规则不存在' }, { status: 404 });

      const { error } = await db.from('user_field_overrides').delete().eq('id', id);
      if (error) return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });

      await logConfigChange({ adminId: getAdminId(request, user), targetType: 'user_override', targetId: id, oldValue: oldData, description: '删除用户字段覆盖' });

      return NextResponse.json({ success: true, message: '覆盖规则已删除' });
    } catch (error) {
      console.error('[OverrideAPI] DELETE 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
