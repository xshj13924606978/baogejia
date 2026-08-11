/**
 * 定时任务调度器
 * 每天凌晨 2:00 自动触发八爪鱼 RPA 数据采集
 */

import cron from 'node-cron';
import { collectAllCategories } from './octopus-collector';
import { importCollectedData } from './data-importer';
import { getSupabaseClient } from '@/storage/database/supabase-client';

let isRunning = false;

/**
 * 执行完整的数据采集与导入流程
 */
export async function runDataCollection(): Promise<{
  success: boolean;
  categoriesCount: number;
  collectedCount: number;
  newProducts: number;
  updatedProducts: number;
  error?: string;
}> {
  if (isRunning) {
    console.log('[Scheduler] 采集任务正在运行中，跳过本次触发');
    return { success: false, categoriesCount: 0, collectedCount: 0, newProducts: 0, updatedProducts: 0, error: '任务已在运行' };
  }

  isRunning = true;
  const startTime = Date.now();

  try {
    console.log('[Scheduler] 开始执行产品数据采集任务...');

    const supabase = getSupabaseClient();

    // 1. 获取所有启用的类别
    const { data: categories } = await supabase
      .from('collection_categories')
      .select('*')
      .eq('enabled', true);

    if (!categories || categories.length === 0) {
      console.log('[Scheduler] 没有启用的采集类别，跳过采集');
      return { success: true, categoriesCount: 0, collectedCount: 0, newProducts: 0, updatedProducts: 0 };
    }

    console.log(`[Scheduler] 找到 ${categories.length} 个启用类别`);

    // 2. 采集数据
    const collectedData = await collectAllCategories(categories);
    console.log(`[Scheduler] 采集完成，共 ${collectedData.length} 条原始数据`);

    // 3. 导入数据
    const importResult = await importCollectedData(collectedData);

    const durationMs = Date.now() - startTime;

    // 4. 记录日志
    const { error: logError } = await supabase.from('collection_logs').insert({
      executed_at: new Date().toISOString(),
      total_collected: collectedData.length,
      new_products: importResult.newProducts,
      updated_products: importResult.updatedProducts,
      status: 'success',
      duration_ms: durationMs,
    });

    if (logError) {
      console.error('[Scheduler] 记录采集日志失败:', logError);
    }

    console.log(
      `[Scheduler] 采集任务完成: 新增 ${importResult.newProducts} 条, 更新 ${importResult.updatedProducts} 条, 耗时 ${durationMs}ms`
    );

    return {
      success: true,
      categoriesCount: categories.length,
      collectedCount: collectedData.length,
      newProducts: importResult.newProducts,
      updatedProducts: importResult.updatedProducts,
    };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    const durationMs = Date.now() - startTime;

    console.error('[Scheduler] 采集任务失败:', error);

    // 记录失败日志
    try {
      const supabase = getSupabaseClient();
      await supabase.from('collection_logs').insert({
        executed_at: new Date().toISOString(),
        status: 'failed',
        error_message: message,
        duration_ms: durationMs,
      });
    } catch {
      // 日志记录失败不阻断流程
    }

    return { success: false, categoriesCount: 0, collectedCount: 0, newProducts: 0, updatedProducts: 0, error: message };
  } finally {
    isRunning = false;
  }
}

/**
 * 启动定时任务
 */
export function startScheduler(): void {
  const enableAuto = process.env.ENABLE_AUTO_COLLECTION !== 'false';
  const schedule = process.env.COLLECTION_SCHEDULE || '0 2 * * *';

  if (!enableAuto) {
    console.log('[Scheduler] 自动采集已禁用 (ENABLE_AUTO_COLLECTION=false)');
    return;
  }

  console.log(`[Scheduler] 启动定时采集任务，计划: ${schedule}`);

  cron.schedule(schedule, async () => {
    console.log('[Scheduler] 定时触发采集任务');
    await runDataCollection();
  });

  console.log('[Scheduler] 定时任务已注册');
}
