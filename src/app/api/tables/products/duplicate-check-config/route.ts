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
      console.error('[Duplicate Check Config] 表不存在或无权访问:', tableCheckError);
      
      // 检查是否是表不存在的错误
      if (tableCheckError.message && tableCheckError.message.includes('does not exist')) {
        return NextResponse.json({ 
          success: false,
          error: '数据库表不存在，请先执行初始化SQL',
          needInit: true,
          data: { allFields: [], duplicateCheckFields: [] }
        }, { status: 200 });
      }
      
      return NextResponse.json({ 
        success: false,
        error: tableCheckError.message || '无法访问数据库表',
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
      console.error('获取字段配置失败:', allFieldsError);
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

    // 获取标记为判重的字段（如果有 is_duplicate_check 列）
    let duplicateCheckFields = [];
    let dupError = null;

    if (hasDuplicateCheckColumn) {
      const result = await db
        .from('product_field_configs')
        .select('*')
        .eq('is_duplicate_check', true)
        .order('id', { ascending: true });

      duplicateCheckFields = result.data || [];
      dupError = result.error;
    } else {
      // 旧表结构：默认判重字段为 product_name 和 model
      console.log('[Duplicate Check Config] 旧表结构，使用默认判重字段');
      duplicateCheckFields = allFields?.filter((f: any) =>
        f.field_key === 'name' || f.field_key === 'product_name' || f.field_key === 'model'
      ) || [];
    }

    if (dupError && hasDuplicateCheckColumn) {
      console.error('获取判重配置失败:', dupError);
      
      // 检查是否是字段不存在的错误
      if (dupError.message && dupError.message.includes('column')) {
        return NextResponse.json(
          {
            success: false,
            error: '数据库缺少判重配置字段，需要初始化',
            needInit: true,
            data: { 
              allFields: allFields || [], 
              duplicateCheckFields: [],
              hasDuplicateCheckColumn: false
            }
          },
          { status: 200 }
        );
      }
      
      return NextResponse.json(
        {
          success: false,
          error: dupError.message,
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
    console.error('[Duplicate Check Config] 获取判重配置异常:', error);
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
      return NextResponse.json(
        {
          success: false,
          error: '至少需要选择一个判重字段'
        },
        { status: 400 }
      );
    }

    const db = getSupabaseClient();

    // 检查是否有 is_duplicate_check 列
    const { data: testData } = await db
      .from('product_field_configs')
      .select('is_duplicate_check')
      .limit(1);

    const hasDuplicateCheckColumn = testData && testData.length > 0 && 'is_duplicate_check' in testData[0];

    // 如果没有 is_duplicate_check 列，返回提示（当前使用旧表结构，无法保存配置）
    if (!hasDuplicateCheckColumn) {
      return NextResponse.json(
        {
          success: false,
          error: '当前使用旧表结构，无法保存判重配置。请升级到新表结构。',
          needsUpgrade: true,
          currentDuplicateFields: duplicateCheckFields,
        },
        { status: 200 }
      );
    }

    // 首先尝试添加 is_duplicate_check 列（如果不存在）
    try {
      // 使用原始 SQL 添加列
      const { error: alterError } = await db.rpc('exec_sql', {
        sql: `ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS is_duplicate_check BOOLEAN DEFAULT FALSE;`,
      });

      if (alterError) {
        // 如果 exec_sql 函数不存在，尝试直接更新（可能列已存在）
        console.log('exec_sql 函数不可用，假设列已存在');
      }
    } catch (e) {
      console.log('跳过添加列步骤，继续更新数据');
    }

    // 先将所有字段的 is_duplicate_check 设置为 false
    const { error: resetError } = await db
      .from('product_field_configs')
      .update({ is_duplicate_check: false, updated_at: new Date().toISOString() });

    if (resetError) {
      // 如果错误是列不存在，需要先添加列
      if (resetError.message && resetError.message.includes('is_duplicate_check')) {
        console.error('判重列不存在，请先执行数据库迁移：database/migrations/005_product_duplicate_check.sql');
        return NextResponse.json(
          {
            success: false,
            error: '数据库表结构不完整，请联系管理员执行数据库迁移'
          },
          { status: 500 }
        );
      }
      throw resetError;
    }

    // 将选中的字段设置为 true
    const promises = duplicateCheckFields.map((fieldKey: string) =>
      db
        .from('product_field_configs')
        .update({
          is_duplicate_check: true,
          updated_at: new Date().toISOString(),
        })
        .eq('field_key', fieldKey)
    );

    const results = await Promise.all(promises);

    // 检查是否有更新失败的情况
    const errors = results.filter((r) => r.error);
    if (errors.length > 0) {
      console.error('部分字段更新失败:', errors);
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
        fieldKeys: duplicateCheckFields,
      }
    });
  } catch (error) {
    console.error('更新判重配置失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '更新判重配置失败'
      },
      { status: 500 }
    );
  }
}
