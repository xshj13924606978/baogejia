/**
 * 等级配置本地存储服务
 * 用于在没有数据库的情况下持久化等级配置
 */

import { LevelFullConfig } from './user-level-service';
// #202608302400 阶段1：等级名称/阈值统一来源，消除本文件内的硬编码等级体系
// #202608302400 阶段3：字段权限矩阵同样取自统一常量（与 product-visibility 运行时共用）
import { FIELD_DEFAULT_PERMISSIONS, LEVEL_METAS } from './level-constants';

const STORAGE_KEY = 'level_configs';

/**
 * 默认字段权限矩阵（引用统一常量，与迁移 073 种子一致）
 */
const DEFAULT_FIELD_PERMISSIONS = FIELD_DEFAULT_PERMISSIONS;

/**
 * 默认模块权限（与迁移 073 member_module_permissions 种子一致：
 * 所有等级开放 智能对话 / 报价生成 / 历史记录，编辑与预览关闭）
 */
const DEFAULT_MODULE_PERMISSIONS = ['chat', 'quote_generate', 'history'];

// 默认等级配置（名称与阈值来自统一常量 LEVEL_METAS）
const DEFAULT_LEVELS: LevelFullConfig[] = LEVEL_METAS.map((meta) => ({
  level: meta.level,
  name: meta.name,
  requiredPoints: meta.requiredPoints,
  role: meta.role,
  fieldPermissions: DEFAULT_FIELD_PERMISSIONS[meta.level],
  modulePermissions: [...DEFAULT_MODULE_PERMISSIONS],
  quotas: {
    daily_quota: meta.dailyQuota,
    max_files: meta.maxFiles,
    max_chat_messages: meta.maxChatMessages,
  },
}));

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
  }
}

// 导出单例
export const levelConfigStore = LevelConfigStore.getInstance();
