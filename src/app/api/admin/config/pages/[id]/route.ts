/**
 * 页面配置 CRUD - 详情路由
 * GET    /api/admin/config/pages/[id] - 获取页面详情
 * PUT    /api/admin/config/pages/[id] - 更新页面
 * DELETE /api/admin/config/pages/[id] - 删除页面（级联删除字段和按钮）
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

      const { data, error } = await db
        .from('system_pages')
        .select('*, module:system_modules(id, module_key, name_zh, icon, route_path)')
        .eq('id', id)
        .single();

      if (error || !data) return NextResponse.json({ success: false, error: '页面不存在' }, { status: 404 });
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[PageAPI] GET detail 失败:', error);
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

      const { data: oldData } = await db.from('system_pages').select('*').eq('id', id).single();
      if (!oldData) return NextResponse.json({ success: false, error: '页面不存在' }, { status: 404 });

      const allowed = ['page_key', 'name_zh', 'route_path', 'layout_template', 'is_enabled', 'config', 'module_id'];
      const updateData: Record<string, any> = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }

      const { data, error } = await db.from('system_pages').update(updateData).eq('id', id).select().single();
      if (error) {
        if (error.message?.includes('unique')) {
          return NextResponse.json({ success: false, error: `page_key "${body.page_key}" 已存在` }, { status: 409 });
        }
        return NextResponse.json({ success: false, error: error.message }, { status: 500 });
      }

      await logConfigChange({ adminId: getAdminId(request, user), targetType: 'page', targetId: id, oldValue: oldData, newValue: data, description: body.description || `更新页面: ${oldData.name_zh}` });

      return NextResponse.json({ success: true, message: '页面更新成功', data });
    } catch (error) {
      console.error('[PageAPI] PUT 失败:', error);
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

      const { data: oldData } = await db.from('system_pages').select('*').eq('id', id).single();
      if (!oldData) return NextResponse.json({ success: false, error: '页面不存在' }, { status: 404 });

      const { error } = await db.from('system_pages').delete().eq('id', id);
      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

      await logConfigChange({ adminId: getAdminId(request, user), targetType: 'page', targetId: id, oldValue: oldData, description: `删除页面: ${oldData.name_zh}` });

      return NextResponse.json({ success: true, message: '页面已删除' });
    } catch (error) {
      console.error('[PageAPI] DELETE 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
