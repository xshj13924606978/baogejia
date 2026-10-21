// 必须最先导入 - 在所有其他模块加载之前过滤 Console Bridge 警告
import '@/lib/console-filter';

import { Providers } from '@/components/Providers';
import { Toaster } from '@/components/ui/toaster';
// #[20260901-1300] P1-1：挂载 sonner Toaster。此前仅挂载了 radix Toaster，
// 导致 64+ 文件 import { toast } from 'sonner' 的调用无渲染器，提示静默丢失。
import { Toaster as SonnerToaster } from 'sonner';
import { Inter } from 'next/font/google';
import './globals.css';

const inter = Inter({ subsets: ['latin'], preload: false });

export const viewport = {
  width: 'device-width',
  initialScale: 1,
  // #[20260901-1300] P2-2：允许双指缩放（可访问性 WCAG 1.4.4 文本可缩放），
  // 移除 maximumScale: 1 与 userScalable: false
  viewportFit: 'cover',
  themeColor: '#0a4a7a',
};

export const metadata = {
  title: '报价系统',
  description: '全行业报价与技术方案智能助手',
  appleWebApp: {
    capable: true,
    statusBarStyle: 'black-translucent',
  },
};

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <head>
        <link rel="manifest" href="/manifest.json" />
        <meta name="apple-mobile-web-app-capable" content="yes" />
        <meta name="apple-mobile-web-app-status-bar-style" content="black-translucent" />
      </head>
      <body className={inter.className}>
        <Providers>{children}</Providers>
        {/* radix toast 渲染器（useToast） */}
        <Toaster />
        {/* sonner toast 渲染器（import { toast } from 'sonner'），与 radix 并存期间双渲染器均需挂载 */}
        <SonnerToaster position="bottom-right" closeButton />
      </body>
    </html>
  );
}
