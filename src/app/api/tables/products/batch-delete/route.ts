import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { isUserAdminRole } from '@/lib/admin-role-helper';
import { safeErrorMessage } from '@/lib/error-handler';

// 批量删除产品（仅管理员，DB 角色集驱动 + fallback，不再硬编码 ['super_admin','admin']）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { ids } = body;

    // 仅管理员可删除
    let ctx = null;
    try {
      ctx = await resolveAuthContext(request);
    } catch { /* ignore */ }
    if (!ctx?.isAuthenticated) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }
    if (!isUserAdminRole(ctx.effectiveRole || '')) {
      return NextResponse.json({ success: false, error: '仅管理员可删除产品' }, { status: 403 });
    }

    if (!Array.isArray(ids) || ids.length === 0) {
      return NextResponse.json(
        {
          success: false,
          error: '产品ID列表不能为空',
        },
        { status: 400 }
      );
    }

    const db = getSupabaseClient();

    // 批量删除产品
    const { error } = await db.from('products').delete().in('id', ids);

    if (error) {
      console.error('批量删除产品失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: safeErrorMessage(error),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: `成功删除 ${ids.length} 条产品数据`,
      deletedCount: ids.length,
    });
  } catch (error) {
    console.error('批量删除产品失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '批量删除产品失败',
      },
      { status: 500 }
    );
  }
}
