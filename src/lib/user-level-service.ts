import { getSupabaseClient } from '@/storage/database/supabase-client';

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
      console.log('[UserLevelService] 获取用户等级:', userId);

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

      // 如果用户没有等级记录，初始化为等级1
      const level = userLevel?.level || 1;
      const currentPoints = userLevel?.current_points || 0;

      // 2. 获取等级定义
      const levelConfig = await this.getLevelDefinition(level);
      if (!levelConfig) {
        console.error('[UserLevelService] 未找到等级定义:', level);
        return null;
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
        config: levelConfig
      };
    } catch (error) {
      console.error('[UserLevelService] 获取用户等级异常:', error);
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
      console.log('[UserLevelService] 添加积分:', { userId, points, description });

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
          user_id: Number(userId),
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
            user_id: Number(userId),
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

      console.log('[UserLevelService] 检查升级:', { userId, currentPoints });

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
      console.log('[UserLevelService] 发现可升级等级:', nextLevel);

      // 3. 执行升级
      const { error: updateError } = await this.supabase
        .from('user_levels')
        .update({
          level: nextLevel.level,
          level_up_at: new Date().toISOString()
        })
        .eq('user_id', userId);

      if (updateError) {
        console.error('[UserLevelService] 升级失败:', updateError);
        return { upgraded: false };
      }

      // 4. 记录升级历史
      await this.supabase
        .from('level_upgrade_history')
        .insert({
          user_id: Number(userId),
          from_level: currentLevel,
          to_level: nextLevel.level,
          points_at_upgrade: currentPoints
        });

      console.log('[UserLevelService] 升级成功:', {
        userId,
        from: currentLevel,
        to: nextLevel.level
      });

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
   * 设置用户等级（管理员功能）
   * @param userId 用户ID
   * @param level 新等级
   * @returns 是否成功
   */
  async setUserLevel(userId: string | number, level: number): Promise<boolean> {
    try {
      console.log('[UserLevelService] 设置用户等级:', { userId, level });

      // 验证等级是否存在
      const levelConfig = await this.getLevelDefinition(level);
      if (!levelConfig) {
        console.error('[UserLevelService] 无效的等级:', level);
        return false;
      }

      const { error } = await this.supabase
        .from('user_levels')
        .upsert({
          user_id: Number(userId),
          level,
          current_points: levelConfig.required_points,
          next_level_points: levelConfig.required_points,
          level_up_at: new Date().toISOString()
        }, {
          onConflict: 'user_id'
        });

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
}

// 导出单例实例
export const userLevelService = new UserLevelService();
