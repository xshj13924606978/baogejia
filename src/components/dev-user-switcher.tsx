'use client';

import { useState, useEffect } from 'react';
import { useUser } from '@/contexts/UserContext';

// 预定义测试用户（使用真实 DB UUID，确保 API 查询不会因非 UUID 报错）
const TEST_USERS = [
  {
    id: '8aab9b65-32e1-41d2-80c3-8be24fa30059',
    email: 'admin2@test.com',
    username: 'admin2',
    role: 'super_admin',
    level: 5,
    currentPoints: 9999,
    name: '超级管理员',
    description: '全部权限，可管理所有内容'
  },
  {
    id: 'e2f2301b-ae9c-4993-8175-f264f3c1144a',
    email: 'enterprise@test.com',
    username: 'enterprise',
    role: 'enterprise_admin',
    level: 4,
    currentPoints: 8000,
    name: '企业管理员',
    description: '企业用户，可管理企业资料'
  },
  {
    id: '045842e8-b8cb-4ffd-8455-cad855398b55',
    email: 'vip2@test.com',
    username: 'vip2',
    role: 'vip',
    level: 3,
    currentPoints: 5000,
    name: 'VIP会员',
    description: '高级会员，更多功能'
  },
  {
    id: '394ccafb-61ab-482d-8b1e-3acd22a832ec',
    email: 'premium@test.com',
    username: 'premium',
    role: 'premium',
    level: 2,
    currentPoints: 3000,
    name: '普通会员',
    description: '基础功能，有限制'
  },
  {
    id: '883f13e3-5a34-461e-a338-f6c59f7aaafb',
    email: 'free@test.com',
    username: 'free',
    role: 'free',
    level: 1,
    currentPoints: 100,
    name: '免费用户',
    description: '基础功能，较多限制'
  },
  {
    id: '883f13e3-5a34-461e-a338-f6c59f7aaafb',
    email: 'pending@test.com',
    username: 'pending',
    role: 'pending',
    level: 0,
    currentPoints: 0,
    name: '待审核用户',
    description: '未通过审核，功能受限'
  }
];

const ROLE_COLORS: Record<string, string> = {
  super_admin: 'bg-red-100 text-red-700',
  admin: 'bg-orange-100 text-orange-700',
  enterprise_admin: 'bg-purple-100 text-purple-700',
  vip: 'bg-yellow-100 text-yellow-700',
  premium: 'bg-green-100 text-green-700',
  free: 'bg-gray-100 text-gray-600',
  pending: 'bg-gray-200 text-gray-500',
};

export function DevUserSwitcher() {
  const [isOpen, setIsOpen] = useState(false);
  const [currentUser, setCurrentUser] = useState<string | null>(null);
  const { user } = useUser();

  useEffect(() => {
    const saved = localStorage.getItem('dev_test_user');
    if (saved) {
      try {
        const u = JSON.parse(saved);
        setCurrentUser(u.email);
      } catch { /* ignore */ }
    } else {
      setCurrentUser('admin2@test.com');
    }
  }, []);

  if (process.env.NODE_ENV !== 'development') return null;

  const switchUser = (testUser: (typeof TEST_USERS)[0]) => {
    localStorage.setItem('dev_test_user', JSON.stringify(testUser));
    setCurrentUser(testUser.email);
    window.location.reload();
  };

  const resetToDefault = () => {
    localStorage.removeItem('dev_test_user');
    setCurrentUser('admin2@test.com');
    window.location.reload();
  };

  return (
    <div className="fixed bottom-4 right-4 z-[9999]">
      <div className="relative">
        <button
          onClick={() => setIsOpen(!isOpen)}
          className="bg-blue-600 hover:bg-blue-700 text-white px-3 py-2 rounded-lg shadow-lg text-sm font-medium flex items-center gap-2"
        >
          <span>👤</span>
          <span>测试用户: {currentUser?.split('@')[0] || 'admin2'}</span>
          <span className="text-xs">▼</span>
        </button>

        {isOpen && (
          <>
            {/* 点击外部关闭 */}
            <div className="fixed inset-0" onClick={() => setIsOpen(false)} />
            <div className="absolute bottom-full right-0 mb-2 w-80 bg-white rounded-lg shadow-xl border border-gray-200 overflow-hidden">
              <div className="p-3 bg-gray-50 border-b border-gray-200">
                <h3 className="font-medium text-gray-800">切换测试用户</h3>
                <p className="text-xs text-gray-500">当前用户: {user?.email}</p>
              </div>
              <div className="max-h-96 overflow-y-auto">
                {TEST_USERS.map((testUser) => (
                  <button
                    key={testUser.email}
                    onClick={() => switchUser(testUser)}
                    className={`w-full text-left px-3 py-2 hover:bg-gray-50 border-b border-gray-100 transition-colors ${
                      currentUser === testUser.email ? 'bg-blue-50' : ''
                    }`}
                  >
                    <div className="flex items-center justify-between">
                      <span className="font-medium text-sm">{testUser.name}</span>
                      <span className={`text-xs px-2 py-0.5 rounded-full ${ROLE_COLORS[testUser.role] || 'bg-gray-100 text-gray-600'}`}>
                        {testUser.role}
                      </span>
                    </div>
                    <div className="text-xs text-gray-500 mt-0.5">
                      {testUser.email} | Lv.{testUser.level} | {testUser.currentPoints}分
                    </div>
                    <div className="text-xs text-gray-400 mt-0.5">
                      {testUser.description}
                    </div>
                  </button>
                ))}
              </div>
              <div className="p-2 bg-gray-50 border-t border-gray-200">
                <button
                  onClick={resetToDefault}
                  className="w-full text-center text-xs text-blue-600 hover:text-blue-800 py-1"
                >
                  重置为默认用户（超级管理员）
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}
