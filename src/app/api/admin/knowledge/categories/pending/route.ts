import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * GET /api/admin/knowledge/categories/pending
 * 获取待审核分类列表（超管/admin）
 */
export async function GET(request: NextRequest) {
  try {
    const auth = await resolveAuthContext(request);
    if (!['super_admin', 'admin'].includes(auth.effectiveRole)) {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('knowledge_categories')
      .select('id, type, name, name_en, icon, metadata_key, sort_order, is_default, created_by, status, created_at, reject_reason')
      .eq('status', 'pending')
      .order('created_at', { ascending: false });

    if (error) {
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
