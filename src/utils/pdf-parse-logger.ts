/**
 * PDF解析调试日志系统
 * 提供统一的日志接口和详细的追踪能力
 */

export enum LogLevel {
  DEBUG = 0,
  INFO = 1,
  WARN = 2,
  ERROR = 3,
  NONE = 4,
}

export interface LogConfig {
  level: LogLevel;
  enableColors: boolean;
  enableTimestamp: boolean;
  enableDetailedInfo: boolean;
}

class PdfParseLogger {
  private config: LogConfig;
  private indentLevel: number = 0;
  private logs: string[] = [];

  constructor(config?: Partial<LogConfig>) {
    this.config = {
      level: LogLevel.DEBUG,
      enableColors: true,
      enableTimestamp: true,
      enableDetailedInfo: true,
      ...config,
    };
  }

  /**
   * 设置日志级别
   */
  public setLevel(level: LogLevel): void {
    this.config.level = level;
  }

  /**
   * 增加缩进层级
   */
  public indent(): void {
    this.indentLevel++;
  }

  /**
   * 减少缩进层级
   */
  public dedent(): void {
    this.indentLevel = Math.max(0, this.indentLevel - 1);
  }

  /**
   * 输出调试日志
   */
  public debug(message: string, data?: any): void {
    this.log(LogLevel.DEBUG, message, data, '🔍');
  }

  /**
   * 输出信息日志
   */
  public info(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data, 'ℹ️');
  }

  /**
   * 输出警告日志
   */
  public warn(message: string, data?: any): void {
    this.log(LogLevel.WARN, message, data, '⚠️');
  }

  /**
   * 输出错误日志
   */
  public error(message: string, data?: any): void {
    this.log(LogLevel.ERROR, message, data, '❌');
  }

  /**
   * 输出成功日志
   */
  public success(message: string, data?: any): void {
    this.log(LogLevel.INFO, message, data, '✅');
  }

  /**
   * 输出分隔线
   */
  public separator(char: string = '=', length: number = 80): void {
    const line = char.repeat(length);
    this.logs.push(line);
  }

  /**
   * 输出区块标题
   */
  public section(title: string): void {
    const line = '='.repeat(80);
    this.logs.push(title);
  }

  /**
   * 核心日志方法
   */
  private log(level: LogLevel, message: string, data: any, icon: string): void {
    if (level < this.config.level) {
      return;
    }

    const timestamp = this.config.enableTimestamp ? `[${new Date().toISOString()}] ` : '';
    const indent = '  '.repeat(this.indentLevel);
    const fullMessage = `${indent}${icon} ${message}`;


    if (data && this.config.enableDetailedInfo) {
      if (typeof data === 'object') {
      } else {
      }
    }

    this.logs.push(fullMessage);
  }

  /**
   * 获取所有日志
   */
  public getLogs(): string[] {
    return [...this.logs];
  }

  /**
   * 清空日志
   */
  public clear(): void {
    this.logs = [];
  }

  /**
   * 导出日志到字符串
   */
  public exportLogs(): string {
    return this.logs.join('\n');
  }
}

// 创建全局单例
export const pdfLogger = new PdfParseLogger();

/**
 * PDF解析上下文
 * 用于追踪解析过程中的状态
 */
export class ParseContext {
  private logger: PdfParseLogger;
  private phases: Map<string, { startTime: number; data: any }> = new Map();

  constructor(logger: PdfParseLogger = pdfLogger) {
    this.logger = logger;
  }

  /**
   * 开始一个解析阶段
   */
  public startPhase(phaseName: string, data?: any): void {
    this.logger.section(phaseName);
    this.logger.info(`开始阶段: ${phaseName}`, data);
    
    this.phases.set(phaseName, {
      startTime: Date.now(),
      data: data || {},
    });

    this.logger.indent();
  }

  /**
   * 结束一个解析阶段
   */
  public endPhase(phaseName: string, result?: any): void {
    const phase = this.phases.get(phaseName);
    
    if (!phase) {
      this.logger.warn(`未找到阶段: ${phaseName}`);
      return;
    }

    this.logger.dedent();
    
    const duration = Date.now() - phase.startTime;
    this.logger.success(`完成阶段: ${phaseName}`, {
      耗时: `${duration}ms`,
      ...result,
    });

    this.phases.delete(phaseName);
  }

  /**
   * 记录决策点
   */
  public logDecision(decision: string, options: any, result: any): void {
    this.logger.debug(`决策: ${decision}`, {
      选项: options,
      结果: result,
    });
  }

  /**
   * 记录转换
   */
  public logTransformation(input: any, transformation: string, output: any): void {
    this.logger.info(`转换: ${transformation}`, {
      输入: input,
      输出: output,
    });
  }

  /**
   * 记录异常
   */
  public logException(error: Error, context?: any): void {
    this.logger.error(`异常: ${error.message}`, {
      堆栈: error.stack,
      上下文: context,
    });
  }

  /**
   * 记录统计信息
   */
  public logStatistics(stats: Record<string, any>): void {
    this.logger.section('📊 统计信息');
    Object.entries(stats).forEach(([key, value]) => {
      this.logger.info(`${key}:`, value);
    });
  }
}

// 创建全局上下文单例
export const parseContext = new ParseContext();

/**
 * 性能计时器
 */
export class PerformanceTimer {
  private name: string;
  private startTime: number;
  private checkpoints: Map<string, number> = new Map();
  private logger: PdfParseLogger;

  constructor(name: string, logger: PdfParseLogger = pdfLogger) {
    this.name = name;
    this.startTime = Date.now();
    this.logger = logger;
    this.logger.debug(`🏁 计时器启动: ${name}`);
  }

  /**
   * 创建检查点
   */
  public checkpoint(name: string): void {
    const now = Date.now();
    const elapsed = now - this.startTime;
    this.checkpoints.set(name, elapsed);
    this.logger.debug(`⏱️ 检查点 [${this.name}]: ${name}`, {
      耗时: `${elapsed}ms`,
    });
  }

  /**
   * 停止计时器并输出总耗时
   */
  public stop(): number {
    const now = Date.now();
    const totalElapsed = now - this.startTime;
    this.logger.success(`⏱️ 计时器结束 [${this.name}]`, {
      总耗时: `${totalElapsed}ms`,
      检查点数: this.checkpoints.size,
    });
    return totalElapsed;
  }

  /**
   * 获取所有检查点
   */
  public getCheckpoints(): Map<string, number> {
    return new Map(this.checkpoints);
  }
}

/**
 * 创建性能计时器
 */
export function createTimer(name: string): PerformanceTimer {
  return new PerformanceTimer(name);
}

/**
 * 数据追踪器
 * 用于追踪数据的转换过程
 */
export class DataTracker {
  private logger: PdfParseLogger;
  private transformations: Array<{
    from: string;
    to: string;
    transformation: string;
    timestamp: number;
  }> = [];

  constructor(logger: PdfParseLogger = pdfLogger) {
    this.logger = logger;
  }

  /**
   * 追踪数据转换
   */
  public track(from: any, to: any, transformation: string): void {
    const entry = {
      from: JSON.stringify(from),
      to: JSON.stringify(to),
      transformation,
      timestamp: Date.now(),
    };

    this.transformations.push(entry);

    this.logger.debug(`📊 数据追踪: ${transformation}`, {
      从: from,
      到: to,
    });
  }

  /**
   * 获取转换历史
   */
  public getHistory(): Array<any> {
    return [...this.transformations];
  }

  /**
   * 导出追踪报告
   */
  public exportReport(): string {
    let report = '📊 数据转换追踪报告\n';
    report += '='.repeat(80) + '\n';

    this.transformations.forEach((entry, index) => {
      report += `\n${index + 1}. ${entry.transformation}\n`;
      report += `   从: ${entry.from.substring(0, 100)}...\n`;
      report += `   到: ${entry.to.substring(0, 100)}...\n`;
      report += `   时间: ${new Date(entry.timestamp).toISOString()}\n`;
    });

    return report;
  }
}

/**
 * 创建数据追踪器
 */
export function createDataTracker(): DataTracker {
  return new DataTracker();
}
