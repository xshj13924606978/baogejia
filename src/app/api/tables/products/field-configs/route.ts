import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { safeErrorMessage } from '@/lib/error-handler';

// 获取字段配置列表
export async function GET(_request: NextRequest) {
  try {
    const db = getSupabaseClient();
    const { data, error } = await db
      .from('product_field_configs')
      .select('*')
      .order('id', { ascending: true });

    if (error) {
      console.error('获取字段配置失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: safeErrorMessage(error)},
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || []});
  } catch (error) {
    console.error('获取字段配置失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '获取字段配置失败'},
      { status: 500 }
    );
  }
}

// 更新字段配置
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { field_key, is_required, is_duplicate_check } = body;

    if (!field_key) {
      return NextResponse.json(
        {
          success: false,
          error: '字段键名不能为空'},
        { status: 400 }
      );
    }

    const db = getSupabaseClient();

    // 构建更新对象
    const updateData: any = {
      updated_at: new Date().toISOString(),
    };

    if (is_required !== undefined) {
      updateData.is_required = is_required;
    }

    if (is_duplicate_check !== undefined) {
      updateData.is_duplicate_check = is_duplicate_check;
    }

    const { data, error } = await db
      .from('product_field_configs')
      .update(updateData)
      .eq('field_key', field_key)
      .select()
      .single();

    if (error) {
      console.error('更新字段配置失败:', error);
      // #[E1_13_BYPASS_SCOPE_CLOSURE] A business request must never mutate the
      // database schema: there is no ALTER TABLE / exec_sql fallback and no
      // retry-after-DDL path any more. A missing column means the schema has
      // not been prepared by the audited Migration Runner, so the request fails
      // closed with a redacted, diagnosable message.
      return NextResponse.json(
        {
          success: false,
          error: '字段配置更新失败：数据库结构尚未通过受审迁移准备完成（database schema requires an audited migration），请联系部署管理员执行正式 Migration Runner 流程。',
          requiresAuditedMigration: true},
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '字段配置更新成功',
      data});
  } catch (error) {
    console.error('更新字段配置失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '更新字段配置失败'},
      { status: 500 }
    );
  }
}
