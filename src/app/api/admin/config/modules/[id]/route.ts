/**
 * 模块配置 CRUD - 详情路由
 * GET    /api/admin/config/modules/[id] - 获取模块详情
 * PUT    /api/admin/config/modules/[id] - 更新模块
 * DELETE /api/admin/config/modules/[id] - 删除模块（级联删除页面/字段/按钮）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { logConfigChange, getAdminId } from '@/lib/config-change-log';
import { safeErrorMessage } from '@/lib/error-handler';

export const GET = withPermissionCheckWithParams(
  { roles: ['super_admin', 'admin'] },
  async (request: NextRequest, params: any, user: any) => {
    try {
      const { id } = await params;
      const db = getSupabaseServiceClient();

      const { data, error } = await db
        .from('system_modules')
        .select('*, parent:system_modules!parent_module_id(id, module_key, name_zh)')
        .eq('id', id)
        .single();

      if (error || !data) {
        return NextResponse.json({ success: false, error: '模块不存在' }, { status: 404 });
      }

      return NextResponse.json({ success: true, data });
    } catch (error) {
      console.error('[ModuleAPI] GET detail 失败:', error);
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

      // 读取旧值用于日志
      const { data: oldData } = await db.from('system_modules').select('*').eq('id', id).single();
      if (!oldData) {
        return NextResponse.json({ success: false, error: '模块不存在' }, { status: 404 });
      }

      const allowed = ['module_key', 'name_zh', 'name_en', 'icon', 'sort_order', 'is_enabled', 'route_path', 'description', 'permission_code', 'group_label', 'is_visible_in_menu'];
      const updateData: Record<string, any> = {};
      for (const key of allowed) {
        if (body[key] !== undefined) updateData[key] = body[key];
      }

      if (Object.keys(updateData).length === 0) {
        return NextResponse.json({ success: false, error: '没有需要更新的字段' }, { status: 400 });
      }

      const { data, error } = await db.from('system_modules').update(updateData).eq('id', id).select().single();

      if (error) {
        console.error('[ModuleAPI] PUT 更新失败:', error);
        if (error.message?.includes('unique') || error.message?.includes('duplicate')) {
          return NextResponse.json({ success: false, error: `module_key "${body.module_key}" 已被占用` }, { status: 409 });
        }
        return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
      }

      await logConfigChange({
        adminId: getAdminId(request, user),
        targetType: 'module',
        targetId: id,
        oldValue: oldData,
        newValue: data,
        description: body.description || `更新模块: ${oldData.name_zh}`,
      });

      return NextResponse.json({ success: true, message: '模块更新成功', data });
    } catch (error) {
      console.error('[ModuleAPI] PUT 失败:', error);
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

      const { data: oldData } = await db.from('system_modules').select('*').eq('id', id).single();
      if (!oldData) {
        return NextResponse.json({ success: false, error: '模块不存在' }, { status: 404 });
      }

      // 检查是否有子模块
      const { count: childCount } = await db.from('system_modules').select('*', { count: 'exact', head: true }).eq('parent_module_id', id);
      if (childCount && childCount > 0) {
        return NextResponse.json({ success: false, error: `该模块下有 ${childCount} 个子模块，请先删除或移动子模块` }, { status: 400 });
      }

      const { error } = await db.from('system_modules').delete().eq('id', id);
      if (error) return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });

      await logConfigChange({ adminId: getAdminId(request, user), targetType: 'module', targetId: id, oldValue: oldData, description: `删除模块: ${oldData.name_zh}` });

      return NextResponse.json({ success: true, message: '模块已删除（级联删除了关联页面、字段和按钮）' });
    } catch (error) {
      console.error('[ModuleAPI] DELETE 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
