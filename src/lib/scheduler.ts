/**
 * 定时任务调度器
 *
 * 已注册任务：
 * 1. 每天凌晨 2:00 八爪鱼 RPA 产品数据采集（ENABLE_AUTO_COLLECTION 控制）
 * 2. 每天凌晨 3:30 用户操作日志清理（90 天前）
 * 3. #20260831-1600 P0-2：会员订阅 / 品牌置顶权益 到期检查 + 到期提醒
 *    （默认每天 01:10，cron 与开关由 trade_config `scheduler.expiry_check` 动态控制）
 * 4. #20260901-0900 P3-1：业务周报 / 月报定时生成
 *    （默认周一 04:20 / 每月 1 日 04:40，cron 与开关由 trade_config `scheduler.business_report` 动态控制）
 */

import cron from 'node-cron';
import { collectAllCategories } from './octopus-collector';
import { importCollectedData } from './data-importer';
import { runBusinessReportGeneration } from './report-generator';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

let isRunning = false;
/** 到期检查任务重入保护（#20260831-1600 P0-2） */
let isExpiryRunning = false;

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

    const supabase = getSupabaseServiceClient();

    // 1. 获取所有启用的类别
    const { data: categories, error: categoriesError } = await supabase
      .from('collection_categories')
      .select('*')
      .eq('enabled', true);

    if (categoriesError) {
      throw new Error(`获取采集类别失败: ${categoriesError.message}`);
    }

    if (!categories || categories.length === 0) {
      console.log('[Scheduler] 没有启用的采集类别，跳过采集');
      return { success: true, categoriesCount: 0, collectedCount: 0, newProducts: 0, updatedProducts: 0 };
    }

    console.log(`[Scheduler] 找到 ${categories.length} 个启用类别`);
    console.log('[Scheduler] 启用类别:', categories.map((c) => ({ id: c.id, name: c.name, keywords: c.keywords })));

    // 2. 采集数据
    const collectedData = await collectAllCategories(categories);
    console.log(`[Scheduler] 采集完成，共 ${collectedData.length} 条原始数据`);

    if (collectedData.length === 0) {
      console.warn('[Scheduler] 未采集到任何数据，请检查八爪鱼 API 配置或关键词设置');
    }

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
      const supabase = getSupabaseServiceClient();
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
 * 清理 90 天前的用户操作日志
 */
export async function runLogCleanup(): Promise<number> {
  const { cleanupOldUserLogs } = await import('./user-log-service');
  const deleted = await cleanupOldUserLogs();
  if (deleted >= 0) {
    console.log(`[Scheduler] 用户日志清理完成，删除 ${deleted} 条过期日志`);
  }
  return deleted;
}

/**
 * #20260831-1600 P0-2：会员订阅 / 品牌权益 到期检查 + 到期提醒
 *
 * 执行内容：
 * 1. 调用 `expire_expired_memberships()`     批量将过期 active 订阅置 expired 并降级用户等级
 * 2. 调用 `expire_expired_brand_priorities()` 批量重算过期品牌置顶权益（无有效权益则降为 0）
 * 3. 按 trade_config 配置的提醒天数，为即将到期的会员/品牌写入站内信（按天幂等，不重复打扰）
 *
 * 说明：惰性降级（读取时判定）保留作为兜底；本任务解决「长期不活跃用户数据滞留过期态」
 * 与「无任何到期提醒」两个问题。失败不影响其它定时任务。
 */
export async function runExpiryCheck(): Promise<{
  success: boolean;
  membershipsExpired: number;
  levelsDowngraded: number;
  brandsExpired: number;
  notificationsSent: number;
  error?: string;
}> {
  if (isExpiryRunning) {
    console.log('[Scheduler] 到期检查任务正在运行中，跳过本次触发');
    return {
      success: false,
      membershipsExpired: 0,
      levelsDowngraded: 0,
      brandsExpired: 0,
      notificationsSent: 0,
      error: '任务已在运行',
    };
  }

  isExpiryRunning = true;
  const startTime = Date.now();

  try {
    const supabase = getSupabaseServiceClient();

    // 1) 会员批量过期 + 降级
    let membershipsExpired = 0;
    let levelsDowngraded = 0;
    const { data: memberResult, error: memberError } = await supabase.rpc('expire_expired_memberships');
    if (memberError) {
      // 函数不存在（迁移 123 未应用）时降级为跳过，不阻断其它任务
      if (memberError.message?.includes('does not exist') || memberError.code === '42883') {
        console.warn('[Scheduler] expire_expired_memberships 不存在，跳过会员过期处理（请应用迁移 123）');
      } else {
        console.error('[Scheduler] 会员批量过期失败:', memberError.message);
      }
    } else {
      membershipsExpired = Number(memberResult?.expired ?? 0);
      levelsDowngraded = Number(memberResult?.downgraded ?? 0);
    }

    // 2) 品牌权益批量过期
    let brandsExpired = 0;
    const { data: brandResult, error: brandError } = await supabase.rpc('expire_expired_brand_priorities');
    if (brandError) {
      if (brandError.message?.includes('does not exist') || brandError.code === '42883') {
        console.warn('[Scheduler] expire_expired_brand_priorities 不存在，跳过品牌过期处理（请应用迁移 123）');
      } else {
        console.error('[Scheduler] 品牌权益批量过期失败:', brandError.message);
      }
    } else {
      brandsExpired = Number(brandResult?.expired ?? 0);
    }

    // 3) 到期提醒（按天幂等，天数来自 trade_config）
    let notificationsSent = 0;
    try {
      const { createExpireNotification } = await import('@/lib/notification-service');
      const { getTradeConfigValue } = await import('@/lib/trade-config-service');

      const [memberDays, brandDays] = await Promise.all([
        getTradeConfigValue<{ days?: number[] }>('membership.expire_notify_days'),
        getTradeConfigValue<{ days?: number[] }>('brand.expire_notify_days'),
      ]);
      const mDays = Array.isArray(memberDays?.days) && memberDays.days.length > 0 ? memberDays.days : [7, 3, 1];
      const bDays = Array.isArray(brandDays?.days) && brandDays.days.length > 0 ? brandDays.days : [7, 3, 1];

      const withinDays = Math.max(...mDays, ...bDays);

      // 3.1 会员即将到期
      const { data: expiringMembers, error: emError } = await supabase.rpc(
        'get_memberships_expiring_soon',
        { p_within_days: withinDays }
      );
      if (emError) {
        if (!emError.message?.includes('does not exist') && emError.code !== '42883') {
          console.error('[Scheduler] 查询即将到期会员失败:', emError.message);
        }
      } else {
        for (const m of expiringMembers || []) {
          if (!mDays.includes(Number(m.days_left))) continue;
          const sent = await createExpireNotification({
            userId: m.user_id,
            // 幂等键含天数：同一天只提醒一次；跨天（7→3→1）会各提醒一次
            referenceId: `membership_expire_${m.subscription_id}_d${m.days_left}`,
            title: '会员即将到期',
            content: `您的会员将在 ${m.days_left} 天后到期（${new Date(m.end_date).toLocaleDateString('zh-CN')}），请及时续费以保持权益。`,
            data: { subscription_id: m.subscription_id, days_left: m.days_left, end_date: m.end_date },
          });
          if (sent) notificationsSent++;
        }
      }

      // 3.2 品牌权益即将到期
      const { data: expiringBrands, error: ebError } = await supabase.rpc(
        'get_brand_priorities_expiring_soon',
        { p_within_days: withinDays }
      );
      if (ebError) {
        if (!ebError.message?.includes('does not exist') && ebError.code !== '42883') {
          console.error('[Scheduler] 查询即将到期品牌失败:', ebError.message);
        }
      } else {
        for (const b of expiringBrands || []) {
          if (!bDays.includes(Number(b.days_left))) continue;
          const sent = await createExpireNotification({
            userId: b.user_id,
            referenceId: `brand_expire_${b.brand_id}_d${b.days_left}`,
            title: '品牌置顶权益即将到期',
            content: `品牌「${b.brand_name}」的置顶权益将在 ${b.days_left} 天后到期（${new Date(b.priority_expire_at).toLocaleDateString('zh-CN')}），到期后将自动降级为免费展示，请及时续费。`,
            data: { brand_id: b.brand_id, days_left: b.days_left, expire_at: b.priority_expire_at },
          });
          if (sent) notificationsSent++;
        }
      }
    } catch (notifyError) {
      console.error('[Scheduler] 到期提醒处理失败:', notifyError);
    }

    const durationMs = Date.now() - startTime;
    console.log(
      `[Scheduler] 到期检查完成: 会员过期 ${membershipsExpired} (降级 ${levelsDowngraded}), ` +
        `品牌权益过期 ${brandsExpired}, 提醒 ${notificationsSent} 条, 耗时 ${durationMs}ms`
    );

    return { success: true, membershipsExpired, levelsDowngraded, brandsExpired, notificationsSent };
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    console.error('[Scheduler] 到期检查任务失败:', error);
    return {
      success: false,
      membershipsExpired: 0,
      levelsDowngraded: 0,
      brandsExpired: 0,
      notificationsSent: 0,
      error: message,
    };
  } finally {
    isExpiryRunning = false;
  }
}

/**
 * 启动定时任务
 */
export function startScheduler(): void {
  const enableAuto = process.env.ENABLE_AUTO_COLLECTION !== 'false';
  const schedule = process.env.COLLECTION_SCHEDULE || '0 2 * * *';
  const cleanupSchedule = process.env.LOG_CLEANUP_SCHEDULE || '30 3 * * *';

  if (!enableAuto) {
    console.log('[Scheduler] 自动采集已禁用 (ENABLE_AUTO_COLLECTION=false)');
  } else {
    console.log(`[Scheduler] 启动定时采集任务，计划: ${schedule}`);

    cron.schedule(schedule, async () => {
      console.log('[Scheduler] 定时触发采集任务');
      await runDataCollection();
    });

    console.log('[Scheduler] 定时任务已注册');
  }

  // 用户日志清理任务（独立于采集开关，始终注册）
  console.log(`[Scheduler] 启动日志清理任务，计划: ${cleanupSchedule}`);
  cron.schedule(cleanupSchedule, async () => {
    await runLogCleanup();
  });
  console.log('[Scheduler] 日志清理任务已注册');

  // #20260831-1600 P0-2：会员/品牌到期检查任务
  // 配置从 trade_config 读取（`scheduler.expiry_check`，迁移 123 种子），
  // 修改后需重启进程生效（cron 调度本身不支持热更新），但开关与提醒天数每次执行时实时读取。
  void (async () => {
    let enabled = true;
    let schedule = '10 1 * * *';
    try {
      const { getTradeConfigValue } = await import('@/lib/trade-config-service');
      const cfg = await getTradeConfigValue<{ enabled?: boolean; schedule?: string }>(
        'scheduler.expiry_check'
      );
      if (cfg && typeof cfg.enabled === 'boolean') enabled = cfg.enabled;
      if (cfg?.schedule && cron.validate(cfg.schedule)) schedule = cfg.schedule;
    } catch (e) {
      console.warn('[Scheduler] 读取到期检查配置失败，使用默认计划:', e);
    }

    if (!enabled) {
      console.log('[Scheduler] 到期检查任务已禁用 (trade_config scheduler.expiry_check.enabled=false)');
      return;
    }

    console.log(`[Scheduler] 启动到期检查任务，计划: ${schedule}`);
    cron.schedule(schedule, async () => {
      console.log('[Scheduler] 定时触发到期检查任务');
      await runExpiryCheck();
    });
    console.log('[Scheduler] 到期检查任务已注册');
  })();

  // #20260901-0900 P3-1：业务周报/月报定时生成
  // 配置从 trade_config 读取（`scheduler.business_report`，迁移 125 种子），
  // 修改 cron 需重启进程生效；报表按 (report_type, period_start) 幂等落库 business_reports。
  void (async () => {
    let enabled = true;
    let weeklySchedule = '20 4 * * 1';
    let monthlySchedule = '40 4 1 * *';
    try {
      const { getTradeConfigValue } = await import('@/lib/trade-config-service');
      const cfg = await getTradeConfigValue<{
        enabled?: boolean;
        weeklySchedule?: string;
        monthlySchedule?: string;
      }>('scheduler.business_report');
      if (cfg && typeof cfg.enabled === 'boolean') enabled = cfg.enabled;
      if (cfg?.weeklySchedule && cron.validate(cfg.weeklySchedule)) weeklySchedule = cfg.weeklySchedule;
      if (cfg?.monthlySchedule && cron.validate(cfg.monthlySchedule)) monthlySchedule = cfg.monthlySchedule;
    } catch (e) {
      console.warn('[Scheduler] 读取业务报表配置失败，使用默认计划:', e);
    }

    if (!enabled) {
      console.log('[Scheduler] 业务报表任务已禁用 (trade_config scheduler.business_report.enabled=false)');
      return;
    }

    console.log(`[Scheduler] 启动业务周报任务，计划: ${weeklySchedule}`);
    cron.schedule(weeklySchedule, async () => {
      console.log('[Scheduler] 定时触发业务周报生成');
      await runBusinessReportGeneration('weekly');
    });
    console.log(`[Scheduler] 启动业务月报任务，计划: ${monthlySchedule}`);
    cron.schedule(monthlySchedule, async () => {
      console.log('[Scheduler] 定时触发业务月报生成');
      await runBusinessReportGeneration('monthly');
    });
    console.log('[Scheduler] 业务周/月报任务已注册');
  })();
}
