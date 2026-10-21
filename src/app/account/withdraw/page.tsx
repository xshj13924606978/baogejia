'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AccountPageLayout from '@/components/user/account-page-layout';
import WithdrawPanel from '@/components/user/withdraw-panel';
import { useUser } from '@/hooks/use-user';

export default function WithdrawPage() {
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
    <AccountPageLayout title="积分提现">
      <WithdrawPanel user={user as any} />
    </AccountPageLayout>
  );
}
