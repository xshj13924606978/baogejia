/**
 * Redis 缓存管理器
 * 
 * 功能：
 * 1. 提供持久化缓存能力
 * 2. 支持 Redis 连接管理
 * 3. 降级到内存缓存（当 Redis 不可用时）
 * 4. 支持缓存过期时间
 * 5. 支持缓存统计和监控
 */

import { Redis } from 'ioredis';

/**
 * 缓存配置
 */
export interface RedisCacheConfig {
  host?: string;
  port?: number;
  password?: string;
  db?: number;
  keyPrefix?: string;
  defaultTTL?: number;  // 默认过期时间（毫秒）
  enableRedis?: boolean;  // 是否启用 Redis
  fallbackToMemory?: boolean;  // Redis 不可用时是否降级到内存缓存
}

/**
 * 缓存值
 */
interface CacheValue {
  data: any;
  timestamp: number;
  ttl?: number;
}

/**
 * Redis 缓存管理器类
 */
export class RedisCacheManager {
  private static instance: RedisCacheManager;
  private redis: Redis | null = null;
  private memoryCache: Map<string, CacheValue> = new Map();
  private config: RedisCacheConfig;
  private redisAvailable = false;
  private connectAttempted = false;  // 防止多次尝试连接
  private globalRetryCount = 0;  // 全局重试计数器
  private readonly MAX_GLOBAL_RETRIES = 5;  // 全局最大重试次数
  private readonly MAX_MEMORY_CACHE_SIZE = 10000;
  private memoryCleanupTimer: ReturnType<typeof setInterval> | null = null;
  private stats = {
    hits: 0,
    misses: 0,
    sets: 0,
    deletes: 0,
    errors: 0
  };

  private constructor(config?: RedisCacheConfig) {
    this.config = {
      host: process.env.REDIS_HOST || 'localhost',
      port: parseInt(process.env.REDIS_PORT || '6379'),
      password: process.env.REDIS_PASSWORD,
      db: parseInt(process.env.REDIS_DB || '0'),
      keyPrefix: 'match:',
      defaultTTL: 300000,  // 5分钟
      enableRedis: false,  // 默认禁用 Redis，使用内存缓存（避免无限重试）
      fallbackToMemory: true,
      ...config
    };

    // 定期清理过期的内存缓存条目
    this.memoryCleanupTimer = setInterval(() => this.cleanupMemoryCache(), 60 * 1000);
    if (this.memoryCleanupTimer && typeof this.memoryCleanupTimer.unref === 'function') {
      this.memoryCleanupTimer.unref();
    }
  }

  /**
   * 清理过期的内存缓存
   */
  private cleanupMemoryCache(): void {
    const now = Date.now();
    for (const [key, val] of this.memoryCache) {
      if (val.ttl && (now - val.timestamp) > val.ttl) {
        this.memoryCache.delete(key);
      }
    }
    // 超限时裁剪
    if (this.memoryCache.size > this.MAX_MEMORY_CACHE_SIZE) {
      const entries = Array.from(this.memoryCache.entries())
        .sort((a, b) => a[1].timestamp - b[1].timestamp);
      const toRemove = entries.length - this.MAX_MEMORY_CACHE_SIZE;
      for (let i = 0; i < toRemove; i++) {
        this.memoryCache.delete(entries[i][0]);
      }
    }
  }

  /**
   * 获取单例实例
   */
  public static getInstance(config?: RedisCacheConfig): RedisCacheManager {
    if (!RedisCacheManager.instance) {
      RedisCacheManager.instance = new RedisCacheManager(config);
    }
    return RedisCacheManager.instance;
  }

  /**
   * 初始化 Redis 连接
   */
  public async connect(): Promise<boolean> {
    // 检查是否已尝试过连接
    if (this.connectAttempted) {
      return this.redisAvailable;
    }

    // 标记已尝试连接
    this.connectAttempted = true;

    // 检查是否启用 Redis
    if (!this.config.enableRedis) {
      return false;
    }

    // 检查全局重试次数
    if (this.globalRetryCount >= this.MAX_GLOBAL_RETRIES) {
      console.error(`[RedisCacheManager] 全局重试次数已达到上限 (${this.MAX_GLOBAL_RETRIES})，停止尝试连接 Redis`);
      this.redisAvailable = false;
      return false;
    }

    this.globalRetryCount++;

    try {
      this.redis = new Redis({
        host: this.config.host,
        port: this.config.port,
        password: this.config.password,
        db: this.config.db,
        // 禁用自动重连和延迟连接
        enableReadyCheck: false,
        lazyConnect: false,
        // 禁用所有重试策略
        retryStrategy: () => null,  // 返回 null 禁用重试
        maxRetriesPerRequest: 0,  // 请求不重试
        connectTimeout: 3000,  // 3秒连接超时
      });

      // 添加超时控制
      const timeoutPromise = new Promise((_, reject) => {
        setTimeout(() => reject(new Error('连接超时')), 5000);
      });

      // 尝试连接，带超时控制
      await Promise.race([
        this.redis.ping(),
        timeoutPromise
      ]);

      this.redisAvailable = true;

      // 设置错误监听
      this.redis.on('error', (error: Error) => {
        console.error('[RedisCacheManager] Redis 错误:', error);
        this.redisAvailable = false;
        this.stats.errors++;
      });

      this.redis.on('close', () => {
        console.warn('[RedisCacheManager] Redis 连接关闭');
        this.redisAvailable = false;
      });

      // 禁用自动重连
      this.redis.on('reconnecting', () => {
        console.warn('[RedisCacheManager] 检测到 Redis 重连尝试，立即断开以防止无限重连');
        if (this.redis) {
          this.redis.disconnect();
          this.redis = null;
        }
        this.redisAvailable = false;
      });

      return true;

    } catch (error) {
      console.error('[RedisCacheManager] Redis 连接失败:', error);
      this.redisAvailable = false;

      // 立即关闭连接（如果已创建）
      if (this.redis) {
        try {
          this.redis.disconnect();
        } catch (e) {
          // 忽略断开错误
        }
        this.redis = null;
      }

      if (this.config.fallbackToMemory) {
      }

      return false;
    }
  }

  /**
   * 生成缓存键
   */
  private generateKey(key: string): string {
    return `${this.config.keyPrefix}${key}`;
  }

  /**
   * 设置缓存
   */
  public async set(key: string, value: any, ttl?: number): Promise<boolean> {
    const cacheKey = this.generateKey(key);
    const actualTTL: number = ttl || this.config.defaultTTL || 300000;
    const cacheValue: CacheValue = {
      data: value,
      timestamp: Date.now(),
      ttl: actualTTL
    };

    try {
      if (this.redisAvailable && this.redis) {
        // 使用 Redis
        await this.redis.setex(cacheKey, Math.floor(actualTTL / 1000), JSON.stringify(cacheValue));
        this.stats.sets++;
        return true;
      } else if (this.config.fallbackToMemory) {
        // 使用内存缓存
        this.memoryCache.set(cacheKey, cacheValue);
        
        this.stats.sets++;
        return true;
      }

      return false;

    } catch (error) {
      console.error('[RedisCacheManager] 设置缓存失败:', error);
      this.stats.errors++;
      this.redisAvailable = false;
      
      // 降级到内存缓存
      if (this.config.fallbackToMemory) {
        this.memoryCache.set(cacheKey, cacheValue);
        return true;
      }

      return false;
    }
  }

  /**
   * 获取缓存
   */
  public async get(key: string): Promise<any | null> {
    const cacheKey = this.generateKey(key);

    try {
      if (this.redisAvailable && this.redis) {
        // 从 Redis 获取
        const value = await this.redis.get(cacheKey);
        if (value) {
          const cacheValue = JSON.parse(value) as CacheValue;
          if (cacheValue && cacheValue.data !== undefined) {
            this.stats.hits++;
            return cacheValue.data;
          }
          this.stats.misses++;
          return null;
        }
        this.stats.misses++;
        return null;
      } else if (this.config.fallbackToMemory) {
        // 从内存获取
        const cacheValue = this.memoryCache.get(cacheKey);
        if (cacheValue) {
          // 检查是否过期
          const age = Date.now() - cacheValue.timestamp;
          if (cacheValue.ttl && age > cacheValue.ttl) {
            this.memoryCache.delete(cacheKey);
            this.stats.misses++;
            return null;
          }
          this.stats.hits++;
          return cacheValue.data;
        }
        this.stats.misses++;
        return null;
      }

      this.stats.misses++;
      return null;

    } catch (error) {
      console.error('[RedisCacheManager] 获取缓存失败:', error);
      this.stats.errors++;
      this.redisAvailable = false;
      this.stats.misses++;
      
      // 尝试从内存获取
      if (this.config.fallbackToMemory) {
        const cacheValue = this.memoryCache.get(cacheKey);
        if (cacheValue) {
          return cacheValue.data;
        }
      }

      return null;
    }
  }

  /**
   * 删除缓存
   */
  public async del(key: string): Promise<boolean> {
    const cacheKey = this.generateKey(key);

    try {
      if (this.redisAvailable && this.redis) {
        await this.redis.del(cacheKey);
        this.stats.deletes++;
        return true;
      } else if (this.config.fallbackToMemory) {
        this.memoryCache.delete(cacheKey);
        this.stats.deletes++;
        return true;
      }

      return false;

    } catch (error) {
      console.error('[RedisCacheManager] 删除缓存失败:', error);
      this.stats.errors++;
      this.redisAvailable = false;
      return false;
    }
  }

  /**
   * 清除所有缓存
   */
  public async clear(): Promise<boolean> {
    try {
      if (this.redisAvailable && this.redis) {
        const keys = await this.redis.keys(`${this.config.keyPrefix}*`);
        if (keys.length > 0) {
          await this.redis.del(keys);
        }
      }

      this.memoryCache.clear();

      return true;

    } catch (error) {
      console.error('[RedisCacheManager] 清除缓存失败:', error);
      this.stats.errors++;
      return false;
    }
  }

  /**
   * 检查 Redis 是否可用
   */
  public isRedisAvailable(): boolean {
    return this.redisAvailable;
  }

  /**
   * 获取统计信息
   */
  public getStats(): {
    hits: number;
    misses: number;
    sets: number;
    deletes: number;
    errors: number;
    hitRate: number;
    redisAvailable: boolean;
    memoryCacheSize: number;
  } {
    const totalRequests = this.stats.hits + this.stats.misses;
    const hitRate = totalRequests > 0 ? this.stats.hits / totalRequests : 0;

    return {
      ...this.stats,
      hitRate,
      redisAvailable: this.redisAvailable,
      memoryCacheSize: this.memoryCache.size
    };
  }

  /**
   * 重置统计信息
   */
  public resetStats(): void {
    this.stats = {
      hits: 0,
      misses: 0,
      sets: 0,
      deletes: 0,
      errors: 0
    };
  }

  /**
   * 关闭连接
   */
  public async disconnect(): Promise<void> {
    if (this.redis) {
      try {
        await this.redis.quit();
      } catch (error) {
        // 忽略断开连接时的错误
        console.warn('[RedisCacheManager] 断开 Redis 连接时出错:', error);
      }
      this.redis = null;
      this.redisAvailable = false;
    }

    // 重置连接尝试标志，允许重新连接
    this.connectAttempted = false;
    this.globalRetryCount = 0;
  }
}

// 导出单例
export const redisCacheManager = RedisCacheManager.getInstance();
