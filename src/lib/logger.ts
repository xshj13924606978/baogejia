/**
 * 调试日志工具
 * 用于在开发环境中输出调试信息，避免 Strict Mode 导致的重复日志
 */

const loggedMessages = new Set<string>();

/**
 * 清空已记录的消息（用于测试或需要重新输出时）
 */
export function clearLoggedMessages() {
  loggedMessages.clear();
}

/**
 * 只输出一次的日志
 * @param tag 日志标签，用于标识消息来源
 * @param message 日志内容
 * @param data 可选的额外数据
 */
export function logOnce(tag: string, message: string, data?: any) {
  if (process.env.NODE_ENV !== 'production') {
    const key = `${tag}:${message}`;
    if (!loggedMessages.has(key)) {
      console.log(`[${tag}] ${message}`, data || '');
      loggedMessages.add(key);
    }
  }
}

/**
 * 只输出一次的警告
 * @param tag 日志标签，用于标识消息来源
 * @param message 警告内容
 * @param data 可选的额外数据
 */
export function warnOnce(tag: string, message: string, data?: any) {
  if (process.env.NODE_ENV !== 'production') {
    const key = `${tag}:${message}`;
    if (!loggedMessages.has(key)) {
      console.warn(`[${tag}] ${message}`, data || '');
      loggedMessages.add(key);
    }
  }
}

/**
 * 带时间戳的调试日志
 * @param tag 日志标签
 * @param message 日志内容
 * @param data 可选的额外数据
 */
export function logWithTimestamp(tag: string, message: string, data?: any) {
  if (process.env.NODE_ENV !== 'production') {
    const timestamp = new Date().toLocaleString('zh-CN');
    console.log(`[${tag}] ${timestamp} - ${message}`, data || '');
  }
}

/**
 * 静态日志记录器类（向后兼容）
 */
export class Logger {
  static info(message: string, data?: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.log(message, data || '');
    }
  }

  static warn(message: string, data?: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.warn(message, data || '');
    }
  }

  static error(message: string, data?: any) {
    console.error(message, data || '');
  }

  static debug(message: string, data?: any) {
    if (process.env.NODE_ENV !== 'production') {
      console.log('[DEBUG]', message, data || '');
    }
  }
}
