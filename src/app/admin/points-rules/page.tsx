'use client';

import PointsRulesManager from '@/components/admin/points-rules/points-rules-manager';
import { useUser } from '@/contexts/UserContext';
import { Loader2 } from 'lucide-react';

export default function PointsRulesPage() {
  const { user, loading } = useUser();

  if (loading) {
    return (
      <div className="flex items-center justify-center h-full">
        <Loader2 className="h-8 w-8 animate-spin text-blue-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="p-6">
        <h1 className="text-2xl font-bold mb-4">未登录</h1>
        <p>请先登录后访问积分规则管理页面。</p>
      </div>
    );
  }

  return (
    <div className="h-full flex flex-col">
      <PointsRulesManager
        userId={user.id}
        userRole={user.role || ''}
      />
    </div>
  );
}
