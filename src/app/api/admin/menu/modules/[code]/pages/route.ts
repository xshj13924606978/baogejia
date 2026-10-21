/**
 * 菜单配置接口 - 模块下的页面列表
 * GET /api/admin/menu/modules/[code]/pages
 *
 * 返回指定模块下的所有页面，可选携带字段和按钮配置。
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withPermissionCheckWithParams } from '@/lib/permission-check';

export const GET = withPermissionCheckWithParams(
  { roles: ['super_admin', 'admin'] },
  async (request: NextRequest, params: any) => {
    try {
      const { code } = await params;
      const db = getSupabaseServiceClient();
      const { searchParams } = new URL(request.url);
      const includeFields = searchParams.get('fields') === 'true';
      const includeActions = searchParams.get('actions') === 'true';
      const includeInactive = searchParams.get('includeInactive') === 'true';

      // 1. 查询模块信息
      const { data: moduleData, error: moduleError } = await db
        .from('system_modules')
        .select('*')
        .eq('module_code', code)
        .single();

      if (moduleError || !moduleData) {
        return NextResponse.json(
          { success: false, error: `模块 "${code}" 不存在` },
          { status: 404 }
        );
      }

      // 2. 查询模块下的页面
      let pageQuery = db
        .from('system_pages')
        .select('*')
        .eq('module_id', moduleData.id)
        .order('sort_order', { ascending: true });

      if (!includeInactive) {
        pageQuery = pageQuery.eq('is_active', true);
      }

      const { data: pages, error: pageError } = await pageQuery;

      if (pageError) {
        console.error('[MenuAPI] 查询页面失败:', pageError.message);
        return NextResponse.json(
          { success: false, error: '查询页面失败', details: pageError.message },
          { status: 500 }
        );
      }

      if (!pages || pages.length === 0) {
        return NextResponse.json({
          success: true,
          data: {
            module: {
              id: moduleData.id,
              module_code: moduleData.module_code,
              module_name: moduleData.module_name,
              module_name_en: moduleData.module_name_en,
              icon: moduleData.icon,
              path: moduleData.path,
              description: moduleData.description,
            },
            pages: [],
          },
        });
      }

      // 3. 可选：查询每个页面的字段和按钮
      const pagesWithConfig = await Promise.all(
        pages.map(async (page) => {
          const pageResult: any = {
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
          };

          if (includeFields) {
            let fieldQuery = db
              .from('system_fields')
              .select('*')
              .eq('page_id', page.id)
              .order('sort_order', { ascending: true });

            if (!includeInactive) {
              fieldQuery = fieldQuery.eq('is_active', true);
            }

            const { data: fields } = await fieldQuery;
            pageResult.fields = fields || [];
          }

          if (includeActions) {
            let actionQuery = db
              .from('system_actions')
              .select('*')
              .eq('page_id', page.id)
              .order('sort_order', { ascending: true });

            if (!includeInactive) {
              actionQuery = actionQuery.eq('is_active', true);
            }

            const { data: actions } = await actionQuery;
            pageResult.actions = actions || [];
          }

          return pageResult;
        })
      );

      return NextResponse.json({
        success: true,
        data: {
          module: {
            id: moduleData.id,
            module_code: moduleData.module_code,
            module_name: moduleData.module_name,
            module_name_en: moduleData.module_name_en,
            icon: moduleData.icon,
            path: moduleData.path,
            description: moduleData.description,
          },
          pages: pagesWithConfig,
        },
      });
    } catch (error) {
      console.error('[MenuAPI] 获取模块页面失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
