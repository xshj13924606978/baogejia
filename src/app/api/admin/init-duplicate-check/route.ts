import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 初始化产品判重配置
 * 添加 is_duplicate_check 列到 product_field_configs 表
 */
export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    console.log('[Init Duplicate Check] 开始初始化产品判重配置...');

    // 尝试添加 is_duplicate_check 列
    // 注意：Supabase JS 客户端不支持直接执行 ALTER TABLE
    // 这里我们使用 SQL Editor 或者提供 SQL 语句让用户手动执行

    // 先测试列是否已存在
    const { data: testData, error: testError } = await db
      .from('product_field_configs')
      .select('is_duplicate_check')
      .limit(1);

    if (!testError) {
      console.log('[Init Duplicate Check] is_duplicate_check 列已存在');
      return NextResponse.json({
        success: true,
        message: '判重配置列已存在，无需初始化',
      });
    }

    if (testError.message && !testError.message.includes('column')) {
      console.error('[Init Duplicate Check] 测试查询失败:', testError);
      return NextResponse.json(
        {
          success: false,
          error: '数据库查询失败',
        },
        { status: 500 }
      );
    }

    // 列不存在，需要添加
    console.log('[Init Duplicate Check] is_duplicate_check 列不存在，需要添加');

    // 返回 SQL 语句，让用户在 Supabase Dashboard 中执行
    const sqlStatements = [
      '-- 添加 is_duplicate_check 列',
      'ALTER TABLE product_field_configs ADD COLUMN IF NOT EXISTS is_duplicate_check BOOLEAN DEFAULT FALSE;',
      '',
      '-- 设置默认判重字段（name 和 model）',
      "UPDATE product_field_configs SET is_duplicate_check = TRUE WHERE field_key IN ('name', 'model');",
    ];

    return NextResponse.json({
      success: false,
      error: '数据库表需要迁移',
      requiresManualSetup: true,
      message: '需要在 Supabase Dashboard 中执行以下 SQL 语句',
      sqlStatements: sqlStatements.join('\n'),
      instructions: [
        '1. 登录 Supabase Dashboard',
        '2. 进入 SQL Editor',
        '3. 复制并执行下方的 SQL 语句',
        '4. 执行完成后，重新加载页面',
      ],
    });
  } catch (error) {
    console.error('[Init Duplicate Check] 初始化失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '初始化失败',
      },
      { status: 500 }
    );
  }
}
