// 必须最先导入 - 在所有其他模块加载之前过滤 Console Bridge 警告
import '@/lib/console-filter';

import { UserProvider } from '@/contexts/UserContext';
import { SwitchProvider } from '@/components/switch-manager';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'] });

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  maximumScale: 1,
  userScalable: false,
  viewportFit: 'cover',
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body className={inter.className}>
        <UserProvider>
          <SwitchProvider>{children}</SwitchProvider>
        </UserProvider>
      </body>
    </html>
  );
}
