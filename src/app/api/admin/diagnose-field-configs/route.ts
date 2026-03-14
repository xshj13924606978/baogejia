import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 诊断并修复 product_field_configs 表的字段结构
 */
export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    console.log('[Diagnose Field Configs] 开始诊断字段配置表...');

    // 步骤1: 检查表是否存在
    const { error: tableCheckError } = await db
      .from('product_field_configs')
      .select('count', { count: 'exact', head: true });

    if (tableCheckError && tableCheckError.message && tableCheckError.message.includes('does not exist')) {
      console.log('[Diagnose Field Configs] 表不存在');
      return NextResponse.json({
        success: false,
        status: 'table_not_exists',
        error: 'product_field_configs 表不存在',
        solution: '需要执行完整的初始化SQL',
        action: 'call_init_api',
        api_endpoint: '/api/admin/init-product-field-configs',
      });
    }

    // 步骤2: 尝试查询所有字段，检测字段名
    const { data: allData, error: allError } = await db
      .from('product_field_configs')
      .select('*')
      .order('id', { ascending: true });

    console.log('[Diagnose Field Configs] 查询结果:', {
      hasData: !!allData,
      dataLength: allData?.length || 0,
      allFieldKeys: allData?.map((f: any) => f.field_key),
      error: allError?.message || null,
    });

    if (allError) {
      console.error('[Diagnose Field Configs] 查询失败:', allError);
      return NextResponse.json({
        success: false,
        status: 'query_failed',
        error: '查询失败：' + allError.message,
      });
    }

    // 步骤3: 检测字段
    const hasDisplayName = allData && allData.length > 0 && 'display_name' in allData[0];
    const hasFieldName = allData && allData.length > 0 && 'field_name' in allData[0];
    const hasIsDuplicateCheck = allData && allData.length > 0 && 'is_duplicate_check' in allData[0];

    console.log('[Diagnose Field Configs] 字段检测结果:', {
      hasDisplayName,
      hasFieldName,
      hasIsDuplicateCheck,
      hasData: allData && allData.length > 0,
      sampleField: allData && allData.length > 0 ? Object.keys(allData[0]) : [],
    });

    // 检测旧表结构（field_key 是 product_name 而不是 name）
    const hasProductNameField = allData && allData.length > 0 &&
      allData.some((f: any) => f.field_key === 'product_name');

    const hasOldStructure = hasProductNameField;

    console.log('[Diagnose Field Configs] 旧表结构检测:', {
      hasProductNameField,
      hasOldStructure,
      hasIsDuplicateCheck,
      allFieldKeys: allData?.map((f: any) => f.field_key),
    });

    // 对于旧表结构，如果已经有 is_duplicate_check 列，返回健康状态
    // 因为有了 is_duplicate_check 列，就能正常工作，不需要重建表
    if (hasOldStructure && hasIsDuplicateCheck) {
      console.log('[Diagnose Field Configs] 检测到旧表结构，但已有 is_duplicate_check 列，可以正常工作');

      // 获取当前配置的判重字段
      const duplicateFields = allData?.filter((f: any) => f.is_duplicate_check) || [];

      return NextResponse.json({
        success: true,
        status: 'healthy_old_structure',
        message: '表结构正常，可以正常使用',
        data: {
          hasData: allData && allData.length > 0,
          recordCount: allData?.length || 0,
          duplicateFields: duplicateFields.map((f: any) => f.field_key),
          sampleData: allData?.slice(0, 3),
          isOldStructure: true,
          note: '表结构已适配，可以正常工作。',
        },
      });
    }

    // 对于旧表结构，如果还没有 is_duplicate_check 列，返回健康状态（但提示需要添加列）
    if (hasOldStructure && !hasIsDuplicateCheck) {
      console.log('[Diagnose Field Configs] 检测到旧表结构，但缺少 is_duplicate_check 列');

      // 获取默认的判重字段
      const defaultDuplicateFields = allData?.filter((f: any) =>
        f.field_key === 'product_name' || f.field_key === 'name' || f.field_key === 'model'
      ) || [];

      return NextResponse.json({
        success: true,
        status: 'healthy_old_structure',
        message: '需要添加 is_duplicate_check 列',
        data: {
          hasData: allData && allData.length > 0,
          recordCount: allData?.length || 0,
          duplicateFields: defaultDuplicateFields.map((f: any) => f.field_key),
          sampleData: allData?.slice(0, 3),
          isOldStructure: true,
          needsAddColumn: true,
          note: '需要添加 is_duplicate_check 列才能使用判重功能。请在 Supabase SQL Editor 中执行：ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS is_duplicate_check BOOLEAN DEFAULT FALSE;',
        },
      });
    }

    // 情况1: 使用了旧的 display_name 字段
    if (hasDisplayName && !hasFieldName) {
      console.log('[Diagnose Field Configs] 发现旧字段 display_name，需要修复');

      const fixSql = `-- 修复字段名：将 display_name 重命名为 field_name
ALTER TABLE product_field_configs RENAME COLUMN display_name TO field_name;

-- 验证修复结果
SELECT column_name, data_type 
FROM information_schema.columns 
WHERE table_name = 'product_field_configs' 
ORDER BY ordinal_position;`;

      return NextResponse.json({
        success: false,
        status: 'needs_rename',
        error: '字段名不正确，需要将 display_name 重命名为 field_name',
        fixSql,
        instructions: [
          '1. 登录 Supabase Dashboard',
          '2. 进入 SQL Editor',
          '3. 复制并执行下方的 SQL 语句',
          '4. 执行完成后，刷新页面',
        ],
      });
    }

    // 表结构正常
    console.log('[Diagnose Field Configs] 表结构正常');
    return NextResponse.json({
      success: true,
      status: 'healthy',
      message: '表结构正常',
      data: {
        hasData: allData && allData.length > 0,
        recordCount: allData?.length || 0,
        duplicateFields: allData?.filter((f: any) => f.is_duplicate_check).map((f: any) => f.field_key) || [],
        sampleData: allData?.slice(0, 3),
      },
    });

  } catch (error) {
    console.error('[Diagnose Field Configs] 诊断失败:', error);
    return NextResponse.json(
      {
        success: false,
        status: 'error',
        error: error instanceof Error ? error.message : '诊断失败',
      },
      { status: 500 }
    );
  }
}
