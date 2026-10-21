/**
 * 用户菜单分组 CRUD - 详情路由
 * GET    /api/admin/config/user-menus/[id] - 获取分组详情
 * PUT    /api/admin/config/user-menus/[id] - 更新分组
 * DELETE /api/admin/config/user-menus/[id] - 删除分组（级联删除）
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
      const { data, error } = await db.from('user_menus').select('*').eq('id', id).single();
      if (error || !data) {
        return NextResponse.json({ success: false, error: '菜单分组不存在' }, { status: 404 });
      }
      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[UserMenuAPI] GET detail 失败:', error);
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

      const { data: oldData } = await db.from('user_menus').select('*').eq('id', id).single();
      if (!oldData) {
        return NextResponse.json({ success: false, error: '菜单分组不存在' }, { status: 404 });
      }

      const allowed = ['menu_key', 'name_zh', 'name_en', 'icon', 'sort_order', 'is_enabled', 'is_visible', 'description', 'permission_code', 'config'];
      const updateData: Record<string, any> = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ success: false, error: '没有需要更新的字段' }, { status: 400 });
      }

      const { data, error } = await db.from('user_menus').update(updateData).eq('id', id).select().single();
      if (error) {
        if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
          return NextResponse.json({ success: false, error: `menu_key "${body.menu_key}" 已被占用` }, { status: 409 });
        }
        return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
      }

      await logConfigChange({
        adminId: getAdminId(request, user),
        targetType: 'user_menu',
        targetId: id,
        oldValue: oldData,
        newValue: data,
        description: body.description || `更新用户菜单分组: ${oldData.name_zh}`,
      });

      return NextResponse.json({ success: true, message: '菜单分组更新成功', data });
    } catch (error) {
      console.error('[UserMenuAPI] PUT 失败:', error);
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

      const { data: oldData } = await db.from('user_menus').select('*').eq('id', id).single();
      if (!oldData) {
        return NextResponse.json({ success: false, error: '菜单分组不存在' }, { status: 404 });
      }

      const { error } = await db.from('user_menus').delete().eq('id', id);
      if (error) return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });

      await logConfigChange({ adminId: getAdminId(request, user), targetType: 'user_menu', targetId: id, oldValue: oldData, description: `删除用户菜单分组: ${oldData.name_zh}` });

      return NextResponse.json({ success: true, message: '菜单分组已删除（级联删除了关联的菜单项、字段和按钮）' });
    } catch (error) {
      console.error('[UserMenuAPI] DELETE 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
