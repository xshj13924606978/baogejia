/**
 * 字段配置查询
 * GET /api/admin/config/query/fields?page_key=xxx&group=xxx
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';
import { safeErrorMessage } from '@/lib/error-handler';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const page_key = request.nextUrl.searchParams.get('page_key');
    const group = request.nextUrl.searchParams.get('group');
    const visible_only = request.nextUrl.searchParams.get('visible') !== 'false';

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
      .from('system_fields')
      .select('id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config, validation_rules, depends_on')
      .eq('page_id', page.id);

    if (visible_only) query = query.eq('is_visible', true);
    if (group) query = query.eq('group_name', group);

    const { data, error } = await query.order('sort_order', { ascending: true });

    if (error) return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[QueryFieldsAPI] 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
