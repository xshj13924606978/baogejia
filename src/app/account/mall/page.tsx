'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AccountPageLayout from '@/components/user/account-page-layout';
import PointsMall from '@/components/user/points-mall';
import { useUser } from '@/hooks/use-user';

export default function PointsMallPage() {
  const { user, loading } = useUser();
  const router = useRouter();

  useEffect(() => {
    if (!loading && !user) {
      router.replace('/login');
    }
  }, [loading, user, router]);

  if (loading || !user) {
    return (
      <div className="min-h-screen flex items-center justify-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin" />
        加载中...
      </div>
    );
  }

  return (
    <AccountPageLayout title="积分商城">
      <PointsMall user={user as any} />
    </AccountPageLayout>
  );
}
