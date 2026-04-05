'use client';

import dynamic from 'next/dynamic';
import { SwitchProvider } from '@/components/switch-manager';

// 禁用 SSR：UserProvider 依赖 localStorage 等浏览器 API
const UserProvider = dynamic(
  () => import('@/contexts/UserContext').then((mod) => mod.UserProvider),
  { ssr: false }
);

const CustomerProvider = dynamic(
  () => import('@/contexts/CustomerContext').then((mod) => mod.CustomerProvider),
  { ssr: false }
);

// 开发环境用户切换器
const DevUserSwitcher = process.env.NODE_ENV === 'development'
  ? dynamic(() => import('@/components/dev-user-switcher').then((mod) => mod.DevUserSwitcher), { ssr: false })
  : () => null;

export function Providers({ children }: { children: React.ReactNode }) {
  return (
    <UserProvider>
      <CustomerProvider>
        <SwitchProvider>{children}</SwitchProvider>
        <DevUserSwitcher />
      </CustomerProvider>
    </UserProvider>
  );
}
