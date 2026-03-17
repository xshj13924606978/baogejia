/**
 * 全局日志控制
 * 在生产环境中自动禁用 debug 和 info 日志
 * 过滤 Console Bridge 等无关警告
 *
 * ⚠️ 必须尽早执行，在 layout.tsx 中最先导入
 */

// 只在浏览器环境执行
if (typeof window !== 'undefined') {
  // 过滤函数：检查是否应该过滤这条日志
  const shouldFilter = (args: any[]): boolean => {
    // 将所有参数转换为字符串
    const message = args.map(arg => {
      if (typeof arg === 'string') return arg;
      try {
        return String(arg);
      } catch {
        return '';
      }
    }).join(' ');

    // 过滤 Console Bridge 相关的警告和日志
    if (message.includes('Console Bridge') ||
        message.includes('Cannot send message') ||
        message.includes('parent origin not allowed')) {
      return true;
    }

    return false;
  };

  // 检查是否在生产环境
  const isProduction = process.env.NODE_ENV === 'production';

  // 保存原始方法引用（使用 Object.freeze 防止被修改）
  const originalConsole = Object.freeze({
    log: console.log.bind(console),
    warn: console.warn.bind(console),
    error: console.error.bind(console),
    info: console.info.bind(console),
    debug: console.debug.bind(console),
    trace: console.trace.bind(console),
    group: console.group.bind(console),
    groupCollapsed: console.groupCollapsed.bind(console),
    groupEnd: console.groupEnd.bind(console)
  });

  // 创建包装函数
  const createFilteredConsole = (originalFn: Function) => {
    return function (...args: any[]) {
      if (shouldFilter(args)) {
        return;
      }
      originalFn.apply(console, args);
    };
  };

  // 在开发环境中，过滤 Console Bridge 警告
  if (!isProduction) {
    // 覆盖所有常用的 console 方法
    console.log = createFilteredConsole(originalConsole.log);
    console.warn = createFilteredConsole(originalConsole.warn);
    console.info = createFilteredConsole(originalConsole.info);
    console.debug = createFilteredConsole(originalConsole.debug);
    console.trace = createFilteredConsole(originalConsole.trace);
    console.group = createFilteredConsole(originalConsole.group);
    console.groupCollapsed = createFilteredConsole(originalConsole.groupCollapsed);
  }

  // 在生产环境中，禁用 debug 和 info 日志，并过滤无关日志
  if (isProduction) {
    console.log = function (...args) {
      if (shouldFilter(args)) {
        return;
      }
      // 只输出错误和警告日志
      const message = args.join(' ');
      if (message.includes('[ERROR]') || message.includes('[WARN]') || message.includes('[ChatArea]')) {
        originalConsole.log.apply(console, args);
      }
    };

    console.debug = () => {};
    console.info = () => {};
    console.trace = () => {};
    console.group = () => {};
    console.groupCollapsed = () => {};
  }

  // 保持 error 方法不变，确保错误信息始终可见
  console.error = originalConsole.error;
}

export {};
