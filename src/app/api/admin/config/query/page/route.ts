/**
 * 页面完整配置查询
 * GET /api/admin/config/query/page?page_key=product_list
 *
 * 前端动态渲染页面时调用，一次获取页面基本信息 + 字段列表 + 按钮列表
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const page_key = request.nextUrl.searchParams.get('page_key');
    if (!page_key) {
      return NextResponse.json({ success: false, error: '缺少 page_key 参数' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    // 查询页面 + 关联模块
    const { data: page, error: pageErr } = await db
      .from('system_pages')
      .select('id, page_key, name_zh, route_path, layout_template, module_id, is_enabled, config')
      .eq('page_key', page_key)
      .eq('is_enabled', true)
      .single();

    if (pageErr || !page) {
      return NextResponse.json({ success: false, error: '页面不存在或未启用' }, { status: 404 });
    }

    // 查询模块信息
    const { data: module } = await db
      .from('system_modules')
      .select('id, module_key, name_zh, icon, route_path')
      .eq('id', page.module_id)
      .single();

    // 并行查询字段和按钮
    const [fieldsRes, actionsRes] = await Promise.all([
      db.from('system_fields')
        .select('id, field_key, field_type, label_zh, is_visible, is_editable, is_required, group_name, sort_order, config, validation_rules, depends_on, options_config')
        .eq('page_id', page.id)
        .order('sort_order', { ascending: true }),
      db.from('system_actions')
        .select('id, action_key, name_zh, api_endpoint, http_method, is_visible, permission_required, sort_order, config')
        .eq('page_id', page.id)
        .eq('is_visible', true)
        .order('sort_order', { ascending: true }),
    ]);

    // 按 group_name 聚合字段
    const fieldGroups: Record<string, any[]> = {};
    for (const f of fieldsRes.data || []) {
      const group = f.group_name || '__default__';
      if (!fieldGroups[group]) fieldGroups[group] = [];
      fieldGroups[group].push(f);
    }

    return NextResponse.json({
      success: true,
      data: {
        page,
        module: module || null,
        fields: fieldsRes.data || [],
        field_groups: fieldGroups,
        actions: actionsRes.data || [],
      },
    });
  } catch (error) {
    console.error('[QueryPageAPI] 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
