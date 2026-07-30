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
      if (!res.ok) {
        // 服务端错误时拒绝所有权限，而非默认允许
        setPermissions({ modules: {}, pages: {}, fields: {}, actions: {}, userMenus: {}, userMenuPages: {}, userMenuFields: {}, userMenuActions: {} });
        setLoading(false);
        return;
      }
      const data = await res.json();
      if (data.success) {
        setPermissions(data.data);
      } else {
        setPermissions({ modules: {}, pages: {}, fields: {}, actions: {}, userMenus: {}, userMenuPages: {}, userMenuFields: {}, userMenuActions: {} });
      }
    } catch {
      // 网络错误时拒绝所有权限，而非默认允许
      setPermissions({ modules: {}, pages: {}, fields: {}, actions: {}, userMenus: {}, userMenuPages: {}, userMenuFields: {}, userMenuActions: {} });
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadPermissions();
  }, [loadPermissions]);

  /** 检查模块访问权限（无规则或加载失败时默认拒绝） */
  const canAccessModule = useCallback((moduleKey: string): boolean => {
    if (!permissions) return false;
    return permissions.modules[moduleKey] !== false;
  }, [permissions]);

  /** 检查页面访问权限（无规则或加载失败时默认拒绝） */
  const canAccessPage = useCallback((pageKey: string): boolean => {
    if (!permissions) return false;
    return permissions.pages[pageKey] !== false;
  }, [permissions]);

  /** 获取字段权限（无规则或加载失败时默认不可见不可编辑） */
  const getFieldPermission = useCallback((fieldKey: string): FieldPermission => {
    if (!permissions) return { visible: false, editable: false };
    return permissions.fields[fieldKey] || { visible: false, editable: false };
  }, [permissions]);

  /** 检查按钮权限（无规则或加载失败时默认拒绝） */
  const canUseAction = useCallback((actionKey: string): boolean => {
    if (!permissions) return false;
    return permissions.actions[actionKey] !== false;
  }, [permissions]);

  /** 检查用户菜单分组访问权限（无规则时默认拒绝） */
  const canAccessUserMenu = useCallback((menuKey: string): boolean => {
    if (!permissions) return false;
    return permissions.userMenus[menuKey] !== false;
  }, [permissions]);

  /** 检查用户菜单项访问权限（无规则时默认拒绝） */
  const canAccessUserMenuPage = useCallback((pageKey: string): boolean => {
    if (!permissions) return false;
    return permissions.userMenuPages[pageKey] !== false;
  }, [permissions]);

  /** 获取用户菜单字段权限（无规则时默认不可见不可编辑） */
  const getUserMenuFieldPermission = useCallback((fieldKey: string): FieldPermission => {
    if (!permissions) return { visible: false, editable: false };
    return permissions.userMenuFields[fieldKey] || { visible: false, editable: false };
  }, [permissions]);

  /** 检查用户菜单按钮权限（无规则时默认拒绝） */
  const canUseUserMenuAction = useCallback((actionKey: string): boolean => {
    if (!permissions) return false;
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
