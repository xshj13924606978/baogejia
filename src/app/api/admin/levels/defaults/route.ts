import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * /api/admin/levels/defaults —— 获取系统默认等级配置
 *
 * 鉴权 0 硬编码：requireAdmin() 数据库驱动
 * 数据完全数据库驱动：SELECT * FROM level_definitions ORDER BY level；
 * 若 DB 无配置才返回 404 列表空，前端可从 member-levels 兜底；不存硬编码 fake data
 */
export async function GET(request: NextRequest) {
  try {
    const { errorResponse } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseClient();
    const { data: defaultConfigs, error } = await supabase
      .from('level_definitions')
      .select('*')
      .order('level');

    if (error) {
      console.error('[Defaults API] 查询 level_definitions 失败:', error);
      return NextResponse.json(
        { success: false, error: safeErrorMessage(error) },
        { status: 500 }
      );
    }

    return NextResponse.json({ success: true, data: defaultConfigs || [] });
  } catch (error) {
    console.error('[Defaults API] 获取默认配置失败:', error);
    return NextResponse.json({ success: false, error: '获取默认配置失败' }, { status: 500 });
  }
}
