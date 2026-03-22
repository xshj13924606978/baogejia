/**
 * 菜单配置接口 - 页面完整配置详情
 * GET /api/admin/menu/pages/[id]
 *
 * 返回指定页面的完整配置，包含所属模块信息、字段列表、操作按钮列表。
 * 前端可据此动态渲染表单、列表、按钮等。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withPermissionCheckWithParams } from '@/lib/permission-check';

export const GET = withPermissionCheckWithParams(
  { roles: ['super_admin', 'admin'] },
  async (request: NextRequest, params: any) => {
    try {
      const { id } = await params;
      const db = getSupabaseServiceClient();
      const { searchParams } = new URL(request.url);
      const includeFields = searchParams.get('fields') !== 'false';  // 默认包含
      const includeActions = searchParams.get('actions') !== 'false'; // 默认包含

      // 1. 查询页面信息及所属模块
      const { data: page, error: pageError } = await db
        .from('system_pages')
        .select(`
          *,
          module:system_modules (
            id, module_code, module_name, module_name_en, icon, path
          )
        `)
        .eq('id', id)
        .single();

      if (pageError || !page) {
        return NextResponse.json(
          { success: false, error: `页面 ID ${id} 不存在` },
          { status: 404 }
        );
      }

      const result: any = {
        id: page.id,
        page_code: page.page_code,
        page_name: page.page_name,
        page_name_en: page.page_name_en,
        path: page.path,
        page_type: page.page_type,
        description: page.description,
        sort_order: page.sort_order,
        permission_code: page.permission_code,
        layout_config: page.layout_config,
        module: page.module,
      };

      // 2. 并行查询字段和按钮
      const [fieldsResult, actionsResult] = await Promise.all([
        includeFields
          ? db
              .from('system_fields')
              .select('*')
              .eq('page_id', id)
              .eq('is_active', true)
              .order('sort_order', { ascending: true })
          : Promise.resolve(null),
        includeActions
          ? db
              .from('system_actions')
              .select('*')
              .eq('page_id', id)
              .eq('is_active', true)
              .order('sort_order', { ascending: true })
          : Promise.resolve(null),
      ]);

      result.fields = fieldsResult?.data || [];
      result.actions = actionsResult?.data || [];

      return NextResponse.json({ success: true, data: result });
    } catch (error) {
      console.error('[MenuAPI] 获取页面配置失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
