/**
 * 统一权限服务
 * 提供统一的权限检查接口
 */

import { getSupabaseClient } from '@/storage/database/supabase-client';

const supabase = getSupabaseClient();

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
  userId: number;
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
  private getCacheKey(userId: number, permission: string): string {
    return `${userId}:${permission}`;
  }

  /**
   * 获取缓存
   */
  private getFromCache(userId: number, permission: string): boolean | null {
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
  private setCache(userId: number, permission: string, result: boolean): void {
    const key = this.getCacheKey(userId, permission);
    this.permissionCache.set(key, {
      result,
      expiresAt: Date.now() + this.CACHE_TTL,
    });
  }

  /**
   * 清除用户缓存
   */
  clearUserCache(userId: number): void {
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
  async hasPermission(userId: number, permission: string): Promise<boolean> {
    // 检查缓存
    const cached = this.getFromCache(userId, permission);
    if (cached !== null) {
      return cached;
    }

    try {
      // 查询用户角色
      const { data: userRole, error: roleError } = await supabase
        .from('user_roles')
        .select('role')
        .eq('user_id', userId)
        .single();

      if (roleError || !userRole) {
        console.error('[PermissionService] 获取用户角色失败:', roleError);
        return false;
      }

      // 检查权限
      const { data: permData, error: permError } = await supabase
        .from('permissions')
        .select('*')
        .eq('code', permission)
        .single();

      if (permError || !permData) {
        console.error('[PermissionService] 获取权限定义失败:', permError);
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
  async hasPermissions(userId: number, permissions: string[]): Promise<Record<string, boolean>> {
    const results: Record<string, boolean> = {};

    for (const permission of permissions) {
      results[permission] = await this.hasPermission(userId, permission);
    }

    return results;
  }

  /**
   * 检查用户是否有任一权限
   */
  async hasAnyPermission(userId: number, permissions: string[]): Promise<boolean> {
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
  async hasAllPermissions(userId: number, permissions: string[]): Promise<boolean> {
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
  async getUserPermissions(userId: number): Promise<UserPermissionInfo | null> {
    try {
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
        userId,
        role: userRole.role,
        permissions: (permissions || []).map((p) => ({
          code: p.code,
          name: p.name,
          category: p.category,
          granted: (p as any).role_permissions?.[0]?.granted || false,
        })),
      };
    } catch (error) {
      console.error('[PermissionService] 获取用户权限失败:', error);
      return null;
    }
  }

  /**
   * 为用户授予临时权限
   */
  async grantPermission(
    userId: number,
    permissionCode: string,
    reason: string,
    expiresAt?: Date
  ): Promise<boolean> {
    try {
      // 获取权限 ID
      const { data: perm, error: permError } = await supabase
        .from('permissions')
        .select('id')
        .eq('code', permissionCode)
        .single();

      if (permError || !perm) {
        console.error('[PermissionService] 获取权限失败:', permError);
        return false;
      }

      // 插入用户权限
      const { error: insertError } = await supabase.from('user_permissions').insert({
        user_id: userId,
        permission_id: perm.id,
        granted: true,
        reason,
        expires_at: expiresAt?.toISOString() || null,
      });

      if (insertError) {
        console.error('[PermissionService] 授予权限失败:', insertError);
        return false;
      }

      // 清除缓存
      this.clearUserCache(userId);

      return true;
    } catch (error) {
      console.error('[PermissionService] 授予权限失败:', error);
      return false;
    }
  }

  /**
   * 撤销用户权限
   */
  async revokePermission(userId: number, permissionCode: string, reason: string): Promise<boolean> {
    try {
      // 获取权限 ID
      const { data: perm, error: permError } = await supabase
        .from('permissions')
        .select('id')
        .eq('code', permissionCode)
        .single();

      if (permError || !perm) {
        console.error('[PermissionService] 获取权限失败:', permError);
        return false;
      }

      // 插入拒绝权限记录
      const { error: insertError } = await supabase.from('user_permissions').insert({
        user_id: userId,
        permission_id: perm.id,
        granted: false,
        reason,
      });

      if (insertError) {
        console.error('[PermissionService] 撤销权限失败:', insertError);
        return false;
      }

      // 清除缓存
      this.clearUserCache(userId);

      return true;
    } catch (error) {
      console.error('[PermissionService] 撤销权限失败:', error);
      return false;
    }
  }

  /**
   * 获取权限列表（管理员用）
   */
  async getAllPermissions(): Promise<
    Array<{
      id: number;
      code: string;
      name: string;
      category: string;
      description: string;
      resource_type: string;
    }>
  > {
    try {
      const { data, error } = await supabase
        .from('permissions')
        .select('*')
        .order('category, name');

      if (error) {
        console.error('[PermissionService] 获取权限列表失败:', error);
        return [];
      }

      return data || [];
    } catch (error) {
      console.error('[PermissionService] 获取权限列表失败:', error);
      return [];
    }
  }

  /**
   * 获取角色的权限列表（管理员用）
   */
  async getRolePermissions(role: string): Promise<
    Array<{
      permissionId: number;
      code: string;
      name: string;
      category: string;
      granted: boolean;
    }>
  > {
    try {
      const { data, error } = await supabase
        .from('role_permissions')
        .select(
          `
          permission_id,
          granted,
          permissions!inner (
            code,
            name,
            category
          )
        `
        )
        .eq('role', role)
        .order('permissions.category, permissions.name');

      if (error) {
        console.error('[PermissionService] 获取角色权限失败:', error);
        return [];
      }

      return (data || []).map((rp) => ({
        permissionId: rp.permission_id,
        code: (rp as any).permissions.code,
        name: (rp as any).permissions.name,
        category: (rp as any).permissions.category,
        granted: rp.granted,
      }));
    } catch (error) {
      console.error('[PermissionService] 获取角色权限失败:', error);
      return [];
    }
  }

  /**
   * 更新角色权限
   */
  async updateRolePermission(
    role: string,
    permissionCode: string,
    granted: boolean
  ): Promise<boolean> {
    try {
      // 获取权限 ID
      const { data: perm, error: permError } = await supabase
        .from('permissions')
        .select('id')
        .eq('code', permissionCode)
        .single();

      if (permError || !perm) {
        console.error('[PermissionService] 获取权限失败:', permError);
        return false;
      }

      // 更新或插入角色权限
      const { error } = await supabase.from('role_permissions').upsert(
        {
          role,
          permission_id: perm.id,
          granted,
        },
        {
          onConflict: 'role,permission_id',
        }
      );

      if (error) {
        console.error('[PermissionService] 更新角色权限失败:', error);
        return false;
      }

      // 清除所有用户缓存（因为角色权限改变了）
      this.permissionCache.clear();

      return true;
    } catch (error) {
      console.error('[PermissionService] 更新角色权限失败:', error);
      return false;
    }
  }
}

// 导出单例实例
export const permissionService = PermissionService.getInstance();

// 导出便捷函数
export async function checkPermission(userId: number, permission: string): Promise<boolean> {
  return permissionService.hasPermission(userId, permission);
}

export async function checkPermissions(
  userId: number,
  permissions: string[]
): Promise<Record<string, boolean>> {
  return permissionService.hasPermissions(userId, permissions);
}

export async function getUserPermissions(userId: number): Promise<UserPermissionInfo | null> {
  return permissionService.getUserPermissions(userId);
}
