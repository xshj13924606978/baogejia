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
      // 旧表结构：尝试从独立的配置表读取
      console.log('[Duplicate Check Config] 旧表结构，尝试从独立配置表读取');

      try {
        // 先检查表是否存在
        const { error: tableCheckError } = await db
          .from('duplicate_check_settings')
          .select('count', { count: 'exact', head: true });

        if (tableCheckError) {
          console.log('[Duplicate Check Config] 独立配置表不存在，使用默认判重字段');
          // 使用默认判重字段
          duplicateCheckFields = allFields?.filter((f: any) =>
            f.field_key === 'name' || f.field_key === 'product_name' || f.field_key === 'model'
          ) || [];
        } else {
          const { data: configData, error: configError } = await db
            .from('duplicate_check_settings')
            .select('*')
            .eq('is_enabled', true)
            .order('display_order', { ascending: true });

          if (!configError && configData && configData.length > 0) {
            // 从独立配置表读取成功
            console.log('[Duplicate Check Config] 从独立配置表读取到配置:', configData.length, '个字段');
            duplicateCheckFields = configData.map((config: any) => {
              const field = allFields?.find((f: any) => f.field_key === config.field_key);
              return field || {
                id: config.id,
                field_key: config.field_key,
                field_label: config.field_name,
                is_required: false,
              };
            });
          } else {
            // 配置表为空或读取失败，使用默认判重字段
            console.log('[Duplicate Check Config] 独立配置表为空，使用默认判重字段');
            duplicateCheckFields = allFields?.filter((f: any) =>
              f.field_key === 'name' || f.field_key === 'product_name' || f.field_key === 'model'
            ) || [];
          }
        }
      } catch (e) {
        console.error('[Duplicate Check Config] 读取独立配置表失败:', e);
        // 默认判重字段为 product_name 和 model
        duplicateCheckFields = allFields?.filter((f: any) =>
          f.field_key === 'name' || f.field_key === 'product_name' || f.field_key === 'model'
        ) || [];
      }
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

    // 如果有 is_duplicate_check 列，使用原有的更新逻辑
    if (hasDuplicateCheckColumn) {
      // 先将所有字段的 is_duplicate_check 设置为 false
      const { error: resetError } = await db
        .from('product_field_configs')
        .update({ is_duplicate_check: false, updated_at: new Date().toISOString() });

      if (resetError) {
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
        },
      });
    }

    // 对于旧表结构，使用独立的配置表
    console.log('[Duplicate Check Config] 使用独立配置表保存判重配置');

    // 检查独立配置表是否存在
    let tableExists = false;
    try {
      const { error: tableCheckError } = await db
        .from('duplicate_check_settings')
        .select('count', { count: 'exact', head: true });

      if (!tableCheckError) {
        tableExists = true;
        console.log('[Duplicate Check Config] 独立配置表已存在');
      } else {
        console.log('[Duplicate Check Config] 独立配置表不存在:', tableCheckError.message);
      }
    } catch (tableError) {
      console.log('[Duplicate Check Config] 检查独立配置表时出错:', tableError);
    }

    if (!tableExists) {
      console.error('[Duplicate Check Config] 独立配置表不存在');
      return NextResponse.json(
        {
          success: false,
          error: '独立配置表不存在，请先创建配置表',
          needsSetup: true,
        },
        { status: 200 }
      );
    }

    // 获取所有字段配置
    const { data: allFields } = await db
      .from('product_field_configs')
      .select('*')
      .order('id', { ascending: true });

    if (!allFields) {
      return NextResponse.json(
        {
          success: false,
          error: '无法获取字段配置'
        },
        { status: 500 }
      );
    }

    // 删除旧的配置
    await db.from('duplicate_check_settings').delete().neq('id', null);

    // 插入新的配置
    const insertData = duplicateCheckFields.map((fieldKey: string, index: number) => {
      const field = allFields.find((f: any) => f.field_key === fieldKey);
      return {
        field_key: fieldKey,
        field_name: field?.field_label || fieldKey,
        is_enabled: true,
        display_order: index + 1,
      };
    });

    const { error: insertError } = await db
      .from('duplicate_check_settings')
      .insert(insertData);

    if (insertError) {
      console.error('[Duplicate Check Config] 插入配置失败:', insertError);
      return NextResponse.json(
        {
          success: false,
          error: '保存配置失败：' + insertError.message
        },
        { status: 500 }
      );
    }

    console.log('[Duplicate Check Config] 配置已保存到独立配置表');

    return NextResponse.json({
      success: true,
      message: `成功更新判重配置，共 ${duplicateCheckFields.length} 个字段参与判重`,
      data: {
        duplicateCheckFields: insertData.map((d: any) => ({
          field_key: d.field_key,
          field_label: d.field_name,
          is_required: false,
        })),
        isOldStructure: true,
      },
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
