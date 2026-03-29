'use client';

import { useState, useEffect, useCallback } from 'react';

// ── 类型定义 ──

interface FieldPermission {
  visible: boolean;
  editable: boolean;
}

interface UserPermissions {
  modules: Record<string, boolean>;
  pages: Record<string, boolean>;
  fields: Record<string, FieldPermission>;
  actions: Record<string, boolean>;
  userMenus: Record<string, boolean>;
  userMenuPages: Record<string, boolean>;
  userMenuFields: Record<string, FieldPermission>;
  userMenuActions: Record<string, boolean>;
}

// ── Hook ──

export function usePermission() {
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      // 构建请求头：携带用户身份
      const headers: Record<string, string> = {};
      try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          if (user.id) headers['x-user-id'] = user.id;
        }
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch { /* ignore */ }

      const res = await fetch('/api/user/permissions', { headers });
      const data = await res.json();
      if (data.success) {
        setPermissions(data.data);
      } else {
        // 无权限接口时使用默认（全部允许）
        setPermissions({ modules: {}, pages: {}, fields: {}, actions: {}, userMenus: {}, userMenuPages: {}, userMenuFields: {}, userMenuActions: {} });
      }
    } catch {
      setPermissions({ modules: {}, pages: {}, fields: {}, actions: {}, userMenus: {}, userMenuPages: {}, userMenuFields: {}, userMenuActions: {} });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  /** 检查模块访问权限（无规则时默认允许） */
  const canAccessModule = useCallback((moduleKey: string): boolean => {
    if (!permissions) return true;
    return permissions.modules[moduleKey] !== false;
  }, [permissions]);

  /** 检查页面访问权限（无规则时默认允许） */
  const canAccessPage = useCallback((pageKey: string): boolean => {
    if (!permissions) return true;
    return permissions.pages[pageKey] !== false;
  }, [permissions]);

  /** 获取字段权限（无规则时默认可见可编辑） */
  const getFieldPermission = useCallback((fieldKey: string): FieldPermission => {
    if (!permissions) return { visible: true, editable: true };
    return permissions.fields[fieldKey] || { visible: true, editable: true };
  }, [permissions]);

  /** 检查按钮权限（无规则时默认允许） */
  const canUseAction = useCallback((actionKey: string): boolean => {
    if (!permissions) return true;
    return permissions.actions[actionKey] !== false;
  }, [permissions]);

  /** 检查用户菜单分组访问权限 */
  const canAccessUserMenu = useCallback((menuKey: string): boolean => {
    if (!permissions) return true;
    return permissions.userMenus[menuKey] !== false;
  }, [permissions]);

  /** 检查用户菜单项访问权限 */
  const canAccessUserMenuPage = useCallback((pageKey: string): boolean => {
    if (!permissions) return true;
    return permissions.userMenuPages[pageKey] !== false;
  }, [permissions]);

  /** 获取用户菜单字段权限 */
  const getUserMenuFieldPermission = useCallback((fieldKey: string): FieldPermission => {
    if (!permissions) return { visible: true, editable: true };
    return permissions.userMenuFields[fieldKey] || { visible: true, editable: true };
  }, [permissions]);

  /** 检查用户菜单按钮权限 */
  const canUseUserMenuAction = useCallback((actionKey: string): boolean => {
    if (!permissions) return true;
    return permissions.userMenuActions[actionKey] !== false;
  }, [permissions]);

  /** 刷新权限（配置变更时调用） */
  const refreshPermissions = useCallback(() => {
    loadPermissions();
  }, [loadPermissions]);

  return {
    loading,
    canAccessModule,
    canAccessPage,
    getFieldPermission,
    canUseAction,
    canAccessUserMenu,
    canAccessUserMenuPage,
    getUserMenuFieldPermission,
    canUseUserMenuAction,
    refreshPermissions,
  };
}
