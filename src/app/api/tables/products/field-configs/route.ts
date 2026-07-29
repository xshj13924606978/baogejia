import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

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
          error: error.message},
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

      // 如果错误是列不存在，尝试添加列
      if (error.message && error.message.includes('column') && error.message.includes('does not exist')) {

        // 使用 SQL 添加列
        const { error: alterError } = await db.rpc('exec_sql', {
          sql: `ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS is_duplicate_check BOOLEAN DEFAULT FALSE;`,
        });

        if (alterError) {
          console.error('添加列失败:', alterError);
          return NextResponse.json(
            {
              success: false,
              error: `字段配置更新失败：${error.message}。请联系管理员执行数据库迁移。`},
            { status: 500 }
          );
        }

        // 重试更新
        const { data: retryData, error: retryError } = await db
          .from('product_field_configs')
          .update(updateData)
          .eq('field_key', field_key)
          .select()
          .single();

        if (retryError) {
          return NextResponse.json(
            {
              success: false,
              error: retryError.message},
            { status: 500 }
          );
        }

        return NextResponse.json({
          success: true,
          message: '字段配置更新成功（已自动添加判重列）',
          data: retryData});
      }

      return NextResponse.json(
        {
          success: false,
          error: error.message},
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
