/**
 * 日志工具类
 * 提供错误去重、日志简化等功能
 */

export class Logger {
  private static errorMessages = new Set<string>();
  private static lastErrorTime = new Map<string, number>();
  private static readonly ERROR_COOLDOWN = 5000; // 5秒内相同错误不重复记录
  private static readonly MAX_ERROR_CACHE = 100; // 最多缓存100条错误信息

  /**
   * 清理过期的错误缓存
   */
  private static cleanupErrors(): void {
    const now = Date.now();
    const toDelete: string[] = [];

    this.lastErrorTime.forEach((time, key) => {
      if (now - time > 60000) { // 1分钟后清理
        toDelete.push(key);
      }
    });

    toDelete.forEach(key => {
      this.errorMessages.delete(key);
      this.lastErrorTime.delete(key);
    });

    // 限制缓存大小
    if (this.errorMessages.size > this.MAX_ERROR_CACHE) {
      const entries = Array.from(this.lastErrorTime.entries())
        .sort((a, b) => a[1] - b[1]);
      for (let i = 0; i < entries.length - this.MAX_ERROR_CACHE; i++) {
        this.errorMessages.delete(entries[i][0]);
        this.lastErrorTime.delete(entries[i][0]);
      }
    }
  }

  /**
   * 记录错误（带去重）
   */
  static error(message: string, error?: any): void {
    const errorKey = message + (error?.message || '');
    const now = Date.now();

    this.cleanupErrors();

    const lastTime = this.lastErrorTime.get(errorKey);
    if (lastTime && now - lastTime < this.ERROR_COOLDOWN) {
      // 相同错误在冷却期内，不重复记录
      return;
    }

    this.errorMessages.add(errorKey);
    this.lastErrorTime.set(errorKey, now);

    console.error(message, error);
  }

  /**
   * 记录调试信息
   */
  static debug(message: string, data?: any): void {
    if (data) {
      const simplifiedData = this.simplifyData(data);
      console.debug(message, simplifiedData);
    } else {
      console.debug(message);
    }
  }

  /**
   * 记录信息
   */
  static info(message: string, data?: any): void {
    if (data) {
      // 简化数据输出，只显示关键信息
      const simplifiedData = this.simplifyData(data);
      console.log(message, simplifiedData);
    } else {
      console.log(message);
    }
  }

  /**
   * 记录警告
   */
  static warn(message: string, data?: any): void {
    if (data) {
      const simplifiedData = this.simplifyData(data);
      console.warn(message, simplifiedData);
    } else {
      console.warn(message);
    }
  }

  /**
   * 简化数据输出
   */
  private static simplifyData(data: any): any {
    if (!data) return data;

    // 如果是数组，只显示前3个元素
    if (Array.isArray(data)) {
      if (data.length > 3) {
        return `[Array(${data.length})] ${JSON.stringify(data.slice(0, 3))} ...`;
      }
      return data;
    }

    // 如果是对象，只显示前5个属性
    if (typeof data === 'object') {
      const keys = Object.keys(data);
      if (keys.length > 5) {
        const simplified: any = {};
        keys.slice(0, 5).forEach(key => {
          simplified[key] = data[key];
        });
        simplified._more = `... (${keys.length - 5} more fields)`;
        return simplified;
      }
      return data;
    }

    // 如果是字符串，截断过长的内容
    if (typeof data === 'string' && data.length > 200) {
      return data.substring(0, 200) + '...';
    }

    return data;
  }

  /**
   * 清空错误缓存
   */
  static clearErrors(): void {
    this.errorMessages.clear();
    this.lastErrorTime.clear();
  }
}
