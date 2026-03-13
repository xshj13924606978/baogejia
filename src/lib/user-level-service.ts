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
      console.log('[UserLevelService] 更新等级权限:', { level, adminId, reason });

      // 获取当前配置
      const currentConfig = await this.getLevelDefinition(level);
      if (!currentConfig) {
        console.error('[UserLevelService] 等级不存在:', level);
        return false;
      }

      // 构建更新数据
      const updateData: any = {};

      if (changes.fieldPermissions) {
        // 将嵌套的 fieldPermissions 对象展开为扁平字段
        Object.assign(updateData, changes.fieldPermissions);
      }

      if (changes.quotas) {
        // 将嵌套的 quotas 对象展开为扁平字段
        Object.assign(updateData, changes.quotas);
      }

      if (changes.modulePermissions) {
        updateData.permissions = changes.modulePermissions;
      }

      // 更新等级定义
      const { error } = await this.supabase
        .from('level_definitions')
        .update(updateData)
        .eq('level', level);

      if (error) {
        console.error('[UserLevelService] 更新等级权限失败:', error);
        return false;
      }

      // 记录修改历史
      await this.supabase
        .from('level_permission_history')
        .insert({
          level,
          admin_id: adminId,
          changes: JSON.stringify(changes),
          reason,
          created_at: new Date().toISOString(),
        });

      console.log('[UserLevelService] 等级权限更新成功:', { level, adminId });
      return true;
    } catch (error) {
      console.error('[UserLevelService] 更新等级权限异常:', error);
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

    console.log('[UserLevelService] 批量更新完成:', results);
    return results;
  }

  /**
   * 获取等级权限修改历史
   * @param level 等级
   * @returns 修改历史列表
   */
  async getLevelPermissionHistory(level: number): Promise<PermissionHistory[]> {
    try {
      console.log('[UserLevelService] 查询等级历史记录, level:', level);
      
      // 先查询基础数据（不关联表）
      const { data, error } = await this.supabase
        .from('level_permission_history')
        .select('*')
        .eq('level', level)
        .order('created_at', { ascending: false });

      console.log('[UserLevelService] 查询结果:', { 
        hasData: !!data, 
        dataLength: data?.length || 0,
        error 
      });

      if (error || !data) {
        console.error('[UserLevelService] 获取权限历史失败:', error);
        return [];
      }

      // 获取所有管理员ID
      const adminIds = [...new Set(data.map(item => item.admin_id))];
      console.log('[UserLevelService] 管理员ID列表:', adminIds);

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
      
      console.log('[UserLevelService] 格式化后的历史记录数量:', formattedData.length);
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
  async recommendLevelUpgrade(userId: number): Promise<LevelUpgradeRecommendation | null> {
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

      // 模拟用户使用数据（实际应该从统计表获取）
      const usage = {
        apiCalls: Math.floor(Math.random() * 1000),
        quoteCount: Math.floor(Math.random() * 50),
        exportCount: Math.floor(Math.random() * 10),
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
