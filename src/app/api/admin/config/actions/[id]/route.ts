/**
 * 操作按钮配置 CRUD - 详情路由
 * GET    /api/admin/config/actions/[id] - 获取按钮详情
 * PUT    /api/admin/config/actions/[id] - 更新按钮
 * DELETE /api/admin/config/actions/[id] - 删除按钮
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { logConfigChange, getAdminId } from '@/lib/config-change-log';

export const GET = withPermissionCheckWithParams(
  { roles: ['super_admin', 'admin'] },
  async (request: NextRequest, params: any) => {
    try {
      const { id } = await params;
      const db = getSupabaseServiceClient();
      const { data, error } = await db.from('system_actions').select('*, page:system_pages(id, page_key, name_zh)').eq('id', id).single();
      if (error || !data) return NextResponse.json({ success: false, error: '按钮不存在' }, { status: 404 });
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[ActionAPI] GET detail 失败:', error);
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

      const { data: oldData } = await db.from('system_actions').select('*').eq('id', id).single();
      if (!oldData) return NextResponse.json({ success: false, error: '按钮不存在' }, { status: 404 });

      const allowed = ['action_key', 'name_zh', 'api_endpoint', 'http_method', 'is_visible', 'permission_required', 'sort_order', 'config', 'page_id'];
      const updateData: Record<string, any> = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }

      const { data, error } = await db.from('system_actions').update(updateData).eq('id', id).select().single();
      if (error) {
        if (error.message?.includes('unique')) {
          return NextResponse.json({ success: false, error: `action_key "${body.action_key}" 已存在` }, { status: 409 });
        }
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      await logConfigChange({ adminId: getAdminId(request, user), targetType: 'action', targetId: id, oldValue: oldData, newValue: data, description: body.description || `更新按钮: ${oldData.name_zh}` });

      return NextResponse.json({ success: true, message: '按钮更新成功', data });
    } catch (error) {
      console.error('[ActionAPI] PUT 失败:', error);
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

      const { data: oldData } = await db.from('system_actions').select('*').eq('id', id).single();
      if (!oldData) return NextResponse.json({ success: false, error: '按钮不存在' }, { status: 404 });

      const { error } = await db.from('system_actions').delete().eq('id', id);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

      await logConfigChange({ adminId: getAdminId(request, user), targetType: 'action', targetId: id, oldValue: oldData, description: `删除按钮: ${oldData.name_zh}` });

      return NextResponse.json({ success: true, message: '按钮已删除' });
    } catch (error) {
      console.error('[ActionAPI] DELETE 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
