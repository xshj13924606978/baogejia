export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

/**
 * GET - 获取角色列表（用于管理后台选择器）
 * 仅返回 is_active = true 的角色，按 level_priority 降序排列
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('roles')
      .select('code, name_zh, name_en, is_admin, is_super_admin, level_priority, description')
      .eq('is_active', true)
      .order('level_priority', { ascending: false });

    if (error) {
      console.error('[Roles API] 查询角色失败:', error);
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: (data || []).map((r) => ({
        code: r.code,
        name: r.name_zh,
        nameEn: r.name_en,
        isAdmin: r.is_admin,
        isSuperAdmin: r.is_super_admin,
        priority: r.level_priority,
        description: r.description,
      })),
    });
  } catch (error: any) {
    console.error('[Roles API] 异常:', error);
    return NextResponse.json(
      { success: false, error: safeErrorMessage(error, '获取角色列表失败') },
      { status: 500 },
    );
  }
}
