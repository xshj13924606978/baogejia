import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { safeErrorMessage } from '@/lib/error-handler';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * GET /api/admin/knowledge/categories/:id
 * 获取单个分类详情
 */
export async function GET(_request: NextRequest, context: RouteContext) {
  try {
    const auth = await resolveAuthContext(_request);
    if (!['super_admin', 'admin'].includes(auth.effectiveRole)) {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    const { id } = await context.params;
    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('knowledge_categories')
      .select('*')
      .eq('id', id)
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: '分类不存在' }, { status: 404 });
    }

    return NextResponse.json({ success: true, data });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/**
 * PUT /api/admin/knowledge/categories/:id
 * 编辑分类（超管/admin）
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await resolveAuthContext(request);
    if (!['super_admin', 'admin'].includes(auth.effectiveRole)) {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { name, name_en, icon, sort_order, is_active } = body;

    const supabase = await getSupabaseClient();
    const updates: Record<string, any> = { updated_at: new Date().toISOString() };
    if (name !== undefined) updates.name = name;
    if (name_en !== undefined) updates.name_en = name_en;
    if (icon !== undefined) updates.icon = icon;
    if (sort_order !== undefined) updates.sort_order = sort_order;
    if (is_active !== undefined) updates.is_active = is_active;

    const { data, error } = await supabase
      .from('knowledge_categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error || !data) {
      return NextResponse.json({ success: false, error: safeErrorMessage(error, '更新失败') }, { status: 500 });
    }

    return NextResponse.json({ success: true, data, message: '更新成功' });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/**
 * DELETE /api/admin/knowledge/categories/:id
 * 删除分类（超管，is_default 不可删除）
 */
export async function DELETE(request: NextRequest, context: RouteContext) {
  try {
    const auth = await resolveAuthContext(request);
    if (!['super_admin', 'admin'].includes(auth.effectiveRole)) {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    // 只有超管可删除
    if (auth.effectiveRole !== 'super_admin') {
      return NextResponse.json({ success: false, error: '仅超管可删除分类' }, { status: 403 });
    }

    const { id } = await context.params;
    const supabase = await getSupabaseClient();

    // 检查是否为默认分类
    const { data: cat } = await supabase
      .from('knowledge_categories')
      .select('id, is_default, name')
      .eq('id', id)
      .single();

    if (!cat) {
      return NextResponse.json({ success: false, error: '分类不存在' }, { status: 404 });
    }

    if (cat.is_default) {
      return NextResponse.json({ success: false, error: `系统默认分类"${cat.name}"不可删除` }, { status: 400 });
    }

    const { error } = await supabase.from('knowledge_categories').delete().eq('id', id);
    if (error) {
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '删除成功' });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
