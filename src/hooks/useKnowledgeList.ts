'use client';

import { useState, useEffect, useCallback } from 'react';
import type { KnowledgeType, KnowledgeEntry } from '@/types/knowledge';

/**
 * 通用知识条目列表 hook
 * 调用 /api/knowledge 获取条目
 * - scope=public（默认）：只返回已审核通过的条目
 * - scope=mine：只返回当前用户自己的条目（全部状态）
 */
export function useKnowledgeList(type: KnowledgeType | '', options?: {
  keyword?: string;
  metadata_filter?: Record<string, any>;
  tag?: string;
  pageSize?: number;
  include_mine?: boolean;
  scope?: 'public' | 'mine';
}) {
  const [items, setItems] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [permissions, setPermissions] = useState({
    can_view: true,
    can_download: true,
    can_edit: false,
    can_delete: false,
    download_cost: 0,
    view_cost: 0,
  });
  const [authenticated, setAuthenticated] = useState(false);
  const pageSize = options?.pageSize || 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });

      if (type) params.set('type', type);
      if (options?.keyword) params.set('keyword', options.keyword);
      if (options?.metadata_filter && Object.keys(options.metadata_filter).length > 0) {
        params.set('metadata_filter', JSON.stringify(options.metadata_filter));
      }
      if (options?.tag) params.set('tag', options.tag);
      if (options?.include_mine) params.set('include_mine', 'true');
      if (options?.scope) params.set('scope', options.scope);

      // 构建请求头：携带用户身份
      const headers: Record<string, string> = {};
      try {
        const userStr = localStorage.getItem('user');
        if (userStr) {
          const user = JSON.parse(userStr);
          // 服务端身份优先（本地缓存 id 可能是本地 id，supabaseId 才是数据库 UUID）
          const uid = user.supabaseId || user.id;
          if (uid) headers['x-user-id'] = uid;
          if (user.role) headers['x-user-role'] = String(user.role);
        }
        const token = localStorage.getItem('token');
        if (token) headers['Authorization'] = `Bearer ${token}`;
      } catch { /* ignore */ }

      const res = await fetch(`/api/knowledge?${params}`, { headers });
      const json = await res.json();
      if (json.success) {
        setItems(json.data || []);
        setTotal(json.total || 0);
        if (json.permissions) setPermissions(json.permissions);
        setAuthenticated(!!json.authenticated);
      }
    } catch (err) {
      console.error('[useKnowledgeList] 加载失败:', err);
    } finally {
      setLoading(false);
    }
  }, [type, page, pageSize, options?.keyword, options?.metadata_filter, options?.tag, options?.include_mine, options?.scope]);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  return {
    items,
    loading,
    total,
    page,
    setPage,
    totalPages: Math.ceil(total / pageSize),
    permissions,
    authenticated,
    refresh: fetchData,
  };
}
