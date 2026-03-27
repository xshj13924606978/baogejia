'use client';

import { useState, useEffect, useCallback } from 'react';

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

  const loadMenu = useCallback(async (force = false) => {
    if (!force && cache.data && Date.now() - cache.timestamp < CACHE_TTL) {
      setState({ data: cache.data, loading: false, error: null });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));
    try {
      const res = await fetch('/api/admin/config/query/user-menu');
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

  return { ...state, refresh };
}
