'use client';

import { useEffect, useState, useCallback } from 'react';

export interface KnowledgeCategory {
  id: string;
  type: string;
  name: string;
  name_en?: string;
  icon?: string;
  metadata_key: string;
  sort_order: number;
  is_default: boolean;
}

// 各子库类型对应的 metadata key
export const TYPE_METADATA_KEY_MAP: Record<string, string> = {
  document: 'category',
  case: 'project_type',
  standard: 'standard_type',
  drawing: 'drawing_type',
  quota: 'quota_type',
};

/**
 * 获取分类列表 hook
 * @param type - 子库类型 (document/case/standard/drawing/quota)
 */
export function useCategories(type: string) {
  const [categories, setCategories] = useState<KnowledgeCategory[]>([]);
  const [loading, setLoading] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/knowledge/categories?type=${type}`);
      const json = await res.json();
      if (json.success) {
        setCategories(json.data || []);
      }
    } catch {
      // 静默失败，使用空数组
    } finally {
      setLoading(false);
    }
  }, [type]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // 获取分类名称列表（用于筛选器）
  const categoryNames = categories.map(c => c.name);

  // 获取分类 ID 和名称映射
  const categoryMap = new Map(categories.map(c => [c.name, c]));

  return { categories, categoryNames, categoryMap, loading, refresh: fetchCategories };
}
