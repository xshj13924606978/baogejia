/**
 * 配置变更日志 - 只读查询
 * GET /api/admin/config/logs - 查询变更历史（支持筛选）
 */

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { withAdmin } from '@/lib/permission-check';
import { safeErrorMessage } from '@/lib/error-handler';

export const GET = withAdmin(async (request: NextRequest) => {
  try {
    const sp = request.nextUrl.searchParams;
    const target_type = sp.get('target_type') || '';  // module, page, field, action
    const target_id = sp.get('target_id') || '';
    const admin_id = sp.get('admin_id') || '';
    const page = parseInt(sp.get('page') || '1');
    const limit = parseInt(sp.get('limit') || '50');

    const db = getSupabaseServiceClient();
    let query = db.from('v_config_change_history').select('*', { count: 'exact' });

    if (target_type) query = query.eq('target_type', target_type);
    if (target_id) query = query.eq('target_id', target_id);
    if (admin_id) query = query.eq('admin_id', admin_id);

    const offset = (page - 1) * limit;
    const { data, error, count } = await query.range(offset, offset + limit - 1);

    if (error) return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    return NextResponse.json({ success: true, data: data || [], total: count || 0, page, limit });
  } catch (error) {
    console.error('[ConfigLogAPI] 失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误' }, { status: 500 });
  }
});
