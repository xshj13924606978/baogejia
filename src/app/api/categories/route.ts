import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAuth } from '@/lib/auth-utils';

// GET /api/categories - 获取所有采集类别
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);
    const enabled = searchParams.get('enabled');

    let query = supabase.from('collection_categories').select('*').order('created_at', { ascending: false });

    if (enabled === 'true') {
      query = query.eq('enabled', true);
    } else if (enabled === 'false') {
      query = query.eq('enabled', false);
    }

    const { data, error } = await query;

    if (error) {
      console.error('[Categories API] 查询失败:', error);
      return NextResponse.json({ error: 'Failed to fetch categories' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (error) {
    console.error('[Categories API] 服务器错误:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/categories - 新增采集类别
export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const supabase = getSupabaseServiceClient();
    const body = await request.json();

    if (!body.name || !body.keywords || body.keywords.length === 0) {
      return NextResponse.json({ error: '类别名称和关键词不能为空' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('collection_categories')
      .insert({
        name: body.name,
        keywords: body.keywords,
        enabled: body.enabled !== undefined ? body.enabled : true,
      })
      .select()
      .single();

    if (error) {
      console.error('[Categories API] 创建失败:', error);
      if (error.code === '23505') {
        return NextResponse.json({ error: '类别名称已存在' }, { status: 409 });
      }
      return NextResponse.json({ error: 'Failed to create category' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Categories API] 服务器错误:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/categories - 更新采集类别
export async function PUT(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const supabase = getSupabaseServiceClient();
    const body = await request.json();

    if (!body.id) {
      return NextResponse.json({ error: '类别ID不能为空' }, { status: 400 });
    }

    const updateData: Record<string, any> = { updated_at: new Date().toISOString() };
    if (body.name !== undefined) updateData.name = body.name;
    if (body.keywords !== undefined) updateData.keywords = body.keywords;
    if (body.enabled !== undefined) updateData.enabled = body.enabled;

    const { data, error } = await supabase
      .from('collection_categories')
      .update(updateData)
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      console.error('[Categories API] 更新失败:', error);
      return NextResponse.json({ error: 'Failed to update category' }, { status: 500 });
    }

    return NextResponse.json({ success: true, data });
  } catch (error) {
    console.error('[Categories API] 服务器错误:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/categories - 删除采集类别
export async function DELETE(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const supabase = getSupabaseServiceClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: '类别ID不能为空' }, { status: 400 });
    }

    const { error } = await supabase.from('collection_categories').delete().eq('id', id);

    if (error) {
      console.error('[Categories API] 删除失败:', error);
      return NextResponse.json({ error: 'Failed to delete category' }, { status: 500 });
    }

    return NextResponse.json({ success: true });
  } catch (error) {
    console.error('[Categories API] 服务器错误:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
