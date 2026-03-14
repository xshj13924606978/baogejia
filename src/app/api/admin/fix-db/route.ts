import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 通过API直接修复数据库（替代SQL Editor）
 */
export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    console.log('[Fix DB] 开始修复数据库...');

    // 步骤1：检查表结构
    const { data: currentData, error: checkError } = await db
      .from('product_field_configs')
      .select('*')
      .limit(1);

    if (checkError) {
      return NextResponse.json({
        success: false,
        error: '检查表失败：' + checkError.message,
      });
    }

    console.log('[Fix DB] 当前列名:', currentData && currentData.length > 0 ? Object.keys(currentData[0]) : []);

    // 步骤2：尝试添加列（使用原始SQL）
    const columnsToAdd = [
      { name: 'field_name', type: 'VARCHAR(100)' },
      { name: 'field_type', type: 'VARCHAR(20)' },
      { name: 'is_duplicate_check', type: 'BOOLEAN DEFAULT FALSE' },
      { name: 'is_visible', type: 'BOOLEAN DEFAULT TRUE' },
      { name: 'display_order', type: 'INTEGER DEFAULT 0' },
    ];

    const results = [];

    for (const column of columnsToAdd) {
      try {
        // 尝试直接执行ALTER TABLE
        const { error: alterError } = await db.rpc('exec_sql', {
          sql: `ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS ${column.name} ${column.type};`,
        });

        if (alterError) {
          // 如果exec_sql不存在，尝试其他方法
          console.log(`[Fix DB] ${column.name}: exec_sql失败，尝试其他方法`);

          // 尝试创建一个新的表
          results.push({
            column: column.name,
            status: 'failed',
            error: alterError.message,
          });
        } else {
          console.log(`[Fix DB] ${column.name}: 添加成功`);
          results.push({
            column: column.name,
            status: 'success',
          });
        }
      } catch (e) {
        console.error(`[Fix DB] ${column.name}: 异常`, e);
        results.push({
          column: column.name,
          status: 'error',
          error: e instanceof Error ? e.message : 'Unknown error',
        });
      }
    }

    // 步骤3：验证修复结果
    const { data: verifyData, error: verifyError } = await db
      .from('product_field_configs')
      .select('*')
      .limit(1);

    if (verifyError) {
      return NextResponse.json({
        success: false,
        error: '验证失败：' + verifyError.message,
        results,
      });
    }

    const newColumns = verifyData && verifyData.length > 0 ? Object.keys(verifyData[0]) : [];

    console.log('[Fix DB] 修复后列名:', newColumns);

    const hasFieldName = newColumns.includes('field_name');
    const hasIsDuplicateCheck = newColumns.includes('is_duplicate_check');

    return NextResponse.json({
      success: true,
      message: '修复完成',
      results,
      oldColumns: currentData && currentData.length > 0 ? Object.keys(currentData[0]) : [],
      newColumns,
      hasFieldName,
      hasIsDuplicateCheck,
      fixed: hasFieldName && hasIsDuplicateCheck,
    });

  } catch (error) {
    console.error('[Fix DB] 修复失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '修复失败',
      },
      { status: 500 }
    );
  }
}
