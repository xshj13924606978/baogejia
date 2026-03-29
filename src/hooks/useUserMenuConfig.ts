'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { usePermission } from './usePermission';

export interface UserMenuItem {
  id: string;
  page_key: string;
  name_zh: string;
  icon: string | null;
  route_path: string | null;
  action_type: string;
  sort_order: number;
  badge_text: string | null;
  badge_type: string | null;
  is_visible: boolean;
  config: Record<string, any>;
}

export interface UserMenuGroup {
  id: string;
  menu_key: string;
  name_zh: string;
  name_en: string | null;
  icon: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_visible: boolean;
  description: string | null;
  config: Record<string, any>;
  items: UserMenuItem[];
}

interface UserMenuConfigState {
  data: UserMenuGroup[];
  loading: boolean;
  error: string | null;
}

const cache = { data: null as UserMenuGroup[] | null, timestamp: 0 };
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟缓存

export function useUserMenuConfig() {
  const [state, setState] = useState<UserMenuConfigState>({
    data: [],
    loading: true,
    error: null,
  });

  const { loading: permLoading, canAccessUserMenu, canAccessUserMenuPage } = usePermission();

  const loadMenu = useCallback(async (force = false) => {
    if (!force && cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
      setState({ data: cache.data, loading: false, error: null });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
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

      const res = await fetch('/api/admin/config/query/user-menu', { headers });
      const json = await res.json();
      if (json.success) {
        cache.data = json.data;
        cache.timestamp = Date.now();
        setState({ data: json.data, loading: false, error: null });
      } else {
        setState({ data: [], loading: false, error: json.error || '加载失败' });
      }
    } catch {
      setState({ data: [], loading: false, error: '网络错误' });
    }
  }, []);

  useEffect(() => { loadMenu(); }, [loadMenu]);

  const refresh = useCallback(() => loadMenu(true), [loadMenu]);

  // 根据权限过滤菜单
  const filteredData = useMemo(() => {
    if (permLoading) return state.data;
    return state.data
      .filter(group => canAccessUserMenu(group.menu_key))
      .map(group => ({
        ...group,
        items: group.items.filter(item => canAccessUserMenuPage(item.page_key)),
      }))
      .filter(group => group.items.length > 0);
  }, [state.data, permLoading, canAccessUserMenu, canAccessUserMenuPage]);

  return { ...state, data: filteredData, refresh };
}
