import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';

/**
 * GET /api/admin/knowledge/categories-list?type=document&status=pending
 * 获取所有分类（管理端，超管/admin）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuthContext(request);
    if (!['super_admin', 'admin'].includes(auth.effectiveRole)) {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');
    const status = searchParams.get('status');

    const supabase = await getSupabaseClient();
    let query = supabase
      .from('knowledge_categories')
      .select('id, type, name, name_en, icon, metadata_key, sort_order, is_default, is_active, created_by, status, reject_reason, created_at, updated_at')
      .order('type')
      .order('sort_order');

    if (type) query = query.eq('type', type);
    if (status) query = query.eq('status', status);

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
