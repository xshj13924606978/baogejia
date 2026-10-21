/**
 * 用户字段配置 CRUD - 详情路由
 * GET    /api/admin/config/user-fields/[id] - 获取字段详情
 * PUT    /api/admin/config/user-fields/[id] - 更新字段
 * DELETE /api/admin/config/user-fields/[id] - 删除字段（级联删除按钮）
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
      const { data, error } = await db.from('user_fields').select('*, page:user_pages(id, page_key, name_zh)').eq('id', id).single();
      if (error || !data) {
        return NextResponse.json({ success: false, error: '字段不存在' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[UserFieldAPI] GET detail 失败:', error);
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

      const { data: oldData } = await db.from('user_fields').select('*').eq('id', id).single();
      if (!oldData) {
        return NextResponse.json({ success: false, error: '字段不存在' }, { status: 404 });
      }

      const allowed = ['field_key', 'field_type', 'label_zh', 'is_visible', 'is_editable', 'is_required', 'sort_order', 'group_name', 'default_value', 'validation_rules', 'options_config', 'depends_on', 'config'];
      const updateData: Record<string, any> = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ success: false, error: '没有需要更新的字段' }, { status: 400 });
      }

      const { data, error } = await db.from('user_fields').update(updateData).eq('id', id).select().single();
      if (error) {
        if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
          return NextResponse.json({ success: false, error: `field_key "${body.field_key}" 已被占用` }, { status: 409 });
        }
        return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
      }

      await logConfigChange({
        adminId: getAdminId(request, user),
        targetType: 'user_field',
        targetId: id,
        oldValue: oldData,
        newValue: data,
        description: body.description || `更新用户字段: ${oldData.label_zh}`,
      });

      return NextResponse.json({ success: true, message: '字段更新成功', data });
    } catch (error) {
      console.error('[UserFieldAPI] PUT 失败:', error);
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

      const { data: oldData } = await db.from('user_fields').select('*').eq('id', id).single();
      if (!oldData) {
        return NextResponse.json({ success: false, error: '字段不存在' }, { status: 404 });
      }

      const { error } = await db.from('user_fields').delete().eq('id', id);
      if (error) return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });

      await logConfigChange({ adminId: getAdminId(request, user), targetType: 'user_field', targetId: id, oldValue: oldData, description: `删除用户字段: ${oldData.label_zh}` });

      return NextResponse.json({ success: true, message: '字段已删除' });
    } catch (error) {
      console.error('[UserFieldAPI] DELETE 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
