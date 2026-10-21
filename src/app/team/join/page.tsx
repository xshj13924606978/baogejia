'use client';

/**
 * #[20260902-0900] 接受团队邀请页面
 *
 * 受邀人通过邀请链接（/team/join?token=xxx）进入本页面，
 * 确认后凭一次性 token 加入团队，成功后跳转到该团队详情页。
 *
 * 说明：本页需要登录后访问（未登录由全局 proxy 重定向到登录页）。
 */

import { Suspense, useEffect, useState } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowLeft, Loader2, UserPlus, AlertTriangle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';

function JoinTeamContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const token = searchParams.get('token') || '';

  const [joining, setJoining] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!token) {
      setError('无效的邀请链接：缺少邀请 token');
    }
  }, [token]);

  const handleJoin = async () => {
    if (!token) return;

    setJoining(true);
    setError(null);
    try {
      const response = await fetch('/api/teams/invites', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token }),
      });

      const result = await response.json();

      if (!response.ok || !result.success) {
        // 未登录时引导先登录，登录后回到本页继续加入
        if (response.status === 401) {
          setError('请先登录后再接受邀请');
          router.push(`/login?redirect=${encodeURIComponent(window.location.pathname + window.location.search)}`);
          return;
        }
        setError(result?.error || '接受邀请失败');
        return;
      }

      toast.success('已成功加入团队');
      const teamId = result?.data?.teamId;
      router.push(teamId ? `/team/${teamId}` : '/team');
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="min-h-screen bg-gray-50">
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <Button variant="ghost" size="sm" asChild>
          <Link href="/team">
            <ArrowLeft className="h-4 w-4 mr-1" />
            返回团队
          </Link>
        </Button>
        <div className="flex items-center gap-2">
          <UserPlus className="h-5 w-5 text-blue-500" />
          <h1 className="text-lg font-semibold">加入团队</h1>
        </div>
      </div>

      <div className="max-w-xl mx-auto px-4 py-8">
        <Card>
          <CardHeader>
            <CardTitle className="text-base">接受团队邀请</CardTitle>
            <CardDescription>
              你被邀请加入一个团队，确认后将立即成为该团队成员。
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {error ? (
              <div className="flex items-start gap-2 rounded-md border border-amber-200 bg-amber-50 p-3 text-sm text-amber-800">
                <AlertTriangle className="h-4 w-4 mt-0.5 shrink-0" />
                <div className="space-y-2">
                  <p>{error}</p>
                  {error === '请先登录后再接受邀请' && (
                    <Button size="sm" variant="outline" asChild>
                      <Link
                        href={`/login?redirect=${encodeURIComponent(`/team/join?token=${token}`)}`}
                      >
                        去登录
                      </Link>
                    </Button>
                  )}
                </div>
              </div>
            ) : (
              <p className="text-sm text-gray-600">
                邀请链接有效，点击下方按钮即可加入团队。邀请链接 7 天内有效，且仅可使用一次。
              </p>
            )}

            <div className="flex gap-2">
              <Button onClick={handleJoin} disabled={!token || joining}>
                {joining && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
                {joining ? '加入中...' : '确认加入团队'}
              </Button>
              <Button variant="outline" asChild>
                <Link href="/team">稍后再说</Link>
              </Button>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}

export default function JoinTeamPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-6 w-6 animate-spin text-blue-500" />
        </div>
      }
    >
      <JoinTeamContent />
    </Suspense>
  );
}
