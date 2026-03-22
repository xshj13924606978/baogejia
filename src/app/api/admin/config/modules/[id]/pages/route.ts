/**
 * 模块下的页面列表
 * GET /api/admin/config/modules/[id]/pages - 获取指定模块的页面（可选含字段和按钮）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withPermissionCheckWithParams } from '@/lib/permission-check';

export const GET = withPermissionCheckWithParams(
  { roles: ['super_admin', 'admin'] },
  async (request: NextRequest, params: any) => {
    try {
      const { id } = await params;
      const sp = request.nextUrl.searchParams;
      const withFields = sp.get('fields') === 'true';
      const withActions = sp.get('actions') === 'true';

      const db = getSupabaseServiceClient();

      const { data: moduleData, error: modErr } = await db.from('system_modules').select('id, module_key, name_zh').eq('id', id).single();
      if (modErr || !moduleData) {
        return NextResponse.json({ success: false, error: '模块不存在' }, { status: 404 });
      }

      const { data: pages, error } = await db
        .from('system_pages')
        .select('*')
        .eq('module_id', id)
        .order('sort_order', { ascending: true });

      if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

      let result = pages || [];

      if (withFields || withActions) {
        result = await Promise.all(
          (pages || []).map(async (page: any) => {
            const p: any = { ...page };
            if (withFields) {
              const { data: fields } = await db.from('system_fields').select('*').eq('page_id', page.id).order('sort_order', { ascending: true });
              p.fields = fields || [];
            }
            if (withActions) {
              const { data: actions } = await db.from('system_actions').select('*').eq('page_id', page.id).order('sort_order', { ascending: true });
              p.actions = actions || [];
            }
            return p;
          })
        );
      }

      return NextResponse.json({ success: true, data: { module: moduleData, pages: result } });
    } catch (error) {
      console.error('[ModulePagesAPI] 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
