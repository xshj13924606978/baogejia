/**
 * 统一权限服务
 * 提供统一的权限检查接口
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

/**
 * 权限检查结果
 */
export interface PermissionCheckResult {
  allowed: boolean;
  reason?: string;
  permission?: {
    code: string;
    name: string;
    category: string;
  };
}

/**
 * API 权限检查结果
 */
export interface ApiPermissionCheckResult {
  allowed: boolean;
  reason?: string;
  requiredLevel?: number;
  requiredPoints?: number;
  userLevel?: number;
  userPoints?: number;
}

/**
 * 用户权限信息
 */
export interface UserPermissionInfo {
  userId: string;
  role: string;
  permissions: Array<{
    code: string;
    name: string;
    category: string;
    granted: boolean;
  }>;
}

/**
 * 权限服务类
 */
export class PermissionService {
  private static instance: PermissionService;
  private permissionCache: Map<string, { result: boolean; expiresAt: number }> = new Map();
  private readonly CACHE_TTL = 5 * 60 * 1000; // 5分钟缓存

  private constructor() {}

  /**
   * 获取单例实例
   */
  static getInstance(): PermissionService {
    if (!PermissionService.instance) {
      PermissionService.instance = new PermissionService();
    }
    return PermissionService.instance;
  }

  /**
   * 生成缓存键
   */
  private getCacheKey(userId: number | string, permission: string): string {
    return `${userId}:${permission}`;
  }

  /**
   * 获取缓存
   */
  private getFromCache(userId: number | string, permission: string): boolean | null {
    const key = this.getCacheKey(userId, permission);
    const cached = this.permissionCache.get(key);

    if (cached && cached.expiresAt > Date.now()) {
      return cached.result;
    }

    // 过期的缓存，删除
    if (cached) {
      this.permissionCache.delete(key);
    }

    return null;
  }

  /**
   * 设置缓存
   */
  private setCache(userId: number | string, permission: string, result: boolean): void {
    const key = this.getCacheKey(userId, permission);
    this.permissionCache.set(key, {
      result,
      expiresAt: Date.now() + this.CACHE_TTL,
    });
  }

  /**
   * 清除用户缓存
   */
  clearUserCache(userId: number | string): void {
    const prefix = `${userId}:`;
    for (const key of this.permissionCache.keys()) {
      if (key.startsWith(prefix)) {
        this.permissionCache.delete(key);
      }
    }
  }

  /**
   * 检查用户是否有指定权限
   */
  async hasPermission(userId: number | string, permission: string): Promise<boolean> {
    // 检查缓存
    const cached = this.getFromCache(userId, permission);
    if (cached !== null) {
      return cached;
    }

    try {
      const supabase = getSupabaseClient();

      // 查询用户角色
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (roleError || !userRole) {
        console.error('[PermissionService] 获取用户角色失败:', roleError?.message);
        return false;
      }

      // 检查权限定义
      const { data: permData, error: permError } = await supabase
        .from('permissions')
        .select('id, code, name')
        .eq('code', permission)
        .single();

      if (permError || !permData) {
        console.error('[PermissionService] 获取权限定义失败:', permError?.message);
        return false;
      }

      // 检查角色权限
      const { data: rolePerm, error: rolePermError } = await supabase
        .from('role_permissions')
        .select('granted')
        .eq('role', userRole.role)
        .eq('permission_id', permData.id)
        .single();

      if (rolePermError) {
        // 没有找到角色权限，默认拒绝
        console.error('[PermissionService] 获取角色权限失败:', rolePermError.message);
        return false;
      }

      const result = rolePerm.granted === true;

      // 设置缓存
      this.setCache(userId, permission, result);

      return result;
    } catch (error) {
      console.error('[PermissionService] 权限检查失败:', error);
      return false;
    }
  }

  /**
   * 批量检查权限
   */
  async hasPermissions(userId: number | string, permissions: string[]): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const permission of permissions) {
      results[permission] = await this.hasPermission(userId, permission);
    }

    return results;
  }

  /**
   * 检查用户是否有任一权限
   */
  async hasAnyPermission(userId: number | string, permissions: string[]): Promise<boolean> {
    for (const permission of permissions) {
      if (await this.hasPermission(userId, permission)) {
        return true;
      }
    }
    return false;
  }

  /**
   * 检查用户是否有所有权限
   */
  async hasAllPermissions(userId: number | string, permissions: string[]): Promise<boolean> {
    for (const permission of permissions) {
      if (!(await this.hasPermission(userId, permission))) {
        return false;
      }
    }
    return true;
  }

  /**
   * 获取用户所有权限
   */
  async getUserPermissions(userId: number | string): Promise<UserPermissionInfo | null> {
    try {
      const supabase = getSupabaseClient();

      // 获取用户角色
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (roleError || !userRole) {
        console.error('[PermissionService] 获取用户角色失败:', roleError);
        return null;
      }

      // 获取权限列表
      const { data: permissions, error: permError } = await supabase
        .from('permissions')
        .select(
          `
          code,
          name,
          category,
          role_permissions!inner (
            granted
          )
        `
        )
        .eq('role_permissions.role', userRole.role);

      if (permError) {
        console.error('[PermissionService] 获取权限列表失败:', permError);
        return null;
      }

      return {
        userId: String(userId),
        role: userRole.role,
        permissions: (permissions || []).map((p: any) => ({
          code: p.code,
          name: p.name,
          category: p.category,
          granted: p.role_permissions?.[0]?.granted || false,
        })),
      };
    } catch (error) {
      console.error('[PermissionService] 获取用户权限失败:', error);
      return null;
    }
  }
}

// 导出单例实例
export const permissionService = PermissionService.getInstance();
