'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@/contexts/UserContext';
import { ShieldCheck, UserRound, ArrowRight, CheckCircle2 } from 'lucide-react';
import { COMPLETE_PROFILE_TEXT } from '@/lib/constants/auth';

// 微信昵称清洗：仅保留字母/数字/下划线/中文，2-30 位（与 /api/auth/profile 用户名规则一致）
function sanitizeNickname(raw: string): string {
  const cleaned = raw.replace(/[^\w\u4e00-\u9fa5]/g, '').slice(0, 30);
  return cleaned.length >= 2 ? cleaned : '';
}

// 是否为系统自动生成的临时用户名（如 user_1381、11位手机号）
function isTempUsername(name: string): boolean {
  return /^user_\d{4}$/.test(name) || /^1\d{10}$/.test(name);
}

type ProfileUser = {
  username?: string;
  name?: string;
  wechat?: { nickname?: string } | null;
};

// 用户名是否缺失（未设置或为系统自动生成）
function isUsernameMissing(user: ProfileUser | null | undefined): boolean {
  return !user?.username || isTempUsername(user.username);
}

// 姓名是否缺失
function isNameMissing(user: ProfileUser | null | undefined): boolean {
  return !user?.name?.trim();
}

/**
 * 完善账号信息页（#[20260829-1700] 重构）
 *
 * 设计原则「注册即登录，完善可选」：
 * - 仅显示缺失项（用户名缺失显示用户名、姓名缺失显示姓名），已有一律不显示；
 * - 已移除密码设置与微信绑定（密码在「账号安全」中设置，微信在扫码流程中自动绑定，
 *   避免与注册/扫码流程重复设置、双重跳转）；
 * - 所有操作均即时生效，保存后整页跳转首页（UserContext 重新加载恢复已登录状态）。
 */
export default function CompleteProfilePage() {
  const router = useRouter();
  const { toast } = useToast();
  const { user, loading: userLoading, refreshUser } = useUser();

  const [username, setUsername] = useState('');
  const [name, setName] = useState('');
  const [loading, setLoading] = useState(false);
  const [initialized, setInitialized] = useState(false);

  // 预填当前用户名 / 姓名
  useEffect(() => {
    if (!user || initialized) return;
    if (user.username && !isTempUsername(user.username)) {
      setUsername(user.username);
    }
    if (user.name) {
      setName(user.name);
    }
    setInitialized(true);
  }, [user, initialized]);

  // 未登录用户访问引导页时回到登录
  useEffect(() => {
    if (userLoading) return;
    if (user === null) {
      toast({ title: COMPLETE_PROFILE_TEXT.toast.notLoggedIn, variant: 'destructive' });
      router.replace('/login');
    }
  }, [user, userLoading, router, toast]);

  // 检测已绑定微信昵称，覆盖自动生成的临时用户名（#20260821-0930）
  useEffect(() => {
    if (!user || !isUsernameMissing(user)) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch('/api/auth/wechat/nickname');
        const data = await res.json();
        if (cancelled || !data.success || !data.nickname) return;
        const nick = sanitizeNickname(data.nickname);
        if (!nick) return;
        setUsername((prev) => (isTempUsername(prev) ? nick : prev));
      } catch {
        // 静默失败：保留现有用户名（自动生成的临时用户名）
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [user]);

  // 所有项均已完善 → 直接进入系统（无需展示表单）
  const allComplete =
    user && initialized && !isUsernameMissing(user) && !isNameMissing(user);

  useEffect(() => {
    if (allComplete) {
      router.replace('/');
    }
  }, [allComplete, router]);

  // 保存缺失项（仅提交缺失且已填写的字段）
  const handleSave = async () => {
    setLoading(true);
    try {
      const payload: Record<string, string> = {};
      if (isUsernameMissing(user)) {
        const trimmed = username.trim();
        if (trimmed) payload.username = trimmed;
      }
      if (isNameMissing(user)) {
        const trimmed = name.trim();
        if (trimmed) payload.name = trimmed;
      }
      if (Object.keys(payload).length === 0) {
        router.replace('/');
        return;
      }

      const sessionToken =
        typeof window !== 'undefined' ? window.localStorage.getItem('session_token') : null;
      const headers: Record<string, string> = { 'Content-Type': 'application/json' };
      if (sessionToken) headers['x-user-token'] = sessionToken;

      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers,
        body: JSON.stringify(payload),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: COMPLETE_PROFILE_TEXT.success });
        try {
          await refreshUser?.();
        } catch {
          // 忽略刷新失败，整页跳转后会自动加载
        }
        // 整页跳转：UserContext 重新加载，立即恢复已登录状态
        window.location.href = '/';
      } else {
        toast({ title: data.error || COMPLETE_PROFILE_TEXT.toast.saveFailed, variant: 'destructive' });
      }
    } catch {
      toast({ title: COMPLETE_PROFILE_TEXT.toast.saveFailed, variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  const handleSkip = () => {
    window.location.href = '/';
  };

  const showUsername = Boolean(user && isUsernameMissing(user));
  const showName = Boolean(user && isNameMissing(user));
  const canSave = loading || (showUsername && !username.trim()) || (showName && !name.trim());

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 py-8">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <div className="mx-auto mb-3 flex h-14 w-14 items-center justify-center rounded-2xl bg-blue-600 text-white">
            <ShieldCheck className="h-7 w-7" />
          </div>
          <CardTitle className="text-2xl font-bold">{COMPLETE_PROFILE_TEXT.cardTitle}</CardTitle>
          <CardDescription>{COMPLETE_PROFILE_TEXT.cardDescription}</CardDescription>
        </CardHeader>
        <CardContent className="space-y-5">
          {/* 全部完善 → 无需操作 */}
          {allComplete && (
            <div className="flex flex-col items-center gap-3 py-6">
              <CheckCircle2 className="h-10 w-10 text-emerald-500" />
              <p className="text-sm text-slate-600">{COMPLETE_PROFILE_TEXT.allCompleteDesc}</p>
            </div>
          )}

          {/* 用户名（缺失时才显示） */}
          {showUsername && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <UserRound className="h-4 w-4 text-slate-400" />
                {COMPLETE_PROFILE_TEXT.usernameLabel}
                <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder={COMPLETE_PROFILE_TEXT.usernamePlaceholder}
                value={username}
                maxLength={30}
                onChange={(e) => setUsername(e.target.value)}
                autoComplete="off"
              />
              <p className="text-xs text-slate-400">{COMPLETE_PROFILE_TEXT.usernameHint}</p>
            </div>
          )}

          {/* 姓名（缺失时才显示） */}
          {showName && (
            <div className="space-y-1.5">
              <label className="text-sm font-medium text-slate-700 flex items-center gap-1.5">
                <UserRound className="h-4 w-4 text-slate-400" />
                {COMPLETE_PROFILE_TEXT.nameLabel}
                <span className="text-red-500">*</span>
              </label>
              <Input
                placeholder={COMPLETE_PROFILE_TEXT.namePlaceholder}
                value={name}
                maxLength={30}
                onChange={(e) => setName(e.target.value)}
                autoComplete="name"
              />
              <p className="text-xs text-slate-400">{COMPLETE_PROFILE_TEXT.nameHint}</p>
            </div>
          )}

          {!allComplete && (
            <>
              <Button className="w-full" onClick={handleSave} disabled={canSave}>
                {loading ? COMPLETE_PROFILE_TEXT.submitting : COMPLETE_PROFILE_TEXT.submit}
                {!loading && <ArrowRight className="ml-2 h-4 w-4" />}
              </Button>

              <button
                type="button"
                className="w-full text-center text-sm text-slate-400 hover:text-slate-600"
                onClick={handleSkip}
              >
                {COMPLETE_PROFILE_TEXT.skip}
              </button>
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
