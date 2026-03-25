/**
 * 操作按钮配置查询
 * GET /api/admin/config/query/actions?page_key=xxx&position=xxx
 *
 * position 可选值: toolbar, row_action, batch_action
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const page_key = request.nextUrl.searchParams.get('page_key');
    const position = request.nextUrl.searchParams.get('position');

    if (!page_key) {
      return NextResponse.json({ success: false, error: '缺少 page_key 参数' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 通过 page_key 查找 page_id
    const { data: page, error: pageErr } = await db
      .from('system_pages')
      .select('id')
      .eq('page_key', page_key)
      .eq('is_enabled', true)
      .single();

    if (pageErr || !page) {
      return NextResponse.json({ success: false, error: '页面不存在' }, { status: 404 });
    }

    let query = db
      .from('system_actions')
      .select('id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config')
      .eq('page_id', page.id)
      .eq('is_visible', true);

    if (position) {
      // position 存储在 config JSONB 中，需要用 @> 操作符或客户端过滤
      const { data: allActions, error: actErr } = await query.order('sort_order', { ascending: true });
      if (actErr) return NextResponse.json({ success: false, error: actErr.message }, { status: 500 });

      // 客户端按 config.position 过滤
      const filtered = (allActions || []).filter((a: any) => {
        try {
          return a.config?.position === position;
        } catch {
          return false;
        }
      });

      return NextResponse.json({ success: true, data: filtered });
    }

    const { data, error } = await query.order('sort_order', { ascending: true });
    if (error) return NextResponse.json({ success: false, error: error.message }, { status: 500 });

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[QueryActionsAPI] 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
