import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

// system_modules -> 旧字段映射（兼容 LevelEditor 等旧组件）
const mapToFront = (row: Record<string, any>) => ({
  id: row.id,
  module_code: row.module_key,
  module_name: row.name_zh,
  description: row.description || '',
  is_active: row.is_enabled,
});

const mapToDb = (body: Record<string, any>) => {
  const mapped: Record<string, any> = { updated_at: new Date().toISOString() };
  if (body.module_code) mapped.module_key = body.module_code;
  if (body.module_name) mapped.name_zh = body.module_name;
  if (body.description !== undefined) mapped.description = body.description;
  if (body.is_active !== undefined) mapped.is_enabled = body.is_active;
  return mapped;
};

/**
 * GET: 获取功能模块列表
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('system_modules')
      .select('id, module_key, name_zh, description, is_enabled, config')
      .eq('config->>type', 'feature')
      .order('sort_order');

    if (error) {
      console.error('[Modules API] 查询失败:', error.message);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: (data || []).map(mapToFront) });
  } catch {
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
}

/**
 * POST: 创建功能模块
 */
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const { module_code, module_name } = body;

    if (!module_code || !module_name) {
      return NextResponse.json({ success: false, error: '模块代码和名称不能为空' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();

    const { data, error } = await db
      .from('system_modules')
      .insert({
        module_key: module_code,
        name_zh: module_name,
        description: body.description || '',
        is_enabled: body.is_active !== false,
        is_visible_in_menu: false,
        config: { type: 'feature' },
      })
      .select()
      .single();

    if (error) {
      if (error.message?.includes('duplicate') || error.message?.includes('unique')) {
        return NextResponse.json({ success: false, error: '模块代码已存在' }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '模块创建成功', data: mapToFront(data) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: '创建失败' }, { status: 500 });
  }
}

/**
 * PUT: 更新模块
 */
export async function PUT(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ success: false, error: '缺少模块ID' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const updateData = mapToDb(body);

    const { data, error } = await db
      .from('system_modules')
      .update(updateData)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '更新成功', data: mapToFront(data) });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: '更新失败' }, { status: 500 });
  }
}

/**
 * DELETE: 删除模块
 */
export async function DELETE(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ success: false, error: '缺少模块ID' }, { status: 400 });
    }

    const db = getSupabaseServiceClient();
    const { error } = await db.from('system_modules').delete().eq('id', id);

    if (error) {
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, message: '已删除' });
  } catch (error: any) {
    return NextResponse.json({ success: false, error: '删除失败' }, { status: 500 });
  }
}
