'use client';

import React, { useState, Suspense, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@/contexts/UserContext';
import { Link2, UserPlus, Gift } from 'lucide-react';
import { REGISTER_TEXT } from '@/lib/constants/auth';

// 验证手机号格式（1 开头，共 11 位）
const PHONE_REGEX = /^1[3-9]\d{9}$/;

function RegisterPageInner() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();

  const inviteCode = searchParams.get('code') || '';

  const [form, setForm] = useState({
    phone: '',
    smsCode: '',
  });
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendCodeLoading, setSendCodeLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);

  // 获取短信验证码（60 秒倒计时）
  const handleSendCode = async () => {
    setError('');
    if (!PHONE_REGEX.test(form.phone.trim())) {
      setError(REGISTER_TEXT.toast.phoneInvalid);
      return;
    }
    setSendCodeLoading(true);
    try {
      const res = await fetch('/api/auth/send-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: form.phone.trim(), purpose: 'register' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        // mock 模式（开发环境）返回验证码，自动填入便于联调
        if (data.code) {
          setForm((prev) => ({ ...prev, smsCode: data.code }));
        }
        setCountdown(60);
        toast({ title: REGISTER_TEXT.toast.codeSent, description: REGISTER_TEXT.toast.codeSentDesc });
      } else {
        setError(data.error || REGISTER_TEXT.toast.sendFailed);
      }
    } catch (_err) {
      setError(REGISTER_TEXT.toast.networkError);
    } finally {
      setSendCodeLoading(false);
    }
  };

  // 验证码倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((c) => {
        if (c <= 1) {
          clearInterval(timer);
          return 0;
        }
        return c - 1;
      });
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  // 处理注册（仅手机号 + 验证码必填）
  const handleRegister = async () => {
    setError('');
    setSuccess('');

    if (!PHONE_REGEX.test(form.phone.trim())) {
      setError(REGISTER_TEXT.toast.phoneRequired);
      return;
    }
    if (!form.smsCode.trim()) {
      setError(REGISTER_TEXT.toast.codeRequired);
      return;
    }

    try {
      setLoading(true);
      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: form.phone.trim(),
          sms_code: form.smsCode.trim(),
          invite_code: inviteCode || undefined,
        }),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess(REGISTER_TEXT.toast.registerSuccessDesc);
        toast({
          title: REGISTER_TEXT.toast.registerSuccess,
          description: REGISTER_TEXT.toast.registerSuccessDesc,
        });
        // 注册即登录：服务端已通过 establishUserSession 签发新会话
        // （新 httpOnly cookie 已覆盖旧 cookie，body 返回 sessionToken + user）。
        // 此处无需也绝不能调用 clearStaleSession()——它会写入 LOGGED_OUT_FLAG
        // （永久阻断后续从 cookie 恢复会话）并调 /api/auth/logout 清空刚签发的新
        // cookie，导致完善信息页 PUT /api/auth/profile 无身份而 401（#20260821-XXXX 根因）。
        // 但若浏览器此前残留主动登出标记（LOGGED_OUT_FLAG），必须在此清除，
        // 否则 complete-profile 页 restoreFromCookie 会被跳过、user 也缺失，
        // 会话丢失（#20260821-2200 根因）。与 passwordLogin/phoneLogin 成功分支对齐：
        // 清除 LOGGED_OUT_FLAG + 写入 user 到 localStorage。
        try {
          localStorage.removeItem('logged_out_flag');
        } catch (_e) {
          // localStorage 不可用时忽略
        }
        if (data.user) {
          try {
            localStorage.setItem('user', JSON.stringify(data.user));
          } catch (_e) {
            // localStorage 不可用时依赖 httpOnly cookie（后端已签发）
          }
        }
        if (data.sessionToken) {
          try {
            localStorage.setItem('session_token', data.sessionToken);
          } catch (_e) {
            // localStorage 不可用时依赖 httpOnly cookie（后端已签发）
          }
        }
        // 注册即登录：直接进入系统（不强制跳转完善信息页，#[20260829-1700]）。
        // ?oauth=login 标记用于 loadUser 清除历史 LOGGED_OUT_FLAG 并即时恢复新会话。
        window.location.href = '/?oauth=login';
      } else {
        setError(data.error || REGISTER_TEXT.toast.registerFailed);
      }
    } catch (_err) {
      setError(REGISTER_TEXT.toast.networkError);
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gradient-to-br from-slate-50 via-white to-blue-50 px-4 py-8">
      <Card className="w-full max-w-md shadow-xl">
        <CardHeader className="text-center">
          <CardTitle className="text-2xl font-bold">{REGISTER_TEXT.cardTitle}</CardTitle>
          <CardDescription className="flex items-center justify-center gap-1.5">
            <UserPlus className="h-4 w-4" />
            {REGISTER_TEXT.cardDescription}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          {inviteCode && (
            <div className="flex items-center gap-2 rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-700">
              <Gift className="h-4 w-4 shrink-0" />
              <span>{REGISTER_TEXT.inviteBanner}</span>
            </div>
          )}

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              {REGISTER_TEXT.phoneLabel} <span className="text-red-500">*</span>
            </label>
            <div className="flex gap-2">
              <Input
                type="tel"
                placeholder={REGISTER_TEXT.phonePlaceholder}
                value={form.phone}
                maxLength={11}
                onChange={(e) => setForm({ ...form, phone: e.target.value.replace(/\D/g, '') })}
                autoComplete="tel"
              />
              <Button
                type="button"
                variant="outline"
                className="w-28 shrink-0"
                onClick={handleSendCode}
                disabled={sendCodeLoading || countdown > 0}
              >
                {countdown > 0
                  ? REGISTER_TEXT.resendAfter(countdown)
                  : sendCodeLoading
                    ? REGISTER_TEXT.sendingCode
                    : REGISTER_TEXT.sendCodeButton}
              </Button>
            </div>
          </div>

          <div className="space-y-1.5">
            <label className="text-sm font-medium text-slate-700">
              {REGISTER_TEXT.codeLabel} <span className="text-red-500">*</span>
            </label>
            <Input
              type="text"
              inputMode="numeric"
              placeholder={REGISTER_TEXT.codePlaceholder}
              value={form.smsCode}
              maxLength={6}
              onChange={(e) => setForm({ ...form, smsCode: e.target.value.replace(/\D/g, '') })}
              autoComplete="one-time-code"
            />
          </div>

          {error && (
            <div className="rounded-lg bg-red-50 border border-red-200 px-3 py-2.5 text-sm text-red-600">
              {error}
            </div>
          )}

          {success && (
            <div className="rounded-lg bg-emerald-50 border border-emerald-200 px-3 py-2.5 text-sm text-emerald-600">
              {success}
            </div>
          )}

          <Button className="w-full" onClick={handleRegister} disabled={loading}>
            {loading ? REGISTER_TEXT.submitting : REGISTER_TEXT.submit}
          </Button>

          <div className="text-center text-sm text-slate-500">
            {REGISTER_TEXT.loginLink}
            <button
              type="button"
              className="ml-1 font-medium text-blue-600 hover:underline"
              onClick={() =>
                router.push(`/login${inviteCode ? `?code=${encodeURIComponent(inviteCode)}` : ''}`)
              }
            >
              {REGISTER_TEXT.loginAction}
            </button>
          </div>

          {inviteCode && (
            <div className="flex items-center justify-center gap-1.5 text-xs text-slate-400 pt-2">
              <Link2 className="h-3.5 w-3.5" />
              {REGISTER_TEXT.inviteCode(inviteCode)}
            </div>
          )}
        </CardContent>
      </Card>
    </div>
  );
}

export default function RegisterPage() {
  return (
    <Suspense fallback={<div className="min-h-screen flex items-center justify-center">{REGISTER_TEXT.loading}</div>}>
      <RegisterPageInner />
    </Suspense>
  );
}
