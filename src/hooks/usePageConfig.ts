'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';

// ── 类型定义 ──

export interface FieldConfig {
  id: string;
  field_key: string;
  field_type: string;
  label_zh: string;
  is_visible: boolean;
  is_editable: boolean;
  is_required: boolean;
  group_name: string;
  sort_order: number;
  config: Record<string, any>;
  validation_rules?: Record<string, any>;
  depends_on?: string | null;
}

export interface ActionConfig {
  id: string;
  action_key: string;
  name_zh: string;
  api_endpoint: string;
  http_method: string;
  is_visible: boolean;
  permission_required: string;
  sort_order: number;
  config: Record<string, any>;
}

export interface PageConfig {
  page: {
    id: string;
    page_key: string;
    name_zh: string;
    route_path: string | null;
    layout_template: string | null;
    module_id: string;
    is_enabled: boolean;
    config: Record<string, any>;
  };
  module: {
    id: string;
    module_key: string;
    name_zh: string;
    icon: string | null;
    route_path: string | null;
  } | null;
  fields: FieldConfig[];
  field_groups: Record<string, FieldConfig[]>;
  actions: ActionConfig[];
}

interface PageConfigState {
  data: PageConfig | null;
  loading: boolean;
  error: string | null;
}

// ── 缓存 ──

const cache = new Map<string, { data: PageConfig; timestamp: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 分钟

// ── Hook ──

export function usePageConfig(pageKey: string | null | undefined) {
  const [state, setState] = useState<PageConfigState>({
    data: null,
    loading: !!pageKey,
    error: null,
  });

  const loadConfig = useCallback(async (key: string) => {
    // 检查缓存
    const cached = cache.get(key);
    if (cached && Date.now() - cached.timestamp < CACHE_TTL) {
      setState({ data: cached.data, loading: false, error: null });
      return;
    }

    setState(prev => ({ ...prev, loading: true, error: null }));

    try {
      const res = await fetch(`/api/admin/config/query/page?page_key=${encodeURIComponent(key)}`);
      const json = await res.json();

      if (json.success) {
        cache.set(key, { data: json.data, timestamp: Date.now() });
        setState({ data: json.data, loading: false, error: null });
      } else {
        setState({ data: null, loading: false, error: json.error || '加载失败' });
      }
    } catch {
      setState({ data: null, loading: false, error: '网络错误' });
    }
  }, []);

  useEffect(() => {
    if (!pageKey) {
      setState({ data: null, loading: false, error: null });
      return;
    }
    loadConfig(pageKey);
  }, [pageKey, loadConfig]);

  // ── 便捷访问器 ──

  /** 按 position 筛选按钮 */
  const actionsByPosition = useMemo(() => {
    if (!state.data) return { toolbar: [], row_action: [], batch_action: [] };
    const result: Record<string, ActionConfig[]> = { toolbar: [], row_action: [], batch_action: [] };
    for (const action of state.data.actions) {
      const pos = action.config?.position || 'toolbar';
      if (!result[pos]) result[pos] = [];
      result[pos].push(action);
    }
    return result;
  }, [state.data]);

  /** 按 group 筛选字段（field_groups 的便捷别名） */
  const fieldsByGroup = state.data?.field_groups || {};

  /** 获取单个字段配置 */
  const getField = useCallback(
    (fieldKey: string): FieldConfig | undefined => {
      return state.data?.fields.find(f => f.field_key === fieldKey);
    },
    [state.data]
  );

  /** 获取单个按钮配置 */
  const getAction = useCallback(
    (actionKey: string): ActionConfig | undefined => {
      return state.data?.actions.find(a => a.action_key === actionKey);
    },
    [state.data]
  );

  /** 强制刷新（忽略缓存） */
  const refresh = useCallback(() => {
    if (pageKey) {
      cache.delete(pageKey);
      loadConfig(pageKey);
    }
  }, [pageKey, loadConfig]);

  /** 清除所有缓存 */
  const invalidateCache = useCallback(() => {
    cache.clear();
  }, []);

  return {
    ...state,
    actionsByPosition,
    fieldsByGroup,
    getField,
    getAction,
    refresh,
    invalidateCache,
  };
}
