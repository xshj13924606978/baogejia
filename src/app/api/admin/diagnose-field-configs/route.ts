import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * POST /api/admin/diagnose-field-configs
 * 诊断 product_field_configs 表结构及判重配置数据是否健康。
 * 被「产品管理 → 判重配置」页面调用，不得返回虚假状态。
 */
export async function POST(request: NextRequest) {
  const { errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  const db = getSupabaseServiceClient();

  try {
    // 1. 检查表是否存在且有数据
    const { data: rows, error: countErr } = await db
      .from('product_field_configs')
      .select('id, field_key, is_duplicate_check', { count: 'exact', head: false })
      .limit(1);

    if (countErr) {
      // 表不存在或无法访问
      if (countErr.message?.includes('does not exist') || countErr.code === '42P01') {
        return NextResponse.json({
          success: false,
          status: 'needs_rebuild',
          error: 'product_field_configs 表不存在，需要执行数据库迁移。',
        });
      }
      return NextResponse.json({ success: false, error: countErr.message }, { status: 500 });
    }

    if (!rows || rows.length === 0) {
      return NextResponse.json({
        success: false,
        status: 'needs_data',
        error: 'product_field_configs 表为空，请先初始化产品字段配置。',
      });
    }

    // 2. 检查 is_duplicate_check 列是否可用（通过查询验证）
    const { data: duplicateFields, error: duplicateErr } = await db
      .from('product_field_configs')
      .select('id, field_key, is_duplicate_check')
      .eq('is_duplicate_check', true);

    if (duplicateErr) {
      if (duplicateErr.message?.includes('is_duplicate_check')) {
        return NextResponse.json({
          success: false,
          status: 'needs_duplicate_fix',
          error: 'is_duplicate_check 字段异常：' + duplicateErr.message,
        });
      }
      return NextResponse.json({ success: false, error: duplicateErr.message }, { status: 500 });
    }

    if (!duplicateFields || duplicateFields.length === 0) {
      return NextResponse.json({
        success: false,
        status: 'needs_data',
        error: '尚未配置任何判重字段，请在下方选择至少一个判重字段并保存。',
      });
    }

    // 3. 健康
    return NextResponse.json({
      success: true,
      status: 'healthy',
      message: '判重字段配置表结构正常，已启用 ' + duplicateFields.length + ' 个判重字段。',
      data: {
        totalFields: rows.length,
        duplicateCheckFieldCount: duplicateFields.length,
        duplicateCheckFields: duplicateFields.map((f) => f.field_key),
      },
    });
  } catch (err: any) {
    return NextResponse.json({ success: false, error: err.message }, { status: 500 });
  }
}
