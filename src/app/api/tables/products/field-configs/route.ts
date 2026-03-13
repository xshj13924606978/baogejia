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
    const { field_key, is_required } = body;

    if (!field_key) {
      return NextResponse.json(
        {
          success: false,
          error: '字段键名不能为空'},
        { status: 400 }
      );
    }

    const db = getSupabaseClient();
    const { data, error } = await db
      .from('product_field_configs')
      .update({ is_required, updated_at: new Date().toISOString() })
      .eq('field_key', field_key)
      .select()
      .single();

    if (error) {
      console.error('更新字段配置失败:', error);
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
