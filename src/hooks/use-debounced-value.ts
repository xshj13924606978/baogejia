/**
 * 通用防抖值 Hook（#[20260901-1100] P2-11）
 *
 * 收敛 knowledge-library / global-search 中重复的「useEffect + setTimeout 搜索防抖」模式。
 *
 * 用法：
 * ```ts
 * const [keyword, setKeyword] = useState('');
 * const debouncedKeyword = useDebouncedValue(keyword, 500);
 * // debouncedKeyword 在 keyword 停止变化 500ms 后更新
 * ```
 */

import { useEffect, useState } from 'react';

export function useDebouncedValue<T>(value: T, delayMs: number = 500): T {
  const [debounced, setDebounced] = useState<T>(value);

  useEffect(() => {
    const timer = setTimeout(() => setDebounced(value), delayMs);
    return () => clearTimeout(timer);
  }, [value, delayMs]);

  return debounced;
}
