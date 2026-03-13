/**
 * 全局日志控制
 * 在生产环境中自动禁用 debug 和 info 日志
 */

// 检查是否在生产环境
const isProduction = process.env.NODE_ENV === 'production';

// 过滤掉 Console Bridge 相关的警告
const originalWarn = console.warn;
console.warn = function (...args) {
  const message = args.join(' ');
  // 过滤掉 Console Bridge 相关的警告
  if (message.includes('Console Bridge') || message.includes('Cannot send message')) {
    return; // 不输出这个警告
  }
  originalWarn.apply(console, args);
};

// 在生产环境中禁用 debug 和 info 日志
if (isProduction) {
  const originalLog = console.log;
  const originalDebug = console.debug;
  const originalInfo = console.info;

  console.log = function (...args) {
    // 只输出错误和警告日志
    const message = args.join(' ');
    if (message.includes('[ERROR]') || message.includes('[WARN]') || message.includes('[ChatArea]')) {
      originalLog.apply(console, args);
    }
  };

  console.debug = () => {};
  console.info = () => {};
}

