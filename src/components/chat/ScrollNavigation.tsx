'use client';

import { useEffect, useState, useCallback } from 'react';
import { ArrowUp, ArrowDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** 显示/隐藏的滚动阈值（px） */
const THRESHOLD = 200;

interface ScrollNavigationProps {
  /** 对话消息滚动容器引用 */
  containerRef: React.RefObject<HTMLDivElement | null>;
}

/**
 * 对话容器滚动导航按钮
 * - ↑ 回到顶部：滚动位置 > 200px 时显示
 * - ↓ 跳转到底部最新位置：滚动位置 < 最底部 - 200px 时显示
 * 固定在滚动容器右下角（输入框上方），平滑过渡显隐。
 */
export default function ScrollNavigation({ containerRef }: ScrollNavigationProps) {
  const [showTop, setShowTop] = useState(false);
  const [showBottom, setShowBottom] = useState(false);

  const updateVisibility = useCallback(() => {
    const container = containerRef.current;
    if (!container) return;
    const { scrollTop, scrollHeight, clientHeight } = container;
    setShowTop(scrollTop > THRESHOLD);
    setShowBottom(scrollTop < scrollHeight - clientHeight - THRESHOLD);
  }, [containerRef]);

  useEffect(() => {
    const container = containerRef.current;
    if (!container) return;

    updateVisibility();
    container.addEventListener('scroll', updateVisibility, { passive: true });
    window.addEventListener('resize', updateVisibility);

    // 监听内容变化（消息增删、流式输出），保持按钮显隐状态准确
    const observer = new MutationObserver(updateVisibility);
    observer.observe(container, { childList: true, subtree: true, characterData: true });

    return () => {
      container.removeEventListener('scroll', updateVisibility);
      window.removeEventListener('resize', updateVisibility);
      observer.disconnect();
    };
  }, [containerRef, updateVisibility]);

  const scrollToTop = useCallback(() => {
    containerRef.current?.scrollTo({ top: 0, behavior: 'smooth' });
  }, [containerRef]);

  const scrollToBottom = useCallback(() => {
    const container = containerRef.current;
    if (container) {
      container.scrollTo({ top: container.scrollHeight, behavior: 'smooth' });
    }
  }, [containerRef]);

  const baseBtn =
    'flex items-center justify-center w-9 h-9 rounded-full ' +
    'bg-white/85 dark:bg-slate-800/85 backdrop-blur-sm ' +
    'border border-slate-200 dark:border-slate-700 ' +
    'text-slate-600 dark:text-slate-300 shadow-md ' +
    'hover:shadow-lg hover:bg-white dark:hover:bg-slate-700 hover:-translate-y-0.5 ' +
    'transition-all duration-300';

  return (
    <div className="pointer-events-none absolute bottom-3 right-3 z-20 flex flex-col gap-2">
      <button
        type="button"
        onClick={scrollToTop}
        aria-label="回到顶部"
        title="回到顶部"
        className={cn(
          baseBtn,
          showTop
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-90 pointer-events-none'
        )}
      >
        <ArrowUp className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={scrollToBottom}
        aria-label="跳转到底部最新位置"
        title="跳转到底部最新位置"
        className={cn(
          baseBtn,
          showBottom
            ? 'opacity-100 scale-100 pointer-events-auto'
            : 'opacity-0 scale-90 pointer-events-none'
        )}
      >
        <ArrowDown className="h-4 w-4" />
      </button>
    </div>
  );
}
