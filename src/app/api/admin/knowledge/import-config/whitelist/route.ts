import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { getServiceSupabase } from '@/lib/supabase-client';

/**
 * 导入来源白名单管理 API
 *
 * 支持批量新增 / 批量启用禁用 / 批量删除 / 分页查询
 */

interface WhitelistItem {
  id?: string;
  source_type: 'wechat' | 'email';
  source_value: string;
  remark?: string | null;
  is_active?: boolean;
}

function normalizeSource(value: string): string {
  return value.replace(/\s+/g, ' ').trim();
}

export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  const { searchParams } = new URL(request.url);
  const sourceType = searchParams.get('source_type');
  const keyword = searchParams.get('keyword')?.trim() || '';
  const activeOnly = searchParams.get('active_only') === 'true';
  const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10));
  const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('page_size') || '50', 10)));

  try {
    const supabase = await getServiceSupabase();
    let query = supabase
      .from('knowledge_import_whitelist')
      .select('*', { count: 'exact' })
      .order('created_at', { ascending: false })
      .range((page - 1) * pageSize, page * pageSize - 1);

    if (sourceType === 'wechat' || sourceType === 'email') {
      query = query.eq('source_type', sourceType);
    }
    if (activeOnly) {
      query = query.eq('is_active', true);
    }
    if (keyword) {
      query = query.or(`source_value.ilike.%${keyword}%,remark.ilike.%${keyword}%`);
    }

    const { data, error, count } = await query;
    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        page_size: pageSize,
        total: count || 0,
        total_pages: Math.ceil((count || 0) / pageSize),
      },
    });
  } catch (error) {
    console.error('[Import Whitelist] 查询失败:', error);
    return NextResponse.json({ success: false, error: '查询白名单失败' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const rawItems: WhitelistItem[] = Array.isArray(body?.items) ? body.items : [];

    if (rawItems.length === 0) {
      return NextResponse.json({ success: false, error: '缺少新增项' }, { status: 400 });
    }
    if (rawItems.length > 100) {
      return NextResponse.json({ success: false, error: '单次最多添加 100 条' }, { status: 400 });
    }

    // 拆分多行来源值，支持 textarea 批量粘贴
    const normalized: WhitelistItem[] = [];
    for (const item of rawItems) {
      const sourceType = item.source_type === 'email' ? 'email' : 'wechat';
      const rawValue = typeof item.source_value === 'string' ? item.source_value : '';
      const values = rawValue
        .split(/\r?\n/)
        .map(normalizeSource)
        .filter(Boolean);

      for (const value of values) {
        normalized.push({
          source_type: sourceType,
          source_value: value,
          remark: typeof item.remark === 'string' && item.remark.trim() ? item.remark.trim() : null,
          is_active: item.is_active !== false,
        });
      }
    }

    if (normalized.length === 0) {
      return NextResponse.json({ success: false, error: '没有有效的来源值' }, { status: 400 });
    }

    const supabase = await getServiceSupabase();
    const { data, error } = await supabase
      .from('knowledge_import_whitelist')
      .upsert(normalized, { onConflict: 'source_type,source_value', ignoreDuplicates: true })
      .select();

    if (error) throw error;

    return NextResponse.json({
      success: true,
      data: data || [],
      message: `成功添加 ${(data || []).length} 条白名单`,
    });
  } catch (error) {
    console.error('[Import Whitelist] 新增失败:', error);
    return NextResponse.json({ success: false, error: '添加白名单失败' }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];
    const isActive = Boolean(body?.is_active);

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: '缺少目标 ID' }, { status: 400 });
    }
    if (ids.length > 200) {
      return NextResponse.json({ success: false, error: '单次最多更新 200 条' }, { status: 400 });
    }

    const supabase = await getServiceSupabase();
    const { error, count } = await supabase
      .from('knowledge_import_whitelist')
      .update({ is_active: isActive })
      .in('id', ids);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `已${isActive ? '启用' : '禁用'} ${count || ids.length} 条白名单`,
      affected: count || ids.length,
    });
  } catch (error) {
    console.error('[Import Whitelist] 更新失败:', error);
    return NextResponse.json({ success: false, error: '更新白名单失败' }, { status: 500 });
  }
}

export async function DELETE(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const ids: string[] = Array.isArray(body?.ids) ? body.ids : [];

    if (ids.length === 0) {
      return NextResponse.json({ success: false, error: '缺少目标 ID' }, { status: 400 });
    }
    if (ids.length > 200) {
      return NextResponse.json({ success: false, error: '单次最多删除 200 条' }, { status: 400 });
    }

    const supabase = await getServiceSupabase();
    const { error, count } = await supabase.from('knowledge_import_whitelist').delete().in('id', ids);

    if (error) throw error;

    return NextResponse.json({
      success: true,
      message: `已删除 ${count || ids.length} 条白名单`,
      affected: count || ids.length,
    });
  } catch (error) {
    console.error('[Import Whitelist] 删除失败:', error);
    return NextResponse.json({ success: false, error: '删除白名单失败' }, { status: 500 });
  }
}
