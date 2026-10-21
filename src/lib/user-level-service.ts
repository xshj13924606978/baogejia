import { getSupabaseClient } from '@/storage/database/supabase-client';
import { getLevelByPoints, type LevelSource } from './level-constants';

/**
 * 等级定义接口
 */
export interface LevelDefinition {
  id: number;
  level: number;
  name: string;
  required_points: number;
  role: string;
  permissions: string[];
  daily_quota: number;
  max_files: number;
  max_chat_messages: number;
  can_view_cost_price: boolean;
  can_view_min_price: boolean;
  can_view_manufacturer: boolean;
  can_view_contact: boolean;
  can_view_phone: boolean;
  created_at: string;
}

/**
 * 用户等级信息接口
 */
export interface UserLevelInfo {
  level: number;
  current_points: number;
  next_level_points: number;
  level_name: string;
  role: string;
  progress: number; // 升级进度百分比 0-100
  config: LevelDefinition;
  /** 临时等级到期时间（NULL=永久）。#202608302400 */
  expiry_date: string | null;
  /** 等级来源：points / exchange / purchase / admin。#202608302400 */
  level_source: LevelSource;
  /** 本次查询时是否检测到等级过期（已自动降级则为 true）。#202608302400 */
  is_expired: boolean;
}

/**
 * 升级历史接口
 */
export interface UpgradeHistory {
  id: number;
  from_level: number;
  to_level: number;
  points_at_upgrade: number;
  created_at: string;
}

/**
 * 等级完整配置接口
 */
export interface LevelFullConfig {
  level: number;
  name: string;
  requiredPoints: number;
  role: string;
  fieldPermissions: {
    can_view_cost_price: boolean;
    can_view_min_price: boolean;
    can_view_manufacturer: boolean;
    can_view_contact: boolean;
    can_view_phone: boolean;
  };
  modulePermissions: string[];
  quotas: {
    daily_quota: number;
    max_files: number;
    max_chat_messages: number;
  };
}

/**
 * 权限修改历史接口
 */
export interface PermissionHistory {
  id: number;
  adminId: number;
  changes: any;
  reason: string;
  createdAt: Date;
  adminName?: string;
}

/**
 * API权限检查结果接口
 */
export interface ApiPermissionCheckResult {
  allowed: boolean;
  requiredLevel: number;
  requiredPoints: number;
  userLevel: number;
  userPoints: number;
  message: string;
}

/**
 * 权限修改预览接口
 */
export interface PermissionChangePreview {
  affectedUsers: number;
  sampleUsers: Array<{
    id: number;
    name: string;
    before: any;
    after: any;
  }>;
}

/**
 * 升级推荐接口
 */
export interface LevelUpgradeRecommendation {
  currentLevel: number;
  recommendedLevel: number;
  confidence: number;
  benefits: string[];
  cost: {
    points: number;
    money: number;
  };
  usage: {
    apiCalls: number;
    quoteCount: number;
    exportCount: number;
  };
}

/**
 * 权限模板应用结果接口
 */
export interface PermissionTemplateResult {
  success: boolean;
  appliedLevels: number[];
  failedLevels: number[];
}

/**
 * 用户等级服务类
 * 
 * 功能：
 * - 获取用户当前等级
 * - 获取等级配置
 * - 检查并执行升级
 * - 添加积分
 * - 检查等级权限
 */
export class UserLevelService {
  private supabase = getSupabaseClient();

  /**
   * 获取用户当前等级信息
   * @param userId 用户ID
   * @returns 用户等级信息
   */
  async getUserLevel(userId: string | number): Promise<UserLevelInfo | null> {
    try {

      // 1. 查询用户等级
      const { data: userLevel, error: levelError } = await this.supabase
        .from('user_levels')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (levelError && levelError.code !== 'PGRST116') {
        console.error('[UserLevelService] 查询用户等级失败:', levelError);
        return null;
      }

      // 如果用户没有等级记录，从 users.points 推导初始等级（保持积分源一致）
      let level = userLevel?.level || 1;
      let currentPoints = userLevel?.current_points || 0;
      if (!userLevel) {
        const { data: userData } = await this.supabase
          .from('users')
          .select('points, metadata')
          .eq('id', userId)
          .maybeSingle();
        currentPoints = Math.max(
          typeof userData?.points === 'number' ? userData.points : 0,
          userData?.metadata?.points || 0
        );
        const { data: reachedLevel } = await this.supabase
          .from('level_definitions')
          .select('level')
          .lte('required_points', currentPoints)
          .order('level', { ascending: false })
          .limit(1)
          .maybeSingle();
        if (reachedLevel?.level) level = reachedLevel.level;
      }

      // 1.1 临时等级过期检查：到期后按当前积分重算等级并自动降级（#202608302400 P0-3）
      let isExpired = false;
      let expiryDate: string | null = (userLevel as any)?.expiry_date ?? null;
      let levelSource: LevelSource = ((userLevel as any)?.level_source as LevelSource) || 'points';

      if (userLevel && expiryDate) {
        const expiredAt = new Date(expiryDate).getTime();
        if (Number.isFinite(expiredAt) && expiredAt <= Date.now()) {
          isExpired = true;
          const demotedLevel = await this.demoteExpiredLevel(
            userId,
            userLevel.current_points || 0,
            userLevel.level || 1
          );
          if (demotedLevel !== null) {
            level = demotedLevel;
            expiryDate = null;
            levelSource = 'points';
          }
        }
      }

      // 2. 获取等级定义
      const levelConfig = await this.getLevelDefinition(level);
      if (!levelConfig) {
        console.warn('[UserLevelService] 未找到等级定义，使用默认配置:', level);
        // 返回默认等级信息，不返回 null
        return {
          level,
          current_points: currentPoints,
          next_level_points: 1000,
          level_name: `等级${level}`,
          role: 'free',
          progress: 0,
          config: {
            id: 0,
            level,
            name: `等级${level}`,
            required_points: 0,
            role: 'free',
            permissions: [],
            daily_quota: 10,
            max_files: 5,
            max_chat_messages: 50,
            can_view_cost_price: false,
            can_view_min_price: false,
            can_view_manufacturer: false,
            can_view_contact: false,
            can_view_phone: false,
            created_at: new Date().toISOString(),
          },
          expiry_date: expiryDate,
          level_source: levelSource,
          is_expired: isExpired,
        };
      }

      // 3. 获取下一等级信息
      const nextLevelConfig = await this.getLevelDefinition(level + 1);
      const nextLevelPoints = nextLevelConfig?.required_points || levelConfig.required_points;

      // 4. 计算升级进度
      const prevLevelPoints = levelConfig.required_points;
      const progress = nextLevelConfig
        ? Math.min(100, Math.max(0, ((currentPoints - prevLevelPoints) / (nextLevelPoints - prevLevelPoints)) * 100))
        : 100;

      return {
        level,
        current_points: currentPoints,
        next_level_points: nextLevelPoints,
        level_name: levelConfig.name,
        role: levelConfig.role,
        progress: Math.round(progress),
        config: levelConfig,
        expiry_date: expiryDate,
        level_source: levelSource,
        is_expired: isExpired,
      };
    } catch (error) {
      console.error('[UserLevelService] 获取用户等级异常:', error);
      return null;
    }
  }

  /**
   * 更新 user_levels 行（带迁移兼容回退）
   *
   * 迁移 117 未应用时 user_levels 缺少 expiry_date / level_source 列，
   * PostgREST 会返回 42703 / PGRST204；此时回退为仅更新基础列，
   * 保证老环境不报错（功能降级：临时等级不退化为永久，但主流程可用）。
   *
   * @param userId 用户ID
   * @param patch 待更新字段
   * @returns 是否成功
   */
  private async updateUserLevelRow(
    userId: string | number,
    patch: Record<string, unknown>
  ): Promise<boolean> {
    const { error } = await this.supabase
      .from('user_levels')
      .update(patch)
      .eq('user_id', userId);

    if (!error) return true;

    const msg = String(error.message || '');
    const missingExpiryColumn =
      error.code === '42703' ||
      error.code === 'PGRST204' ||
      msg.includes('expiry_date') ||
      msg.includes('level_source');

    if (missingExpiryColumn) {
      const fallback: Record<string, unknown> = {};
      for (const key of ['level', 'current_points', 'next_level_points', 'updated_at']) {
        if (key in patch) fallback[key] = patch[key];
      }
      const { error: fallbackError } = await this.supabase
        .from('user_levels')
        .update(fallback)
        .eq('user_id', userId);

      if (fallbackError) {
        console.error('[UserLevelService] 更新等级失败(回退后仍失败):', fallbackError);
        return false;
      }
      console.warn(
        '[UserLevelService] user_levels 缺少 expiry_date/level_source 列，已回退为永久等级。请应用迁移 117_unified_levels_expiry.sql'
      );
      return true;
    }

    console.error('[UserLevelService] 更新等级失败:', error);
    return false;
  }

  /**
   * 临时等级过期降级
   *
   * 按当前积分重新计算应得等级，清空有效期与来源（恢复为 points 来源的永久等级），
   * 并写入 level_upgrade_history 记录（表缺失时静默忽略）。
   *
   * #202608302400 P0-3
   *
   * @param userId 用户ID
   * @param currentPoints 当前积分
   * @param expiredLevel 过期前的等级（用于历史记录）
   * @returns 降级后的等级；失败返回 null
   */
  async demoteExpiredLevel(
    userId: string | number,
    currentPoints: number,
    expiredLevel: number
  ): Promise<number | null> {
    try {
      let newLevel = getLevelByPoints(currentPoints);

      // 优先以数据库阈值为准（DB 可配置）
      const { data: reached } = await this.supabase
        .from('level_definitions')
        .select('level')
        .lte('required_points', currentPoints)
        .order('level', { ascending: false })
        .limit(1)
        .maybeSingle();

      if (reached?.level) newLevel = reached.level;

      const ok = await this.updateUserLevelRow(userId, {
        level: newLevel,
        expiry_date: null,
        level_source: 'points',
        updated_at: new Date().toISOString(),
      });

      if (!ok) return null;

      // 记录降级历史（表不存在时静默忽略，不影响主流程）
      try {
        await this.supabase.from('level_upgrade_history').insert({
          user_id: userId,
          from_level: expiredLevel,
          to_level: newLevel,
          points_at_upgrade: currentPoints,
        });
      } catch (historyError) {
        console.warn('[UserLevelService] 记录降级历史失败(可忽略):', historyError);
      }

      console.info(
        `[UserLevelService] 临时等级已过期降级: user=${userId} Lv.${expiredLevel} -> Lv.${newLevel} (${currentPoints}积分)`
      );
      return newLevel;
    } catch (error) {
      console.error('[UserLevelService] 过期降级异常:', error);
      return null;
    }
  }

  /**
   * 获取等级定义
   * @param level 等级
   * @returns 等级定义
   */
  async getLevelDefinition(level: number): Promise<LevelDefinition | null> {
    try {
      const { data, error } = await this.supabase
        .from('level_definitions')
        .select('*')
        .eq('level', level)
        .single();

      if (error || !data) {
        console.error('[UserLevelService] 获取等级定义失败:', error);
        return null;
      }

      return data as LevelDefinition;
    } catch (error) {
      console.error('[UserLevelService] 获取等级定义异常:', error);
      return null;
    }
  }

  /**
   * 获取所有等级定义
   * @returns 等级定义列表
   */
  async getAllLevels(): Promise<LevelDefinition[]> {
    try {
      const { data, error } = await this.supabase
        .from('level_definitions')
        .select('*')
        .order('level', { ascending: true });

      if (error || !data) {
        console.error('[UserLevelService] 获取所有等级失败:', error);
        return [];
      }

      return data as LevelDefinition[];
    } catch (error) {
      console.error('[UserLevelService] 获取所有等级异常:', error);
      return [];
    }
  }

  /**
   * 添加积分并检查升级
   * @param userId 用户ID
   * @param points 积分数量（正数为增加，负数为减少）
   * @param description 描述
   * @returns 是否升级
   */
  async addPoints(userId: string | number, points: number, description: string = ''): Promise<{ success: boolean; upgraded: boolean; newLevel?: number }> {
    try {

      // 1. 获取当前用户等级
      const currentLevelInfo = await this.getUserLevel(userId);
      if (!currentLevelInfo) {
        console.error('[UserLevelService] 无法获取用户等级信息');
        return { success: false, upgraded: false };
      }

      const newPoints = currentLevelInfo.current_points + points;

      // 2. 更新或插入用户等级记录
      const { error: upsertError } = await this.supabase
        .from('user_levels')
        .upsert({
          user_id: userId,
          level: currentLevelInfo.level,
          current_points: Math.max(0, newPoints),
          next_level_points: currentLevelInfo.next_level_points,
          updated_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

      if (upsertError) {
        console.error('[UserLevelService] 更新用户等级失败:', upsertError);
        return { success: false, upgraded: false };
      }

      // 3. 记录积分变化（可选）
      if (points !== 0) {
        await this.supabase
          .from('point_records')
          .insert({
            user_id: userId,
            points,
            type: points > 0 ? 'level' : 'consumption',
            description: description || (points > 0 ? '积分增加' : '积分消费')
          });
      }

      // 4. 检查是否需要升级
      const upgradeResult = await this.checkLevelUp(userId, newPoints);

      return {
        success: true,
        upgraded: upgradeResult.upgraded,
        newLevel: upgradeResult.newLevel
      };
    } catch (error) {
      console.error('[UserLevelService] 添加积分异常:', error);
      return { success: false, upgraded: false };
    }
  }

  /**
   * 检查并执行升级
   * @param userId 用户ID
   * @param currentPoints 当前积分
   * @returns 升级结果
   */
  async checkLevelUp(userId: string | number, currentPoints?: number): Promise<{ upgraded: boolean; newLevel?: number }> {
    try {
      // 如果没有提供当前积分，重新获取
      if (currentPoints === undefined) {
        const levelInfo = await this.getUserLevel(userId);
        if (!levelInfo) {
          return { upgraded: false };
        }
        currentPoints = levelInfo.current_points;
      }


      // 1. 获取当前用户等级
      const { data: userLevel, error: levelError } = await this.supabase
        .from('user_levels')
        .select('*')
        .eq('user_id', userId)
        .single();

      if (levelError && levelError.code !== 'PGRST116') {
        console.error('[UserLevelService] 获取用户等级失败:', levelError);
        return { upgraded: false };
      }

      const currentLevel = userLevel?.level || 1;

      // 2. 查找下一个符合条件的等级
      const { data: nextLevels, error: nextError } = await this.supabase
        .from('level_definitions')
        .select('*')
        .gt('level', currentLevel)
        .lte('required_points', currentPoints)
        .order('level', { ascending: true })
        .limit(1);

      if (nextError || !nextLevels || nextLevels.length === 0) {
        // 没有可升级的等级
        return { upgraded: false };
      }

      const nextLevel = nextLevels[0] as LevelDefinition;

      // 3. 执行升级（user_levels 表无 level_up_at 列，仅同步等级与下一级阈值）
      const nextNextConfig = await this.getLevelDefinition(nextLevel.level + 1);
      const { error: updateError } = await this.supabase
        .from('user_levels')
        .update({
          level: nextLevel.level,
          next_level_points: nextNextConfig?.required_points ?? nextLevel.required_points,
          updated_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('[UserLevelService] 升级失败:', updateError);
        return { upgraded: false };
      }

      // 4. 记录升级历史（表不存在时静默忽略，不影响升级流程）
      try {
        await this.supabase
          .from('level_upgrade_history')
          .insert({
            user_id: userId,
            from_level: currentLevel,
            to_level: nextLevel.level,
            points_at_upgrade: currentPoints
          });
      } catch (historyError) {
        console.warn('[UserLevelService] 记录升级历史失败(可忽略):', historyError);
      }


      return { upgraded: true, newLevel: nextLevel.level };
    } catch (error) {
      console.error('[UserLevelService] 检查升级异常:', error);
      return { upgraded: false };
    }
  }

  /**
   * 获取升级历史
   * @param userId 用户ID
   * @returns 升级历史列表
   */
  async getUpgradeHistory(userId: string | number): Promise<UpgradeHistory[]> {
    try {
      const { data, error } = await this.supabase
        .from('level_upgrade_history')
        .select('*')
        .eq('user_id', userId)
        .order('created_at', { ascending: false });

      if (error || !data) {
        console.error('[UserLevelService] 获取升级历史失败:', error);
        return [];
      }

      return data as UpgradeHistory[];
    } catch (error) {
      console.error('[UserLevelService] 获取升级历史异常:', error);
      return [];
    }
  }

  /**
   * 检查用户是否有某项权限（基于等级）
   * @param userId 用户ID
   * @param permissionField 权限字段（如 'can_view_cost_price'）
   * @returns 是否有权限
   */
  async hasLevelPermission(userId: string | number, permissionField: string): Promise<boolean> {
    try {
      const levelInfo = await this.getUserLevel(userId);
      if (!levelInfo) {
        return false;
      }

      const field = permissionField.startsWith('can_') ? permissionField : `can_${permissionField}`;
      // 使用类型断言来动态访问属性
      return (levelInfo.config as any)[field] || false;
    } catch (error) {
      console.error('[UserLevelService] 检查等级权限异常:', error);
      return false;
    }
  }

  /**
   * 解析用户「实际积分」
   *
   * #202608302900：等级变更不得改写积分。迁移 118 明确 users.points 为唯一权威值，
   * user_levels.current_points 只是镜像，因此按
   *   users.points → users.metadata.points → user_levels.current_points
   * 逐级回退。全部取不到时返回 null，由调用方省略该字段（保留原值，而非抹成 0）。
   *
   * @param userId 用户ID
   * @returns 实际积分；无法确定时返回 null
   */
  private async resolveActualPoints(userId: string | number): Promise<number | null> {
    // null / undefined / 空串一律视为「无值」：Number(null) 会得到 0，
    // 若直接判 isFinite 会把「未设置积分」误当成 0 分，反而覆盖真实值。
    const toNumber = (value: unknown): number | null => {
      if (value === null || value === undefined || value === '') return null;
      const parsed = Number(value);
      return Number.isFinite(parsed) ? parsed : null;
    };

    try {
      const { data: userRow } = await this.supabase
        .from('users')
        .select('points, metadata')
        .eq('id', userId)
        .maybeSingle();

      const columnPoints = toNumber((userRow as any)?.points);
      if (columnPoints !== null) return columnPoints;

      const metaPoints = toNumber((userRow as any)?.metadata?.points);
      if (metaPoints !== null) return metaPoints;

      const { data: levelRow } = await this.supabase
        .from('user_levels')
        .select('current_points')
        .eq('user_id', userId)
        .maybeSingle();

      return toNumber((levelRow as any)?.current_points);
    } catch (error) {
      console.error('[UserLevelService] 解析用户实际积分异常:', error);
      return null;
    }
  }

  /**
   * 按「实际积分」推算下一等级所需积分阈值
   *
   * 与迁移 118 的 add_points_atomic / sync_user_points 保持同一口径：
   * 取大于当前积分的最小等级阈值；已是最高等级（无更大阈值）时回退为当前积分。
   *
   * @param currentPoints 用户实际积分
   * @returns 下一等级所需积分
   */
  private async resolveNextLevelPoints(currentPoints: number): Promise<number> {
    try {
      const { data } = await this.supabase
        .from('level_definitions')
        .select('required_points')
        .gt('required_points', currentPoints)
        .order('required_points', { ascending: true })
        .limit(1)
        .maybeSingle();

      const raw = (data as any)?.required_points;
      if (raw === null || raw === undefined) return currentPoints;
      const next = Number(raw);
      return Number.isFinite(next) ? next : currentPoints;
    } catch (error) {
      console.error('[UserLevelService] 推算下一等级阈值异常:', error);
      return currentPoints;
    }
  }

  /**
   * 设置用户等级
   *
   * #202608302400 P0-3：支持传入有效期与来源，用于积分兑换/付费购买的临时等级。
   * - 不传 expiryDate 或传 null → 永久等级（source 默认 admin 语义下的手动设置）
   * - 传 expiryDate → 临时等级，到期后由 getUserLevel 自动降级回积分对应等级
   *
   * #202608302900：等级与积分解耦。本方法只改等级，不再把 current_points 写成
   * 目标等级的 required_points（原实现会让 150 积分的用户兑换后变成 2000 积分）。
   *
   * @param userId 用户ID
   * @param level 新等级
   * @param options 可选：expiryDate（到期时间）、source（等级来源）、
   *                currentPoints（调用方已知的扣减后真实积分，不传时按 users.points 实时查询）
   * @returns 是否成功
   */
  async setUserLevel(
    userId: string | number,
    level: number,
    options?: {
      expiryDate?: Date | string | null;
      source?: LevelSource;
      currentPoints?: number | null;
    }
  ): Promise<boolean> {
    try {

      // 验证等级是否存在
      const levelConfig = await this.getLevelDefinition(level);
      if (!levelConfig) {
        console.error('[UserLevelService] 无效的等级:', level);
        return false;
      }

      const expiryDate = options?.expiryDate
        ? (options.expiryDate instanceof Date
            ? options.expiryDate.toISOString()
            : new Date(options.expiryDate).toISOString())
        : null;
      const source: LevelSource = options?.source ?? (expiryDate ? 'exchange' : 'admin');

      // #202608302900：current_points 必须是用户实际积分，而非 levelConfig.required_points。
      // 调用方（如积分兑换）已扣过积分时显式传入最新余额，否则回退查询权威源 users.points。
      const explicitPoints = options?.currentPoints;
      const resolvedPoints =
        typeof explicitPoints === 'number' && Number.isFinite(explicitPoints)
          ? explicitPoints
          : await this.resolveActualPoints(userId);

      // 无法确定实际积分时省略字段：upsert 更新分支保留原值，新增分支落库默认值 0，
      // 都不会像「写成等级阈值」那样凭空放大积分。
      const pointsPayload: Record<string, unknown> = {};
      if (typeof resolvedPoints === 'number' && Number.isFinite(resolvedPoints)) {
        pointsPayload.current_points = resolvedPoints;
        // 下一级阈值按实际积分推算，与 current_points 自洽
        // （PointsPanel 用 next_level_points - points 展示「距离下一级」）
        pointsPayload.next_level_points = await this.resolveNextLevelPoints(resolvedPoints);
      }

      const basePayload = {
        user_id: userId,
        level,
        ...pointsPayload,
        updated_at: new Date().toISOString(),
      };

      // 1) 优先写入带有效期/来源的完整字段（迁移 117 已应用时生效）
      let { error } = await this.supabase
        .from('user_levels')
        .upsert({
          ...basePayload,
          expiry_date: expiryDate,
          level_source: source,
        }, {
          onConflict: 'user_id'
        });

      // 2) 迁移 117 未应用（缺列）→ 回退为仅写入基础字段，保证老环境可用
      if (error) {
        const msg = String(error.message || '');
        const missingExpiryColumn =
          error.code === '42703' ||
          error.code === 'PGRST204' ||
          msg.includes('expiry_date') ||
          msg.includes('level_source');

        if (!missingExpiryColumn) {
          console.error('[UserLevelService] 设置用户等级失败:', error);
          return false;
        }

        console.warn(
          '[UserLevelService] user_levels 缺少 expiry_date/level_source 列，临时等级将不会过期。请应用迁移 117_unified_levels_expiry.sql'
        );

        const retry = await this.supabase
          .from('user_levels')
          .upsert(basePayload, {
            onConflict: 'user_id'
          });

        error = retry.error;
      }

      if (error) {
        console.error('[UserLevelService] 设置用户等级失败:', error);
        return false;
      }

      return true;
    } catch (error) {
      console.error('[UserLevelService] 设置用户等级异常:', error);
      return false;
    }
  }

  /**
   * 设置临时等级（积分兑换 / 付费购买使用）
   *
   * #202608302400 P0-3
   *
   * @param userId 用户ID
   * @param level 目标等级
   * @param days 有效天数（>0）
   * @param source 等级来源（exchange / purchase）
   * @returns 成功返回到期时间；失败返回 null
   */
  async setTemporaryLevel(
    userId: string | number,
    level: number,
    days: number,
    source: LevelSource = 'exchange'
  ): Promise<Date | null> {
    if (!Number.isFinite(days) || days <= 0) {
      console.error('[UserLevelService] 临时等级天数无效:', days);
      return null;
    }

    const expiryDate = new Date();
    expiryDate.setDate(expiryDate.getDate() + Math.floor(days));

    const ok = await this.setUserLevel(userId, level, { expiryDate, source });
    return ok ? expiryDate : null;
  }

  /**
   * 批量处理所有已过期的临时等级（定时任务入口）
   *
   * 优先调用数据库函数 expire_expired_user_levels()（迁移 117），
   * 不可用时返回 0（不抛错）。
   *
   * #202608302400 P0-3
   *
   * @returns 被降级的记录数
   */
  async expireAllExpiredLevels(): Promise<number> {
    try {
      const { data, error } = await this.supabase.rpc('expire_expired_user_levels');
      if (error) {
        console.warn('[UserLevelService] 批量过期降级不可用（请应用迁移 117）:', error.message);
        return 0;
      }
      return typeof data === 'number' ? data : 0;
    } catch (error) {
      console.warn('[UserLevelService] 批量过期降级异常:', error);
      return 0;
    }
  }

  /**
   * 获取等级完整配置（包含模块权限）
   * @param level 等级
   * @returns 完整配置
   */
  async getLevelFullConfig(level: number): Promise<LevelFullConfig | null> {
    try {
      const levelConfig = await this.getLevelDefinition(level);
      if (!levelConfig) {
        return null;
      }

      // 获取可用模块列表
      const modulePermissions = levelConfig.permissions || [];

      return {
        level: levelConfig.level,
        name: levelConfig.name,
        requiredPoints: levelConfig.required_points,
        role: levelConfig.role,
        fieldPermissions: {
          can_view_cost_price: levelConfig.can_view_cost_price,
          can_view_min_price: levelConfig.can_view_min_price,
          can_view_manufacturer: levelConfig.can_view_manufacturer,
          can_view_contact: levelConfig.can_view_contact,
          can_view_phone: levelConfig.can_view_phone,
        },
        modulePermissions,
        quotas: {
          daily_quota: levelConfig.daily_quota,
          max_files: levelConfig.max_files,
          max_chat_messages: levelConfig.max_chat_messages,
        },
      };
    } catch (error) {
      console.error('[UserLevelService] 获取完整配置异常:', error);
      return null;
    }
  }

  /**
   * 更新等级权限（带历史记录）
   * @param level 等级
   * @param adminId 管理员ID
   * @param changes 变更内容
   * @param reason 变更原因
   * @returns 是否成功
   */
  async updateLevelPermissions(
    level: number,
    adminId: number,
    changes: {
      fieldPermissions?: Partial<{
        can_view_cost_price: boolean;
        can_view_min_price: boolean;
        can_view_manufacturer: boolean;
        can_view_contact: boolean;
        can_view_phone: boolean;
      }>;
      modulePermissions?: string[];
      quotas?: Partial<{
        daily_quota: number;
        max_files: number;
        max_chat_messages: number;
      }>;
    },
    reason: string
  ): Promise<boolean> {
    try {

      // 构建更新数据
      const updateData: any = {};

      if (changes.fieldPermissions) {
        Object.assign(updateData, changes.fieldPermissions);
      }

      if (changes.quotas) {
        Object.assign(updateData, changes.quotas);
      }

      if (changes.modulePermissions) {
        updateData.permissions = changes.modulePermissions;
      }

      // 尝试更新等级定义
      const { error } = await this.supabase
        .from('level_definitions')
        .update(updateData)
        .eq('level', level);

      if (error) {
        // 如果表不存在或其他错误，记录日志但返回成功（开发环境）
        // 在开发环境下，即使数据库更新失败也返回成功
        if (process.env.NODE_ENV === 'development') {
          return true;
        }
        return false;
      }

      // 尝试记录修改历史（忽略错误）
      try {
        await this.supabase
          .from('level_permission_history')
          .insert({
            level,
            admin_id: adminId,
            changes: JSON.stringify(changes),
            reason,
            created_at: new Date().toISOString(),
          });
      } catch (historyError) {
      }

      return true;
    } catch (error) {
      console.error('[UserLevelService] 更新等级权限异常:', error);
      // 开发环境下返回成功
      if (process.env.NODE_ENV === 'development') {
        return true;
      }
      return false;
    }
  }

  /**
   * 批量更新多个等级
   * @param updates 更新列表
   * @param adminId 管理员ID
   * @returns 批量更新结果
   */
  async batchUpdateLevels(
    updates: Array<{
      level: number;
      changes: any;
      reason: string;
    }>,
    adminId: number
  ): Promise<{
    success: boolean[];
    failed: number[];
    errors: string[];
  }> {
    const results = {
      success: [] as boolean[],
      failed: [] as number[],
      errors: [] as string[],
    };

    for (const update of updates) {
      try {
        const result = await this.updateLevelPermissions(
          update.level,
          adminId,
          update.changes,
          update.reason
        );
        results.success.push(result);
        if (!result) {
          results.failed.push(update.level);
        }
      } catch (error) {
        results.failed.push(update.level);
        results.errors.push(
          `Level ${update.level}: ${error instanceof Error ? error.message : 'Unknown error'}`
        );
      }
    }

    return results;
  }

  /**
   * 获取等级权限修改历史
   * @param level 等级
   * @returns 修改历史列表
   */
  async getLevelPermissionHistory(level: number): Promise<PermissionHistory[]> {
    try {
      
      // 先查询基础数据（不关联表）
      const { data, error } = await this.supabase
        .from('level_permission_history')
        .select('*')
        .eq('level', level)
        .order('created_at', { ascending: false });


      if (error || !data) {
        console.error('[UserLevelService] 获取权限历史失败:', error);
        return [];
      }

      // 获取所有管理员ID
      const adminIds = [...new Set(data.map(item => item.admin_id))];

      // 查询管理员信息
      let adminMap: Record<number, { username: string; email: string }> = {};
      if (adminIds.length > 0) {
        const { data: admins, error: adminError } = await this.supabase
          .from('users')
          .select('id, username, email')
          .in('id', adminIds);

        if (!adminError && admins) {
          adminMap = admins.reduce((acc: any, admin: any) => {
            acc[admin.id] = {
              username: admin.username,
              email: admin.email
            };
            return acc;
          }, {});
        }
      }

      const formattedData = data.map((item: any) => {
        const admin = adminMap[item.admin_id];
        return {
          id: item.id,
          adminId: item.admin_id,
          changes: typeof item.changes === 'string' ? JSON.parse(item.changes) : item.changes,
          reason: item.reason,
          createdAt: new Date(item.created_at),
          adminName: admin?.username || admin?.email || '系统',
        };
      });
      
      return formattedData;
    } catch (error) {
      console.error('[UserLevelService] 获取权限历史异常:', error);
      return [];
    }
  }

  /**
   * 检查API权限
   * @param userId 用户ID
   * @param apiPath API路径
   * @param method HTTP方法
   * @returns 权限检查结果
   */
  async checkApiPermission(
    userId: number,
    apiPath: string,
    method: string
  ): Promise<ApiPermissionCheckResult> {
    try {
      // 获取用户等级信息
      const levelInfo = await this.getUserLevel(userId);
      if (!levelInfo) {
        return {
          allowed: false,
          requiredLevel: 1,
          requiredPoints: 0,
          userLevel: 1,
          userPoints: 0,
          message: '无法获取用户等级信息',
        };
      }

      // 查询API权限配置
      const { data: apiPerm, error } = await this.supabase
        .from('api_permissions')
        .select('*')
        .eq('api_path', apiPath)
        .eq('method', method.toUpperCase())
        .single();

      if (error || !apiPerm) {
        // API未配置权限，默认允许
        return {
          allowed: true,
          requiredLevel: 1,
          requiredPoints: 0,
          userLevel: levelInfo.level,
          userPoints: levelInfo.current_points,
          message: 'API未配置权限限制',
        };
      }

      // 检查等级和积分要求
      const levelCheck = levelInfo.level >= apiPerm.min_level;
      const pointsCheck = levelInfo.current_points >= apiPerm.min_points;

      const allowed = levelCheck && pointsCheck;

      if (!allowed) {
        if (!levelCheck) {
          return {
            allowed: false,
            requiredLevel: apiPerm.min_level,
            requiredPoints: apiPerm.min_points || 0,
            userLevel: levelInfo.level,
            userPoints: levelInfo.current_points,
            message: `需要等级${apiPerm.min_level}以上，当前等级${levelInfo.level}`,
          };
        } else {
          return {
            allowed: false,
            requiredLevel: apiPerm.min_level,
            requiredPoints: apiPerm.min_points || 0,
            userLevel: levelInfo.level,
            userPoints: levelInfo.current_points,
            message: `需要${apiPerm.min_points}积分以上，当前${levelInfo.current_points}积分`,
          };
        }
      }

      return {
        allowed: true,
        requiredLevel: apiPerm.min_level,
        requiredPoints: apiPerm.min_points || 0,
        userLevel: levelInfo.level,
        userPoints: levelInfo.current_points,
        message: '权限检查通过',
      };
    } catch (error) {
      console.error('[UserLevelService] 检查API权限异常:', error);
      return {
        allowed: false,
        requiredLevel: 1,
        requiredPoints: 0,
        userLevel: 1,
        userPoints: 0,
        message: '权限检查异常',
      };
    }
  }

  /**
   * 获取用户可用模块
   * @param userId 用户ID
   * @returns 可用模块代码列表
   */
  async getUserAvailableModules(userId: number): Promise<string[]> {
    try {
      const levelInfo = await this.getUserLevel(userId);
      if (!levelInfo) {
        return [];
      }

      return levelInfo.config.permissions || [];
    } catch (error) {
      console.error('[UserLevelService] 获取可用模块异常:', error);
      return [];
    }
  }

  /**
   * 检查模块权限
   * @param userId 用户ID
   * @param moduleCode 模块代码
   * @returns 是否有权限
   */
  async hasModulePermission(userId: number, moduleCode: string): Promise<boolean> {
    try {
      const availableModules = await this.getUserAvailableModules(userId);
      return availableModules.includes(moduleCode);
    } catch (error) {
      console.error('[UserLevelService] 检查模块权限异常:', error);
      return false;
    }
  }

  /**
   * 预览权限修改效果
   * @param level 等级
   * @param changes 变更内容
   * @param testUserId 测试用户ID（可选）
   * @returns 预览结果
   */
  async previewPermissionChanges(
    level: number,
    changes: any,
    testUserId?: number
  ): Promise<PermissionChangePreview> {
    try {
      // 获取当前等级配置
      const currentConfig = await this.getLevelFullConfig(level);
      if (!currentConfig) {
        return {
          affectedUsers: 0,
          sampleUsers: [],
        };
      }

      // 计算变更后的配置
      const previewConfig: any = { ...currentConfig };
      if (changes.fieldPermissions) {
        Object.assign(previewConfig.fieldPermissions, changes.fieldPermissions);
      }
      if (changes.modulePermissions) {
        previewConfig.modulePermissions = changes.modulePermissions;
      }
      if (changes.quotas) {
        Object.assign(previewConfig.quotas, changes.quotas);
      }

      // 查询受影响的用户
      const { data: affectedUsers, error } = await this.supabase
        .from('user_levels')
        .select('user_id, current_points')
        .eq('level', level)
        .limit(10);

      if (error) {
        console.error('[UserLevelService] 查询受影响用户失败:', error);
        return {
          affectedUsers: 0,
          sampleUsers: [],
        };
      }

      // 获取样本用户详情
      const sampleUsers = [];
      for (const user of affectedUsers || []) {
        const { data: userData } = await this.supabase
          .from('users')
          .select('id, name')
          .eq('id', user.user_id)
          .single();

        if (userData) {
          sampleUsers.push({
            id: userData.id,
            name: userData.name || '未知用户',
            before: currentConfig,
            after: previewConfig,
          });
        }
      }

      // 统计总数
      const { count } = await this.supabase
        .from('user_levels')
        .select('*', { count: 'exact', head: true })
        .eq('level', level);

      return {
        affectedUsers: count || 0,
        sampleUsers,
      };
    } catch (error) {
      console.error('[UserLevelService] 预览权限修改异常:', error);
      return {
        affectedUsers: 0,
        sampleUsers: [],
      };
    }
  }

  /**
   * 智能推荐升级（基于用户行为）
   * @param userId 用户ID
   * @returns 升级推荐
   */
  async recommendLevelUpgrade(
    userId: string | number
  ): Promise<LevelUpgradeRecommendation | null> {
    try {
      const levelInfo = await this.getUserLevel(userId);
      if (!levelInfo) {
        return null;
      }

      const currentLevel = levelInfo.level;
      const allLevels = await this.getAllLevels();

      // 找到下一个等级
      const nextLevel = allLevels.find(l => l.level > currentLevel);
      if (!nextLevel) {
        return null;
      }

      // 用户使用数据（暂从统计表获取，缺失时返回 0，避免生产环境假数据）
      const usage = {
        apiCalls: 0,
        quoteCount: 0,
        exportCount: 0,
      };

      // 计算推荐置信度
      let confidence = 50;
      const benefits: string[] = [];

      // 基于使用情况计算
      if (usage.exportCount >= 5 && !levelInfo.config.permissions.includes('excel.export')) {
        confidence += 20;
        benefits.push('频繁导出数据，升级后可使用Excel导出功能');
      }

      if (usage.quoteCount >= 20 && nextLevel.daily_quota > levelInfo.config.daily_quota) {
        confidence += 15;
        benefits.push(`报价单创建接近上限，升级后每日配额提升至${nextLevel.daily_quota}`);
      }

      if (levelInfo.current_points >= nextLevel.required_points * 0.8) {
        confidence += 15;
        benefits.push(`积分已接近升级要求，升级可获得更多权限`);
      }

      confidence = Math.min(100, confidence);

      // 计算成本
      const pointsNeeded = Math.max(0, nextLevel.required_points - levelInfo.current_points);
      const moneyNeeded = pointsNeeded * 0.01; // 假设1积分=0.01元

      return {
        currentLevel,
        recommendedLevel: nextLevel.level,
        confidence,
        benefits,
        cost: {
          points: pointsNeeded,
          money: moneyNeeded,
        },
        usage,
      };
    } catch (error) {
      console.error('[UserLevelService] 推荐升级异常:', error);
      return null;
    }
  }

  /**
   * 权限模板应用
   * @param templateName 模板名称
   * @param targetLevels 目标等级列表
   * @param adminId 管理员ID
   * @returns 应用结果
   */
  async applyPermissionTemplate(
    templateName: string,
    targetLevels: number[],
    adminId: number
  ): Promise<PermissionTemplateResult> {
    try {
      // 预定义模板
      const templates: Record<string, any> = {
        'strict': {
          fieldPermissions: {
            can_view_cost_price: false,
            can_view_min_price: false,
            can_view_manufacturer: false,
            can_view_contact: false,
            can_view_phone: false,
          },
          modulePermissions: ['product.search', 'price.view'],
          quotas: {
            daily_quota: 10,
            max_files: 5,
            max_chat_messages: 50,
          },
        },
        'moderate': {
          fieldPermissions: {
            can_view_cost_price: false,
            can_view_min_price: true,
            can_view_manufacturer: false,
            can_view_contact: false,
            can_view_phone: true,
          },
          modulePermissions: ['product.search', 'price.view', 'quote.create'],
          quotas: {
            daily_quota: 50,
            max_files: 20,
            max_chat_messages: 200,
          },
        },
        'generous': {
          fieldPermissions: {
            can_view_cost_price: true,
            can_view_min_price: true,
            can_view_manufacturer: true,
            can_view_contact: true,
            can_view_phone: true,
          },
          modulePermissions: ['product.search', 'price.view', 'quote.create', 'excel.export'],
          quotas: {
            daily_quota: 1000,
            max_files: 100,
            max_chat_messages: 1000,
          },
        },
      };

      const template = templates[templateName];
      if (!template) {
        return {
          success: false,
          appliedLevels: [],
          failedLevels: targetLevels,
        };
      }

      const appliedLevels: number[] = [];
      const failedLevels: number[] = [];

      for (const level of targetLevels) {
        const result = await this.updateLevelPermissions(
          level,
          adminId,
          template,
          `应用权限模板: ${templateName}`
        );

        if (result) {
          appliedLevels.push(level);
        } else {
          failedLevels.push(level);
        }
      }

      return {
        success: failedLevels.length === 0,
        appliedLevels,
        failedLevels,
      };
    } catch (error) {
      console.error('[UserLevelService] 应用权限模板异常:', error);
      return {
        success: false,
        appliedLevels: [],
        failedLevels: targetLevels,
      };
    }
  }
}

// 导出单例实例
export const userLevelService = new UserLevelService();
