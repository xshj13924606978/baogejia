'use client';

import { useEffect } from 'react';

/**
 * #[20260827-2000]-2 资料中心跳转高亮定位
 * 在资料中心弹窗从外部跳转目标文件时，为匹配行/卡片添加高亮并滚动到可视区域。
 */
export function useKnowledgeHighlight(highlightId?: string) {
  useEffect(() => {
    if (!highlightId) return;
    // 等列表渲染完成后再滚动
    const timer = setTimeout(() => {
      const el = document.querySelector(`[data-knowledge-highlight="${CSS.escape(highlightId)}"]`);
      if (el) {
        el.scrollIntoView({ behavior: 'smooth', block: 'center' });
      }
    }, 120);
    return () => clearTimeout(timer);
  }, [highlightId]);

  return (id: string) => {
    const active = !!highlightId && id === highlightId;
    return {
      active,
      attrs: active
        ? { 'data-knowledge-highlight': id }
        : {},
    };
  };
}
