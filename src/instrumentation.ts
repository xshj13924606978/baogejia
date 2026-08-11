/**
 * Next.js Instrumentation
 * 在服务端启动时注册定时任务调度器
 */
export async function register() {
  if (process.env.NEXT_RUNTIME === 'nodejs') {
    const { startScheduler } = await import('./lib/scheduler');
    startScheduler();
  }
}
