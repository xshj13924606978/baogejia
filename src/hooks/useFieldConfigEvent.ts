'use client';

import { useEffect } from 'react';

/**
 * #20260824-1840 字段配置同步事件总线
 *
 * 解决管理后台"新增产品"必填红 *、用户端价格库"字段必填配置"、产品列表中的"字段必填配置" 三地不同步问题。
 *
 * - 当任何一处修改了 product_field_configs 表（字段必填/可见/可搜索等），
 *   应调用 notifyFieldConfigsChanged() 通知所有订阅者立即重新加载。
 * - 使用 BroadcastChannel + window 自定义事件双通道，兼容同窗口与跨标签页。
 */

export const FIELD_CONFIGS_CHANGED_EVENT = 'product_field_configs_changed';

// #[20260824-2015] 记录最近一次字段配置变更时间（模块级）。
// 用于解决「打开新增产品对话框红 * 不同步」：当用户在价格库/另一标签页修改必填配置后，
// 再导航回管理后台时组件重新挂载，此时 usePageConfig 的 5 分钟缓存仍命中旧数据；
// 组件挂载时对比缓存时间与本次变更时间，缓存早于变更则强制失效重拉。
let lastFieldConfigsChangedAt = 0;

/** 获取最近一次字段配置变更的时间戳（0 表示从未变更过） */
export function getFieldConfigsLastChangedAt(): number {
  return lastFieldConfigsChangedAt;
}

let bc: BroadcastChannel | null = null;

function getChannel(): BroadcastChannel | null {
  if (typeof window === 'undefined') return null;
  if (bc) return bc;
  if (typeof BroadcastChannel === 'undefined') return null;
  try {
    bc = new BroadcastChannel('field_configs_sync');
    return bc;
  } catch {
    return null;
  }
}

/**
 * 通知所有订阅者：字段配置已变更。
 * 应在 product_field_configs 表写入成功后调用。
 */
export function notifyFieldConfigsChanged(): void {
  // #[20260824-2015] 先记录变更时间，保证挂载兜底逻辑能感知（即使 window 不可用也先记录）
  lastFieldConfigsChangedAt = Date.now();
  if (typeof window === 'undefined') return;
  // 1) 同窗口 CustomEvent
  window.dispatchEvent(new CustomEvent(FIELD_CONFIGS_CHANGED_EVENT));
  // 2) 跨标签页 BroadcastChannel
  const channel = getChannel();
  if (channel) {
    try {
      channel.postMessage({ type: FIELD_CONFIGS_CHANGED_EVENT, at: Date.now() });
    } catch {
      /* ignore */
    }
  }
}

/**
 * 订阅字段配置变更事件。当事件触发时调用 onChanged()。
 * 自动在组件卸载时取消订阅，并兼容跨标签页 BroadcastChannel。
 */
export function useFieldConfigChange(onChanged: () => void): void {
  useEffect(() => {
    if (typeof window === 'undefined') return;

    const handler = () => onChanged();
    window.addEventListener(FIELD_CONFIGS_CHANGED_EVENT, handler);

    const channel = getChannel();
    const bcHandler = (ev: MessageEvent) => {
      if (ev?.data?.type === FIELD_CONFIGS_CHANGED_EVENT) {
        onChanged();
      }
    };
    if (channel) {
      channel.addEventListener('message', bcHandler);
    }

    return () => {
      window.removeEventListener(FIELD_CONFIGS_CHANGED_EVENT, handler);
      if (channel) {
        channel.removeEventListener('message', bcHandler);
      }
    };
  }, [onChanged]);
}
