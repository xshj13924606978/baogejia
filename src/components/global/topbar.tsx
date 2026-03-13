'use client';

import { NotificationPanel } from '@/components/notification-panel/notification-panel';
import { OnlineUsersCount } from '@/components/online-status/online-indicator';
import { useRouter } from 'next/navigation';

export function TopBar() {
  const router = useRouter();

  const userId =
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}')?.id : null;

  return (
    <header className="fixed top-0 left-0 right-0 bg-white border-b z-50">
      <div className="max-w-7xl mx-auto px-4 sm:px-6 lg:px-8">
        <div className="flex justify-between items-center h-16">
          {/* Logo 和导航 */}
          <div className="flex items-center gap-8">
            <div
              className="flex items-center gap-2 cursor-pointer"
              onClick={() => router.push('/')}
            >
              <div className="w-8 h-8 bg-blue-500 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-sm">报</span>
              </div>
              <span className="text-lg font-semibold">报个价</span>
            </div>

            <nav className="hidden md:flex items-center gap-6">
              <button
                onClick={() => router.push('/')}
                className="text-gray-700 hover:text-blue-600 transition-colors"
              >
                首页
              </button>
              <button
                onClick={() => router.push('/realtime-demo')}
                className="text-gray-700 hover:text-blue-600 transition-colors"
              >
                实时演示
              </button>
            </nav>
          </div>

          {/* 右侧工具栏 */}
          <div className="flex items-center gap-4">
            {/* 在线用户数 */}
            <OnlineUsersCount />

            {/* 通知按钮 */}
            <NotificationPanel userId={userId} />

            {/* 用户菜单 */}
            {userId ? (
              <button
                onClick={() => router.push('/user')}
                className="flex items-center gap-2 px-3 py-2 rounded-lg hover:bg-gray-100 transition-colors"
              >
                <div className="w-8 h-8 bg-blue-100 rounded-full flex items-center justify-center">
                  <span className="text-blue-600 font-medium text-sm">U</span>
                </div>
                <span className="text-sm font-medium text-gray-700">个人中心</span>
              </button>
            ) : (
              <button
                onClick={() => router.push('/login')}
                className="px-4 py-2 bg-blue-500 text-white rounded-lg hover:bg-blue-600 transition-colors"
              >
                登录
              </button>
            )}
          </div>
        </div>
      </div>
    </header>
  );
}
