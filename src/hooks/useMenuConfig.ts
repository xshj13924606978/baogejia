'use client';

import { useState, useEffect, useCallback } from 'react';

export interface MenuPage {
  id: string;
  page_key: string;
  name_zh: string;
  route_path: string | null;
  layout_template: string | null;
  sort_order: number;
}

export interface MenuModule {
  id: string;
  module_key: string;
  name_zh: string;
  icon: string | null;
  route_path: string | null;
  sort_order: number;
  is_enabled: boolean;
  is_visible_in_menu: boolean;
  children: MenuPage[];
  sub_modules: MenuModule[];
}

interface MenuConfigState {
  data: MenuModule[];
  loading: boolean;
  error: string | null;
}

const cache = { data: null as MenuModule[] | null, timestamp: 0 };
const CACHE_TTL = 0;

export function useMenuConfig() {
  const [state, setState] = useState<MenuConfigState>({
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
      const res = await fetch('/api/admin/config/query/menu');
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
