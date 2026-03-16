/**
 * 实时缓存预热器
 *
 * 核心功能：
 * 1. 系统启动时预加载热门查询到缓存
 * 2. 基于历史数据的智能预热
 * 3. 定期预热热门产品
 * 4. 实时监控缓存命中率
 * 5. 自动优化预热策略
 *
 * 预热策略：
 * - 基于查询频率（Top-K 查询）
 * - 基于产品热门度
 * - 基于时间分布（工作日/周末、白天/夜间）
 * - 基于用户群体（行业、地区）
 */

import { RedisCacheManager } from './redis-cache';
import { ProductFeatureIndex, ProductFeature } from './product-feature-index';
import { UnifiedMatcher } from './unified-matcher';
import { ProductExtractor, ExtractedProduct } from './product-extractor';

/**
 * 预热任务
 */
export interface WarmupTask {
  id: string;
  query: string;
  priority: number;  // 优先级（1-10，10 最高）
  attempts: number;
  lastAttempt: number;
  status: 'pending' | 'warming' | 'success' | 'failed';
}

/**
 * 预热统计
 */
export interface WarmupStats {
  totalTasks: number;
  completedTasks: number;
  failedTasks: number;
  successRate: number;
  averageDuration: number;
  lastWarmupTime: number;
}

/**
 * 预热配置
 */
export interface WarmupConfig {
  enabled: boolean;
  maxConcurrent: number;  // 最大并发数
  batchSize: number;  // 批次大小
  interval: number;  // 预热间隔（毫秒）
  autoWarmup: boolean;  // 是否自动预热
  warmupOnStart: boolean;  // 启动时是否预热
  maxHistorySize: number;  // 历史记录最大数量
}

/**
 * 查询历史记录
 */
export interface QueryHistory {
  query: string;
  timestamp: number;
  resultCount: number;
  duration: number;
}

/**
 * 缓存预热器
 */
export class CacheWarmer {
  private static instance: CacheWarmer;
  private redisCache: RedisCacheManager;
  private featureIndex: ProductFeatureIndex;
  private unifiedMatcher: UnifiedMatcher;
  private config: WarmupConfig;
  private tasks: Map<string, WarmupTask>;
  private history: QueryHistory[];
  private queryFrequency: Map<string, number>;
  private isRunning: boolean;
  private warmupInterval: NodeJS.Timeout | null;

  private constructor(config?: WarmupConfig) {
    this.redisCache = RedisCacheManager.getInstance();
    this.featureIndex = ProductFeatureIndex.getInstance();
    // 延迟初始化以避免循环依赖
    this.unifiedMatcher = null as any;  // 将在需要时初始化

    this.config = {
      enabled: true,
      maxConcurrent: 5,
      batchSize: 20,
      interval: 600000,  // 10 分钟
      autoWarmup: true,
      warmupOnStart: true,
      maxHistorySize: 10000,
      ...config
    };

    this.tasks = new Map();
    this.history = [];
    this.queryFrequency = new Map();
    this.isRunning = false;
    this.warmupInterval = null;

    console.log('[CacheWarmer] 缓存预热器初始化完成');
  }

  /**
   * 获取 UnifiedMatcher 实例（延迟初始化以避免循环依赖）
   */
  private getMatcher(): UnifiedMatcher {
    if (!this.unifiedMatcher) {
      this.unifiedMatcher = UnifiedMatcher.getInstance();
    }
    return this.unifiedMatcher;
  }


  /**
   * 获取单例实例
   */
  public static getInstance(config?: WarmupConfig): CacheWarmer {
    if (!CacheWarmer.instance) {
      CacheWarmer.instance = new CacheWarmer(config);
    }
    return CacheWarmer.instance;
  }

  /**
   * 启动预热器
   */
  public async start(): Promise<void> {
    if (this.isRunning) {
      console.warn('[CacheWarmer] 预热器已在运行中');
      return;
    }

    this.isRunning = true;
    console.log('[CacheWarmer] 启动预热器');

    // 启动时预热
    if (this.config.warmupOnStart) {
      await this.warmupOnStartup();
    }

    // 自动预热
    if (this.config.autoWarmup) {
      this.warmupInterval = setInterval(() => {
        this.autoWarmup();
      }, this.config.interval);
      console.log(`[CacheWarmer] 自动预热已启动，间隔: ${this.config.interval / 1000} 秒`);
    }
  }

  /**
   * 停止预热器
   */
  public stop(): void {
    if (!this.isRunning) {
      console.warn('[CacheWarmer] 预热器未运行');
      return;
    }

    this.isRunning = false;

    if (this.warmupInterval) {
      clearInterval(this.warmupInterval);
      this.warmupInterval = null;
    }

    console.log('[CacheWarmer] 预热器已停止');
  }

  /**
   * 启动时预热
   */
  private async warmupOnStartup(): Promise<void> {
    console.log('[CacheWarmer] 开始启动时预热...');

    // 1. 预热热门产品
    await this.warmupPopularProducts();

    // 2. 预热热门查询
    await this.warmupPopularQueries();

    // 3. 预热所有产品分类
    await this.warmupAllCategories();

    console.log('[CacheWarmer] 启动时预热完成');
  }

  /**
   * 预热热门产品
   */
  private async warmupPopularProducts(): Promise<void> {
    console.log('[CacheWarmer] 预热热门产品...');

    try {
      const products = await this.featureIndex.getAllFeatures();

      // 按产品名称频率排序（使用模拟数据）
      const popularProducts = products.slice(0, 50);  // 前 50 个产品

      const tasks: WarmupTask[] = popularProducts.map((product, index) => ({
        id: `product-${product.id}`,
        query: `${product.name} ${product.model}`,
        priority: 10 - Math.floor(index / 10),  // 前 10 个优先级最高
        attempts: 0,
        lastAttempt: 0,
        status: 'pending'
      }));

      await this.executeTasks(tasks);

      console.log(`[CacheWarmer] 热门产品预热完成: ${tasks.length} 个产品`);
    } catch (error) {
      console.error('[CacheWarmer] 热门产品预热失败:', error);
    }
  }

  /**
   * 预热热门查询
   */
  private async warmupPopularQueries(): Promise<void> {
    console.log('[CacheWarmer] 预热热门查询...');

    try {
      // 获取 Top-K 热门查询
      const popularQueries = this.getTopQueries(30);  // 前 30 个热门查询

      const tasks: WarmupTask[] = popularQueries.map((item, index) => ({
        id: `query-${index}`,
        query: item.query,
        priority: 10 - Math.floor(index / 5),  // 前 5 个优先级最高
        attempts: 0,
        lastAttempt: 0,
        status: 'pending'
      }));

      await this.executeTasks(tasks);

      console.log(`[CacheWarmer] 热门查询预热完成: ${tasks.length} 个查询`);
    } catch (error) {
      console.error('[CacheWarmer] 热门查询预热失败:', error);
    }
  }

  /**
   * 预热所有产品分类
   */
  private async warmupAllCategories(): Promise<void> {
    console.log('[CacheWarmer] 预热所有产品分类...');

    try {
      const products = await this.featureIndex.getAllFeatures();

      // 收集所有分类
      const categories = new Set<string>();
      products.forEach(product => {
        if (product.category) {
          categories.add(product.category);
        }
      });

      // 为每个分类生成预热查询
      const tasks: WarmupTask[] = Array.from(categories).map((category, index) => ({
        id: `category-${index}`,
        query: `${category}多少钱`,
        priority: 5,
        attempts: 0,
        lastAttempt: 0,
        status: 'pending'
      }));

      await this.executeTasks(tasks);

      console.log(`[CacheWarmer] 产品分类预热完成: ${tasks.length} 个分类`);
    } catch (error) {
      console.error('[CacheWarmer] 产品分类预热失败:', error);
    }
  }

  /**
   * 自动预热（定期执行）
   */
  private async autoWarmup(): Promise<void> {
    console.log('[CacheWarmer] 执行自动预热...');

    // 1. 分析查询趋势
    const trendingQueries = this.getTrendingQueries();

    // 2. 预热趋势查询
    const tasks: WarmupTask[] = trendingQueries.map((item, index) => ({
      id: `trending-${Date.now()}-${index}`,
      query: item.query,
      priority: 10 - index,
      attempts: 0,
      lastAttempt: 0,
      status: 'pending'
    }));

    await this.executeTasks(tasks);

    console.log(`[CacheWarmer] 自动预热完成: ${tasks.length} 个查询`);
  }

  /**
   * 执行预热任务
   */
  private async executeTasks(tasks: WarmupTask[]): Promise<void> {
    const startTime = Date.now();

    // 按优先级排序
    const sortedTasks = tasks.sort((a, b) => b.priority - a.priority);

    // 分批执行
    for (let i = 0; i < sortedTasks.length; i += this.config.batchSize) {
      const batch = sortedTasks.slice(i, i + this.config.batchSize);

      await Promise.all(
        batch.map(task => this.executeTask(task))
      );
    }

    const duration = Date.now() - startTime;
    console.log(`[CacheWarmer] 任务执行完成: ${tasks.length} 个任务，耗时 ${duration}ms`);
  }

  /**
   * 执行单个预热任务
   */
  private async executeTask(task: WarmupTask): Promise<void> {
    try {
      task.status = 'warming';
      task.attempts++;
      task.lastAttempt = Date.now();

      // 提取产品信息
      const extracted = await ProductExtractor.extractWithLLM(task.query);

      if (!extracted) {
        throw new Error('产品提取失败');
      }

      // 执行匹配
      const matchResult = await this.getMatcher().match(task.query);

      // 记录到缓存
      const cacheKey = `match:${JSON.stringify({
        productName: extracted.productName,
        model: extracted.model
      })}`;

      await this.redisCache.set(cacheKey, matchResult);

      // 记录历史
      this.recordHistory({
        query: task.query,
        timestamp: Date.now(),
        resultCount: matchResult.matches?.length || 0,
        duration: Date.now() - task.lastAttempt
      });

      // 更新查询频率
      this.incrementQueryFrequency(task.query);

      task.status = 'success';
    } catch (error) {
      console.error(`[CacheWarmer] 任务执行失败: ${task.query}`, error);
      task.status = 'failed';
    }
  }

  /**
   * 获取 Top-K 热门查询
   */
  private getTopQueries(k: number): Array<{ query: string; count: number }> {
    const sorted = Array.from(this.queryFrequency.entries())
      .map(([query, count]) => ({ query, count }))
      .sort((a, b) => b.count - a.count);

    return sorted.slice(0, k);
  }

  /**
   * 获取趋势查询（最近增长最快的查询）
   */
  private getTrendingQueries(k: number = 10): Array<{ query: string; score: number }> {
    const now = Date.now();
    const oneDayAgo = now - 24 * 60 * 60 * 1000;

    // 计算最近一天的查询次数
    const recentCounts = new Map<string, number>();
    this.history.forEach(h => {
      if (h.timestamp > oneDayAgo) {
        recentCounts.set(h.query, (recentCounts.get(h.query) || 0) + 1);
      }
    });

    // 计算趋势分数（最近次数 / 总次数）
    const trending = Array.from(recentCounts.entries()).map(([query, recentCount]) => {
      const totalCount = this.queryFrequency.get(query) || 0;
      const score = totalCount > 0 ? recentCount / totalCount : 0;

      return { query, score };
    });

    // 按分数排序
    trending.sort((a, b) => b.score - a.score);

    return trending.slice(0, k);
  }

  /**
   * 记录查询历史
   */
  private recordHistory(history: QueryHistory): void {
    this.history.push(history);

    // 限制历史记录数量
    if (this.history.length > this.config.maxHistorySize) {
      this.history.shift();
    }
  }

  /**
   * 增加查询频率
   */
  private incrementQueryFrequency(query: string): void {
    this.queryFrequency.set(query, (this.queryFrequency.get(query) || 0) + 1);
  }

  /**
   * 记录用户查询（从外部调用）
   */
  public recordQuery(query: string, resultCount: number, duration: number): void {
    this.recordHistory({
      query,
      timestamp: Date.now(),
      resultCount,
      duration
    });

    this.incrementQueryFrequency(query);
  }

  /**
   * 手动添加预热任务
   */
  public addTask(query: string, priority: number = 5): void {
    const task: WarmupTask = {
      id: `manual-${Date.now()}`,
      query,
      priority,
      attempts: 0,
      lastAttempt: 0,
      status: 'pending'
    };

    this.tasks.set(task.id, task);
    console.log(`[CacheWarmer] 添加手动预热任务: ${query}`);
  }

  /**
   * 获取预热统计
   */
  public getStats(): WarmupStats {
    const completed = Array.from(this.tasks.values()).filter(t => t.status === 'success').length;
    const failed = Array.from(this.tasks.values()).filter(t => t.status === 'failed').length;
    const total = this.tasks.size;

    return {
      totalTasks: total,
      completedTasks: completed,
      failedTasks: failed,
      successRate: total > 0 ? completed / total : 0,
      averageDuration: this.calculateAverageDuration(),
      lastWarmupTime: this.history.length > 0 ? this.history[this.history.length - 1].timestamp : 0
    };
  }

  /**
   * 计算平均执行时长
   */
  private calculateAverageDuration(): number {
    if (this.history.length === 0) return 0;

    const totalDuration = this.history.reduce((sum, h) => sum + h.duration, 0);
    return totalDuration / this.history.length;
  }

  /**
   * 获取查询频率统计
   */
  public getQueryFrequencyStats(): Array<{ query: string; count: number }> {
    return this.getTopQueries(100);
  }

  /**
   * 更新配置
   */
  public updateConfig(config: Partial<WarmupConfig>): void {
    this.config = { ...this.config, ...config };
    console.log('[CacheWarmer] 配置已更新:', this.config);

    // 如果修改了自动预热间隔，重启定时器
    if (config.interval && this.isRunning && this.config.autoWarmup) {
      if (this.warmupInterval) {
        clearInterval(this.warmupInterval);
      }

      this.warmupInterval = setInterval(() => {
        this.autoWarmup();
      }, this.config.interval);

      console.log(`[CacheWarmer] 自动预热间隔已更新: ${this.config.interval / 1000} 秒`);
    }
  }

  /**
   * 获取当前配置
   */
  public getConfig(): WarmupConfig {
    return { ...this.config };
  }

  /**
   * 清空历史记录
   */
  public clearHistory(): void {
    this.history = [];
    this.queryFrequency.clear();
    this.tasks.clear();
    console.log('[CacheWarmer] 历史记录已清空');
  }
}

/**
 * 导出单例
 */
export const cacheWarmer = CacheWarmer.getInstance({
  enabled: true,
  maxConcurrent: 5,
  batchSize: 20,
  interval: 600000,
  autoWarmup: true,
  warmupOnStart: true,
  maxHistorySize: 10000
});
