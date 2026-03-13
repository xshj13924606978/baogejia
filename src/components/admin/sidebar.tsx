'use client';

import Link from 'next/link';
import { usePathname } from 'next/navigation';

export default function AdminSidebar() {
  const pathname = usePathname();

  const menus = [
    {
      name: '仪表盘',
      icon: '📊',
      path: '/admin',
    },
    {
      name: '用户管理',
      icon: '👥',
      path: '/admin/users',
    },
    {
      name: '产品价格库',
      icon: '📦',
      path: '/admin/products',
    },
    {
      name: '内容审核',
      icon: '📋',
      path: '/admin/audit',
    },
    {
      name: '数据统计',
      icon: '📈',
      path: '/admin/stats',
    },
    {
      name: '系统配置',
      icon: '⚙️',
      path: '/admin/settings',
    },
  ];

  return (
    <div className="w-64 bg-white border-r h-screen flex flex-col">
      <div className="p-4 border-b">
        <h2 className="text-lg font-bold">⚙️ 管理后台</h2>
        <div className="text-xs text-gray-500 mt-1">
          v{process.env.NEXT_PUBLIC_VERSION || '1.0.0'}
        </div>
      </div>

      <div className="p-3 flex-1 overflow-auto">
        {menus.map((menu) => (
          <Link
            key={menu.path}
            href={menu.path}
            className={`flex items-center gap-2 px-3 py-2 rounded mb-1 text-sm transition-colors ${
              pathname === menu.path
                ? 'bg-blue-50 text-blue-600 font-medium'
                : 'hover:bg-gray-50 text-gray-700'
            }`}
          >
            <span className="text-base">{menu.icon}</span>
            <span>{menu.name}</span>
          </Link>
        ))}
      </div>

      <div className="p-4 border-t">
        <Link
          href="/"
          className="flex items-center gap-2 px-3 py-2 rounded text-sm text-gray-700 hover:bg-gray-50 transition-colors"
        >
          <span className="text-base">🏠</span>
          <span>返回首页</span>
        </Link>
      </div>
    </div>
  );
}
