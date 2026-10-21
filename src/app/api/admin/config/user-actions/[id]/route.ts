/**
 * 用户按钮配置 CRUD - 详情路由
 * GET    /api/admin/config/user-actions/[id] - 获取按钮详情
 * PUT    /api/admin/config/user-actions/[id] - 更新按钮
 * DELETE /api/admin/config/user-actions/[id] - 删除按钮
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
      const { data, error } = await db.from('user_actions').select('*, page:user_pages(id, page_key, name_zh)').eq('id', id).single();
      if (error || !data) {
        return NextResponse.json({ success: false, error: '按钮不存在' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[UserActionAPI] GET detail 失败:', error);
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

      const { data: oldData } = await db.from('user_actions').select('*').eq('id', id).single();
      if (!oldData) {
        return NextResponse.json({ success: false, error: '按钮不存在' }, { status: 404 });
      }

      const allowed = ['action_key', 'name_zh', 'api_endpoint', 'http_method', 'is_visible', 'permission_required', 'sort_order', 'config'];
      const updateData: Record<string, any> = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ success: false, error: '没有需要更新的字段' }, { status: 400 });
      }

      const { data, error } = await db.from('user_actions').update(updateData).eq('id', id).select().single();
      if (error) {
        if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
          return NextResponse.json({ success: false, error: `action_key "${body.action_key}" 已被占用` }, { status: 409 });
        }
        return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
      }

      await logConfigChange({
        adminId: getAdminId(request, user),
        targetType: 'user_action',
        targetId: id,
        oldValue: oldData,
        newValue: data,
        description: body.description || `更新用户按钮: ${oldData.name_zh}`,
      });

      return NextResponse.json({ success: true, message: '按钮更新成功', data });
    } catch (error) {
      console.error('[UserActionAPI] PUT 失败:', error);
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

      const { data: oldData } = await db.from('user_actions').select('*').eq('id', id).single();
      if (!oldData) {
        return NextResponse.json({ success: false, error: '按钮不存在' }, { status: 404 });
      }

      const { error } = await db.from('user_actions').delete().eq('id', id);
      if (error) return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });

      await logConfigChange({ adminId: getAdminId(request, user), targetType: 'user_action', targetId: id, oldValue: oldData, description: `删除用户按钮: ${oldData.name_zh}` });

      return NextResponse.json({ success: true, message: '按钮已删除' });
    } catch (error) {
      console.error('[UserActionAPI] DELETE 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
