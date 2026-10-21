'use client';

import { useToast } from '@/components/ui/use-toast';
import {
  Toast,
  ToastClose,
  ToastDescription,
  ToastProvider,
  ToastTitle,
  ToastViewport,
} from '@/components/ui/toast';

/**
 * 全局 toast 渲染器（消费 useToast 的模块级状态）。
 * 必须挂载一次（root layout），否则 useToast().toast() dispatch 的消息无处渲染，
 * 表现为所有页面的提示静默丢失（#20260821-XXXX：complete-profile 6 位密码拦截提示不显示等）。
 */
export function Toaster() {
  const { toasts } = useToast();

  return (
    <ToastProvider>
      {toasts.map(function ({ id, title, description, action, ...props }) {
        return (
          <Toast key={id} {...props}>
            <div className="grid gap-1">
              {title && <ToastTitle>{title}</ToastTitle>}
              {description && <ToastDescription>{description}</ToastDescription>}
            </div>
            {action}
            <ToastClose />
          </Toast>
        );
      })}
      <ToastViewport />
    </ToastProvider>
  );
}
