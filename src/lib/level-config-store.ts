/**
 * 等级配置本地存储服务
 * 用于在没有数据库的情况下持久化等级配置
 */

import { LevelFullConfig } from './user-level-service';

const STORAGE_KEY = 'level_configs';

// 默认等级配置
const DEFAULT_LEVELS: LevelFullConfig[] = [
  {
    level: 1,
    name: '免费用户',
    requiredPoints: 0,
    role: 'free_user',
    fieldPermissions: {
      can_view_cost_price: false,
      can_view_min_price: false,
      can_view_manufacturer: false,
      can_view_contact: false,
      can_view_phone: false,
    },
    modulePermissions: ['chat', 'quote'],
    quotas: { daily_quota: 5, max_files: 3, max_chat_messages: 50 },
  },
  {
    level: 2,
    name: '普通会员',
    requiredPoints: 100,
    role: 'normal_member',
    fieldPermissions: {
      can_view_cost_price: false,
      can_view_min_price: true,
      can_view_manufacturer: false,
      can_view_contact: false,
      can_view_phone: false,
    },
    modulePermissions: ['chat', 'quote', 'history'],
    quotas: { daily_quota: 20, max_files: 10, max_chat_messages: 200 },
  },
  {
    level: 3,
    name: 'VIP会员',
    requiredPoints: 500,
    role: 'vip_member',
    fieldPermissions: {
      can_view_cost_price: false,
      can_view_min_price: true,
      can_view_manufacturer: true,
      can_view_contact: true,
      can_view_phone: false,
    },
    modulePermissions: ['chat', 'quote', 'history', 'export'],
    quotas: { daily_quota: 50, max_files: 30, max_chat_messages: 500 },
  },
  {
    level: 4,
    name: '企业会员',
    requiredPoints: 2000,
    role: 'enterprise_member',
    fieldPermissions: {
      can_view_cost_price: true,
      can_view_min_price: true,
      can_view_manufacturer: true,
      can_view_contact: true,
      can_view_phone: true,
    },
    modulePermissions: ['chat', 'quote', 'history', 'export', 'analytics'],
    quotas: { daily_quota: 100, max_files: 100, max_chat_messages: 1000 },
  },
  {
    level: 5,
    name: '超级会员',
    requiredPoints: 10000,
    role: 'super_member',
    fieldPermissions: {
      can_view_cost_price: true,
      can_view_min_price: true,
      can_view_manufacturer: true,
      can_view_contact: true,
      can_view_phone: true,
    },
    modulePermissions: ['chat', 'quote', 'history', 'export', 'analytics', 'api'],
    quotas: { daily_quota: 0, max_files: 0, max_chat_messages: 0 }, // 0 表示不限制
  },
];

/**
 * 等级配置存储服务类
 */
export class LevelConfigStore {
  private static instance: LevelConfigStore;
  private configs: Map<number, LevelFullConfig> = new Map();
  private initialized = false;

  private constructor() {}

  static getInstance(): LevelConfigStore {
    if (!LevelConfigStore.instance) {
      LevelConfigStore.instance = new LevelConfigStore();
    }
    return LevelConfigStore.instance;
  }

  /**
   * 初始化配置（从持久化存储加载）
   */
  private ensureInitialized(): void {
    if (this.initialized) return;

    // 尝试从文件系统加载（服务器端）
    if (typeof window === 'undefined') {
      // 服务器端使用默认配置
      DEFAULT_LEVELS.forEach(config => {
        this.configs.set(config.level, config);
      });
    } else {
      // 客户端尝试从 localStorage 加载
      try {
        const stored = localStorage.getItem(STORAGE_KEY);
        if (stored) {
          const parsed = JSON.parse(stored);
          if (Array.isArray(parsed)) {
            parsed.forEach((config: LevelFullConfig) => {
              this.configs.set(config.level, config);
            });
          }
        }
      } catch (e) {
        console.error('[LevelConfigStore] 加载配置失败:', e);
      }

      // 如果没有存储的配置，使用默认值
      if (this.configs.size === 0) {
        DEFAULT_LEVELS.forEach(config => {
          this.configs.set(config.level, config);
        });
      }
    }

    this.initialized = true;
  }

  /**
   * 保存配置到持久化存储
   */
  private persist(): void {
    if (typeof window !== 'undefined') {
      try {
        const configs = Array.from(this.configs.values());
        localStorage.setItem(STORAGE_KEY, JSON.stringify(configs));
        console.log('[LevelConfigStore] 配置已持久化');
      } catch (e) {
        console.error('[LevelConfigStore] 持久化失败:', e);
      }
    }
  }

  /**
   * 获取所有等级配置
   */
  getAllLevels(): LevelFullConfig[] {
    this.ensureInitialized();
    return Array.from(this.configs.values()).sort((a, b) => a.level - b.level);
  }

  /**
   * 获取单个等级配置
   */
  getLevel(level: number): LevelFullConfig | null {
    this.ensureInitialized();
    return this.configs.get(level) || null;
  }

  /**
   * 更新等级配置
   */
  updateLevel(level: number, changes: Partial<LevelFullConfig>): LevelFullConfig | null {
    this.ensureInitialized();
    
    const existing = this.configs.get(level);
    if (!existing) {
      console.error('[LevelConfigStore] 等级不存在:', level);
      return null;
    }

    // 合并更新
    const updated: LevelFullConfig = {
      ...existing,
      ...changes,
      fieldPermissions: {
        ...existing.fieldPermissions,
        ...(changes.fieldPermissions || {}),
      },
      quotas: {
        ...existing.quotas,
        ...(changes.quotas || {}),
      },
      modulePermissions: changes.modulePermissions || existing.modulePermissions,
    };

    this.configs.set(level, updated);
    this.persist();

    console.log('[LevelConfigStore] 等级配置已更新:', level, updated);
    return updated;
  }

  /**
   * 重置为默认配置
   */
  resetToDefaults(): void {
    this.configs.clear();
    DEFAULT_LEVELS.forEach(config => {
      this.configs.set(config.level, config);
    });
    this.persist();
    console.log('[LevelConfigStore] 已重置为默认配置');
  }
}

// 导出单例
export const levelConfigStore = LevelConfigStore.getInstance();
