'use client';

import { useState, useEffect, useCallback } from 'react';
import type { KnowledgeType, KnowledgeEntry } from '@/types/knowledge';

/**
 * 通用知识条目列表 hook
 * 调用 /api/knowledge 获取条目
 * include_mine=true 时同时返回当前用户自己的待审核/已拒绝条目
 */
export function useKnowledgeList(type: KnowledgeType, options?: {
  keyword?: string;
  metadata_filter?: Record<string, any>;
  tag?: string;
  pageSize?: number;
  include_mine?: boolean;
}) {
  const [items, setItems] = useState<KnowledgeEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [permissions, setPermissions] = useState({ can_download: true, download_cost: 5 });
  const pageSize = options?.pageSize || 20;

  const fetchData = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        type,
        page: String(page),
        limit: String(pageSize),
      });

      if (options?.keyword) params.set('keyword', options.keyword);
      if (options?.metadata_filter && Object.keys(options.metadata_filter).length > 0) {
        params.set('metadata_filter', JSON.stringify(options.metadata_filter));
      }
      if (options?.tag) params.set('tag', options.tag);
      if (options?.include_mine) params.set('include_mine', 'true');

      const res = await fetch(`/api/knowledge?${params}`);
      const json = await res.json();
      if (json.success) {
        setItems(json.data || []);
        setTotal(json.total || 0);
        if (json.permissions) setPermissions(json.permissions);
      }
    } catch (err) {
      console.error('[useKnowledgeList] 加载失败:', err);
    } finally {
      setLoading(false);
    }
  }, [type, page, pageSize, options?.keyword, options?.metadata_filter, options?.tag, options?.include_mine]);

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
    refresh: fetchData,
  };
}
