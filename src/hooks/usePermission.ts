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
  /**
   * 等级模块权限（#202608302400 阶段2 新增）
   * 由 /api/user/permissions 融合判定：管理员直通 → RBAC → member_module_permissions → 默认矩阵
   * key 取自 MODULE_PERMISSION_DEFS（chat / quote_generate / history / edit / preview /
   * enhance_proposal / knowledge_download / data_export / customer_manage）
   */
  levelModulePermissions: Record<string, boolean>;
}

/** 空权限快照（未登录 / 请求失败时一律拒绝，避免越权展示） */
const EMPTY_PERMISSIONS: UserPermissions = {
  modules: {},
  pages: {},
  fields: {},
  actions: {},
  userMenus: {},
  userMenuPages: {},
  userMenuFields: {},
  userMenuActions: {},
  levelModulePermissions: {},
};

/**
 * 全局共享缓存（#202608302500）
 *
 * 对话页每条消息都是独立组件，若各自 useEffect 里直接请求，50 条消息
 * 就会并发 50 次 /api/user/permissions。这里用模块级缓存 + 在途 Promise
 * 合并，同页面内所有 usePermission 实例共用一次请求（30s 内命中缓存）。
 */
let cachedPermissions: UserPermissions | null = null;
let cachedIdentityKey = '';
let cacheFetchedAt = 0;
let inflightRequest: Promise<UserPermissions> | null = null;
const PERMISSION_CACHE_TTL_MS = 30_000;

/** 读取本地身份并构建请求头（切换账号时 identityKey 变化 → 缓存自动失效） */
function buildIdentity(): { headers: Record<string, string>; identityKey: string } {
  const headers: Record<string, string> = {};
  let uid = '';
  try {
    const userStr = localStorage.getItem('user');
    if (userStr) {
      const user = JSON.parse(userStr);
      // 服务端身份优先（登录时本地缓存 id 可能是本地 id，supabaseId 才是数据库 UUID）
      uid = user.supabaseId || user.id || '';
      if (uid) headers['x-user-id'] = uid;
    }
    const token = localStorage.getItem('token');
    if (token) headers['Authorization'] = `Bearer ${token}`;
  } catch { /* ignore */ }
  return { headers, identityKey: uid };
}

async function requestPermissions(): Promise<UserPermissions> {
  const { headers } = buildIdentity();
  const res = await fetch('/api/user/permissions', { headers });
  if (!res.ok) return EMPTY_PERMISSIONS;
  const data = await res.json();
  if (!data?.success) return EMPTY_PERMISSIONS;
  return {
    ...EMPTY_PERMISSIONS,
    ...(data.data || {}),
    levelModulePermissions: data.data?.levelModulePermissions || {},
  };
}

// ── Hook ──

export function usePermission() {
  // 复用已有缓存（同一账号才复用，避免切换账号后短暂显示上一账号的权限）
  const [permissions, setPermissions] = useState<UserPermissions | null>(() =>
    cachedPermissions && cachedIdentityKey === buildIdentity().identityKey ? cachedPermissions : null
  );
  const [loading, setLoading] = useState(true);

  const loadPermissions = useCallback(async (force = false) => {
    const now = Date.now();
    const { identityKey } = buildIdentity();
    const cacheValid =
      cachedPermissions !== null &&
      cachedIdentityKey === identityKey &&
      now - cacheFetchedAt < PERMISSION_CACHE_TTL_MS;

    if (!force && cacheValid) {
      setPermissions(cachedPermissions);
      setLoading(false);
      return;
    }
    setLoading(true);
    try {
      if (force) inflightRequest = null;
      inflightRequest = inflightRequest || requestPermissions();
      const result = await inflightRequest;
      cachedPermissions = result;
      cachedIdentityKey = identityKey;
      cacheFetchedAt = Date.now();
      setPermissions(result);
    } catch {
      // 网络错误时拒绝所有权限，而非默认允许
      setPermissions(EMPTY_PERMISSIONS);
    } finally {
      inflightRequest = null;
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

  /** 检查用户菜单分组访问权限（无规则或非显式允许时默认拒绝） */
  const canAccessUserMenu = useCallback((menuKey: string): boolean => {
    if (!permissions) return false;
    return permissions.userMenus[menuKey] === true;
  }, [permissions]);

  /** 检查用户菜单项访问权限（无规则或非显式允许时默认拒绝） */
  const canAccessUserMenuPage = useCallback((pageKey: string): boolean => {
    if (!permissions) return false;
    return permissions.userMenuPages[pageKey] === true;
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

  /**
   * 检查等级模块权限（#202608302500）
   * 与 canAccessModule（RBAC 维度）区分：本方法读 levelModulePermissions，
   * 即「会员等级 × 后台等级权限配置」的融合判定结果。
   *
   * 默认拒绝：接口返回空（未登录 / 查询失败）时视为无权限，由调用方决定
   * 是隐藏入口还是展示升级引导。
   */
  const canUseLevelModule = useCallback((moduleKey: string): boolean => {
    if (!permissions) return false;
    return permissions.levelModulePermissions?.[moduleKey] === true;
  }, [permissions]);

  /** 刷新权限（配置变更 / 收到 403 时调用，强制跳过缓存） */
  const refreshPermissions = useCallback(() => {
    loadPermissions(true);
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
    canUseLevelModule,
    refreshPermissions,
  };
}
