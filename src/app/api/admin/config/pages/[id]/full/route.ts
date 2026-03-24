/**
 * 页面完整配置（含字段+按钮）
 * GET /api/admin/config/pages/[id]/full
 * 前端动态渲染页面时调用，一次获取全部配置
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

      // 并行查询页面信息、字段、按钮
      const [pageRes, fieldsRes, actionsRes] = await Promise.all([
        db.from('system_pages').select('*, module:system_modules(id, module_code, module_name, icon, path)').eq('id', id).single(),
        db.from('system_fields').select('*').eq('page_id', id).order('sort_order', { ascending: true }),
        db.from('system_actions').select('*').eq('page_id', id).order('sort_order', { ascending: true }),
      ]);

      if (pageRes.error || !pageRes.data) {
        return NextResponse.json({ success: false, error: '页面不存在' }, { status: 404 });
      }

      // 按分组聚合字段
      const fields = fieldsRes.data || [];
      const fieldGroups: Record<string, any[]> = {};
      for (const f of fields) {
        const group = f.group_name || '__default__';
        if (!fieldGroups[group]) fieldGroups[group] = [];
        fieldGroups[group].push(f);
      }

      return NextResponse.json({
        success: true,
        data: {
          page: pageRes.data,
          fields,
          fieldGroups,
          actions: actionsRes.data || [],
        },
      });
    } catch (error) {
      console.error('[PageFullAPI] 失败:', error);
      return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
    }
  }
);
