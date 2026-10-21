/**
 * Next.js Instrumentation
 * 在服务端启动时注册定时任务调度器
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    // #[20260901-1100] P0-4：PM2 cluster 模式下每个 worker 都会执行 register()，
    // 定时任务（积分结算/日志清理/到期检查/报告生成）会被重复执行 N 次。
    // PM2 cluster 为每个实例注入 NODE_APP_INSTANCE（0..N-1），仅实例 0 注册调度器；
    // 非 PM2 环境（本地 dev / standalone）该变量不存在，正常注册。
    const instanceId = process.env.NODE_APP_INSTANCE;
    if (instanceId !== undefined && instanceId !== '0') {
      return;
    }
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();
  }
}
