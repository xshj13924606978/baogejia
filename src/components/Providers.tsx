'use client';

import dynamic from 'next/dynamic';
import { SwitchProvider } from '@/components/switch-manager';
import { ConfirmDialogProvider } from '@/components/ui/confirm-dialog';

// 禁用 SSR：UserProvider 依赖 localStorage 等浏览器 API
const UserProvider = dynamic(
  () => import('@/contexts/UserContext').then((mod) => mod.UserProvider),
  { ssr: false }
);

const CustomerProvider = dynamic(
  () => import('@/contexts/CustomerContext').then((mod) => mod.CustomerProvider),
  { ssr: false }
);

const SupplierProvider = dynamic(
  () => import('@/contexts/SupplierContext').then((mod) => mod.SupplierProvider),
  { ssr: false }
);

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <CustomerProvider>
        <SupplierProvider>
          <SwitchProvider>
            {/* #[20260901-1300] P2-3：命令式确认对话框（替代原生 window.confirm） */}
            <ConfirmDialogProvider>{children}</ConfirmDialogProvider>
          </SwitchProvider>
        </SupplierProvider>
      </CustomerProvider>
    </UserProvider>
  );
}
