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
}

// ── Hook ──

export function usePermission() {
  const [permissions, setPermissions] = useState<UserPermissions | null>(null);
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/user/permissions');
      const data = await res.json();
      if (data.success) {
        setPermissions(data.data);
      } else {
        // 无权限接口时使用默认（全部允许）
        setPermissions({ modules: {}, pages: {}, fields: {}, actions: {} });
      }
    } catch {
      setPermissions({ modules: {}, pages: {}, fields: {}, actions: {} });
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
    refreshPermissions,
  };
}
