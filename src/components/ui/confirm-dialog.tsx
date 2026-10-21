'use client';

import * as React from 'react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';

/**
 * 命令式确认对话框（基于设计系统 AlertDialog）
 * 对话窗: #[20260901-1300]
 *
 * 背景：此前项目大量使用原生 window.confirm()，样式与交互脱离设计系统。
 * 本组件提供与 window.confirm 同构的调用方式（await 返回布尔值），
 * 但渲染的是统一的 AlertDialog，从而以最小改动完成收敛。
 *
 * 用法：
 *   if (!(await confirmDialog({ title: '确定删除？', destructive: true }))) return;
 *
 * 需在应用中挂载 <ConfirmDialogProvider />（已挂载于 src/components/Providers.tsx）。
 * 若未挂载（例如遗留页面未包含 Provider），自动降级为 window.confirm，
 * 保证功能不中断，不会静默失败。
 */

export type ConfirmOptions = {
  /** 确认标题（必填） */
  title: string;
  /** 补充说明（可选） */
  description?: string;
  /** 确认按钮文案，默认「确认」 */
  confirmText?: string;
  /** 取消按钮文案，默认「取消」 */
  cancelText?: string;
  /** 危险操作（删除/重置等）时置为 true，确认按钮使用 destructive 样式 */
  destructive?: boolean;
};

type OpenConfirm = (options: ConfirmOptions) => Promise<boolean>;

let globalOpenConfirm: OpenConfirm | null = null;

/** 命令式确认：返回 Promise<boolean>，与 window.confirm 语义一致 */
export function confirmDialog(options: ConfirmOptions): Promise<boolean> {
  if (!globalOpenConfirm) {
    if (typeof window === 'undefined') return Promise.resolve(false);
    const text = options.description
      ? `${options.title}\n\n${options.description}`
      : options.title;
    return Promise.resolve(window.confirm(text));
  }
  return globalOpenConfirm(options);
}

export function ConfirmDialogProvider({ children }: { children: React.ReactNode }) {
  const [options, setOptions] = React.useState<ConfirmOptions | null>(null);
  const resolverRef = React.useRef<((value: boolean) => void) | null>(null);

  const openConfirm = React.useCallback<OpenConfirm>((opts) => {
    setOptions(opts);
    return new Promise<boolean>((resolve) => {
      resolverRef.current = resolve;
    });
  }, []);

  // 注册全局引用，供 confirmDialog() 命令式调用
  React.useEffect(() => {
    globalOpenConfirm = openConfirm;
    return () => {
      globalOpenConfirm = null;
    };
  }, [openConfirm]);

  // 组件卸载时释放挂起的 Promise，避免调用方永久 await
  React.useEffect(() => {
    return () => {
      resolverRef.current?.(false);
      resolverRef.current = null;
    };
  }, []);

  const settle = (value: boolean) => {
    setOptions(null);
    const resolver = resolverRef.current;
    resolverRef.current = null;
    resolver?.(value);
  };

  return (
    <>
      {children}
      <AlertDialog
        open={options !== null}
        onOpenChange={(open) => {
          if (!open) settle(false);
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>{options?.title ?? ''}</AlertDialogTitle>
            {options?.description ? (
              <AlertDialogDescription>{options.description}</AlertDialogDescription>
            ) : (
              <AlertDialogDescription className="sr-only">确认操作</AlertDialogDescription>
            )}
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel onClick={() => settle(false)}>
              {options?.cancelText ?? '取消'}
            </AlertDialogCancel>
            <AlertDialogAction
              onClick={() => settle(true)}
              className={
                options?.destructive
                  ? 'bg-destructive text-white hover:bg-destructive/90'
                  : undefined
              }
            >
              {options?.confirmText ?? '确认'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </>
  );
}
