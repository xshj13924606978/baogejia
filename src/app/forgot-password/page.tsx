'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';

/**
 * 忘记密码页面
 * 流程：输入手机号 → 发送验证码 → 跳转 /reset-password?phone=xxx
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [phone, setPhone] = useState('');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');
  const [sent, setSent] = useState(false);

  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const isPhone = (s: string) => /^1[3-9]\d{9}$/.test(s);

  const handleSendCode = async () => {
    setError('');
    setSuccessMsg('');

    if (!isPhone(phone)) {
      setError('请输入正确的11位手机号');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: phone.trim() }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSent(true);
        setSuccessMsg(data.message || '验证码已发送');
        setCountdown(60);
      } else {
        setError(data.error || '验证码发送失败，请稍后重试');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const handleContinue = () => {
    router.push(`/reset-password?phone=${encodeURIComponent(phone.trim())}`);
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">忘记密码</CardTitle>
            <CardDescription>
              请输入注册手机号，我们将发送验证码用于重置密码
            </CardDescription>
          </CardHeader>
          <CardContent className="space-y-4">
            {successMsg && (
              <div className="p-3 bg-green-50 text-green-700 rounded-lg text-sm text-center">
                {successMsg}
              </div>
            )}
            {error && (
              <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                {error}
              </div>
            )}

            <div className="space-y-2">
              <label className="text-sm font-medium">手机号</label>
              <Input
                type="tel"
                value={phone}
                onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 11))}
                placeholder="请输入11位手机号"
                disabled={loading}
                inputMode="numeric"
              />
            </div>

            {!sent ? (
              <Button
                className="w-full"
                onClick={handleSendCode}
                disabled={loading || !phone}
              >
                {loading ? '发送中...' : '发送验证码'}
              </Button>
            ) : (
              <div className="space-y-3">
                <Button
                  className="w-full"
                  onClick={handleContinue}
                >
                  继续重置密码
                </Button>
                <Button
                  variant="outline"
                  className="w-full"
                  onClick={handleSendCode}
                  disabled={loading || countdown > 0}
                >
                  {countdown > 0 ? `${countdown} 秒后重新发送` : '重新发送验证码'}
                </Button>
              </div>
            )}

            <div className="text-center">
              <Link href="/login" className="text-sm text-primary hover:underline">
                返回登录
              </Link>
            </div>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
