'use client';

import { useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Loader2 } from 'lucide-react';
import AccountPageLayout from '@/components/user/account-page-layout';
import { PermissionPanel } from '@/components/user/PermissionPanel';
import { useUser } from '@/hooks/use-user';

/**
 * 权限升级页（#202608302800 P0-2）
 *
 * 与 /account/membership、/account/token 等并列，由用户菜单
 * （user_pages.route_path = '/account/permissions'，action_type = 'navigate'）跳转进入。
 * 此处为兑换入口的真实可达路径：user-sidebar 当前未被挂载，仅为兼容保留。
 */
export default function PermissionsPage() {
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
    <AccountPageLayout title="权限升级">
      <PermissionPanel />
    </AccountPageLayout>
  );
}
