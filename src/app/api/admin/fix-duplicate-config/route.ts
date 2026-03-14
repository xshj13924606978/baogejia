import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 自动修复判重配置
 * 将 name、model、brand 字段的 is_duplicate_check 设置为 TRUE
 */
export async function POST(request: NextRequest) {
  try {
    const db = getSupabaseClient();

    console.log('[Fix Duplicate Config] 开始修复判重配置...');

    // 步骤1: 检查表是否存在
    const { error: tableCheckError } = await db
      .from('product_field_configs')
      .select('count', { count: 'exact', head: true });

    if (tableCheckError && tableCheckError.message && tableCheckError.message.includes('does not exist')) {
      return NextResponse.json({
        success: false,
        error: 'product_field_configs 表不存在',
      }, { status: 400 });
    }

    // 步骤2: 获取当前判重配置状态
    const { data: currentConfig, error: fetchError } = await db
      .from('product_field_configs')
      .select('field_key, field_name, is_duplicate_check')
      .in('field_key', ['name', 'model', 'brand']);

    if (fetchError) {
      console.error('[Fix Duplicate Config] 查询失败:', fetchError);
      return NextResponse.json({
        success: false,
        error: '查询失败：' + fetchError.message,
      }, { status: 500 });
    }

    console.log('[Fix Duplicate Config] 当前判重配置:', currentConfig);

    // 步骤3: 批量更新判重配置
    const updatePromises = ['name', 'model', 'brand'].map(async (fieldKey) => {
      const { error } = await db
        .from('product_field_configs')
        .update({ is_duplicate_check: true })
        .eq('field_key', fieldKey);

      if (error) {
        console.error(`[Fix Duplicate Config] 更新 ${fieldKey} 失败:`, error);
        return { fieldKey, success: false, error: error.message };
      }

      console.log(`[Fix Duplicate Config] ${fieldKey} 判重配置已启用`);
      return { fieldKey, success: true };
    });

    const results = await Promise.all(updatePromises);

    // 检查是否全部成功
    const allSuccess = results.every(r => r.success);

    if (!allSuccess) {
      return NextResponse.json({
        success: false,
        error: '部分字段更新失败',
        results,
      }, { status: 500 });
    }

    // 步骤4: 验证修复结果
    const { data: verifiedData } = await db
      .from('product_field_configs')
      .select('field_key, field_name, is_duplicate_check')
      .in('field_key', ['name', 'model', 'brand']);

    console.log('[Fix Duplicate Config] 修复后的判重配置:', verifiedData);

    return NextResponse.json({
      success: true,
      message: '判重配置修复成功',
      results,
      verifiedData,
    });

  } catch (error) {
    console.error('[Fix Duplicate Config] 修复失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : '修复失败',
      },
      { status: 500 }
    );
  }
}
