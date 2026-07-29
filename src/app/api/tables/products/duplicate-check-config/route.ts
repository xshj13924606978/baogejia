import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取判重配置（获取所有标记为判重的字段）
export async function GET(_request: NextRequest) {
  try {
    const db = getSupabaseClient();

    // 检查表是否存在
    const { error: tableCheckError } = await db
      .from('product_field_configs')
      .select('count', { count: 'exact', head: true });

    if (tableCheckError) {
      console.error('[Duplicate Check Config GET] 表不存在或无权访问:', tableCheckError);
      
      return NextResponse.json({ 
        success: false,
        error: '数据库表不存在，请先执行初始化SQL',
        needInit: true,
        data: { allFields: [], duplicateCheckFields: [] }
      }, { status: 200 });
    }


    // 获取所有字段配置
    const { data: allFields, error: allFieldsError } = await db
      .from('product_field_configs')
      .select('*')
      .order('id', { ascending: true });

    if (allFieldsError) {
      console.error('[Duplicate Check Config GET] 获取字段配置失败:', allFieldsError);
      return NextResponse.json(
        {
          success: false,
          error: allFieldsError.message,
          data: { allFields: [], duplicateCheckFields: [] }
        },
        { status: 200 }
      );
    }


    // 检查是否有 is_duplicate_check 列
    const hasDuplicateCheckColumn = allFields && allFields.length > 0 && 'is_duplicate_check' in allFields[0];


    if (!hasDuplicateCheckColumn) {
      console.warn('[Duplicate Check Config GET] 缺少 is_duplicate_check 列，返回空配置');
      return NextResponse.json({
        success: false,
        error: '数据库缺少 is_duplicate_check 列，需要添加此列',
        needInit: true,
        data: { 
          allFields: allFields || [], 
          duplicateCheckFields: [],
          hasDuplicateCheckColumn: false
        }
      }, { status: 200 });
    }

    // 获取标记为判重的字段
    const { data: duplicateCheckFields, error: dupError } = await db
      .from('product_field_configs')
      .select('*')
      .eq('is_duplicate_check', true)
      .order('id', { ascending: true });

    if (dupError) {
      console.error('[Duplicate Check Config GET] 获取判重字段失败:', dupError);
      return NextResponse.json(
        {
          success: false,
          error: '获取判重配置失败：' + dupError.message,
          data: { allFields: allFields || [], duplicateCheckFields: [] }
        },
        { status: 200 }
      );
    }


    return NextResponse.json({
      success: true,
      data: {
        allFields: allFields || [],
        duplicateCheckFields: duplicateCheckFields || [],
        hasDuplicateCheckColumn: true
      }
    });
  } catch (error) {
    console.error('[Duplicate Check Config GET] 获取判重配置异常:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '获取判重配置失败',
        data: { allFields: [], duplicateCheckFields: [] }
      },
      { status: 200 }
    );
  }
}

// 批量更新判重配置
export async function PUT(request: NextRequest) {
  try {
    const body = await request.json();
    const { duplicateCheckFields } = body;


    // 验证：至少选择一个判重字段
    if (!duplicateCheckFields || !Array.isArray(duplicateCheckFields) || duplicateCheckFields.length === 0) {
      console.warn('[Duplicate Check Config PUT] 验证失败：至少需要选择一个判重字段');
      return NextResponse.json(
        {
          success: false,
          error: '至少需要选择一个判重字段'
        },
        { status: 400 }
      );
    }

    const db = getSupabaseClient();

    // 检查表是否存在
    const { error: tableCheckError } = await db
      .from('product_field_configs')
      .select('count', { count: 'exact', head: true });

    if (tableCheckError && tableCheckError.message && tableCheckError.message.includes('does not exist')) {
      console.error('[Duplicate Check Config PUT] 表不存在');
      return NextResponse.json(
        {
          success: false,
          error: '数据库表不存在，请先执行初始化SQL',
          needsInit: true,
        },
        { status: 200 }
      );
    }


    // 检查是否有 is_duplicate_check 列
    const { data: testData } = await db
      .from('product_field_configs')
      .select('is_duplicate_check')
      .limit(1);

    const hasDuplicateCheckColumn = testData && testData.length > 0 && 'is_duplicate_check' in testData[0];

    if (!hasDuplicateCheckColumn) {
      console.error('[Duplicate Check Config PUT] 缺少 is_duplicate_check 列');
      return NextResponse.json(
        {
          success: false,
          error: '数据库缺少 is_duplicate_check 列，需要添加此列。请在 Supabase SQL Editor 中执行：ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS is_duplicate_check BOOLEAN DEFAULT FALSE;',
          needsInit: true,
        },
        { status: 200 }
      );
    }


    // 先将所有字段的 is_duplicate_check 设置为 false
    const { error: resetError } = await db
      .from('product_field_configs')
      .update({ is_duplicate_check: false, updated_at: new Date().toISOString() })
      .neq('field_key', ''); // 添加 WHERE 条件，更新所有记录

    if (resetError) {
      console.error('[Duplicate Check Config PUT] 重置配置失败:', resetError);
      return NextResponse.json(
        {
          success: false,
          error: '重置配置失败：' + resetError.message
        },
        { status: 500 }
      );
    }


    // 将选中的字段设置为 true
    const promises = duplicateCheckFields.map((fieldKey: string) => {
      return db
        .from('product_field_configs')
        .update({
          is_duplicate_check: true,
          updated_at: new Date().toISOString(),
        })
        .eq('field_key', fieldKey);
    });

    const results = await Promise.all(promises);

    // 检查是否有更新失败的情况
    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      console.error('[Duplicate Check Config PUT] 部分字段更新失败:', errors);
      return NextResponse.json(
        {
          success: false,
          error: `部分字段更新失败：${errors.map((e) => e.error?.message).join(', ')}`
        },
        { status: 500 }
      );
    }


    // 获取更新后的配置
    const { data: updatedFields } = await db
      .from('product_field_configs')
      .select('*')
      .eq('is_duplicate_check', true);


    return NextResponse.json({
      success: true,
      message: `成功更新判重配置，共 ${duplicateCheckFields.length} 个字段参与判重`,
      data: {
        duplicateCheckFields: updatedFields || [],
      },
    });
  } catch (error) {
    console.error('[Duplicate Check Config PUT] 更新判重配置异常:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新判重配置失败'
      },
      { status: 500 }
    );
  }
}
// test
