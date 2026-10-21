'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@/contexts/UserContext';
import { loadMinPasswordLength } from '@/lib/password-policy';

/**
 * 重置密码页面（#[20260830-1144] 修复）
 * 流程：从 /forgot-password 跳转过来（携带 phone 参数，验证码已发送）→
 *       输入短信验证码 + 新密码 → 提交 /api/auth/reset-password → 成功后自动登录进入系统
 * - 手机号从 URL 参数读取并只读展示，不再提供「获取验证码」按钮，避免重复发送/混淆；
 * - 所有输入项默认空值，禁用浏览器自动填充（autoComplete="off" + 随机 formKey），杜绝虚假数据；
 * - 密码最小长度与管理后台 site_config.password_min_length 动态同步，不再硬编码；
 * - 重置成功后立即调用 passwordLogin 自动登录并跳转首页，不再回到登录页。
 */
const validatePhone = (phone: string) => /^1[3-9]\d{9}$/.test(phone);

export default function ResetPasswordPage() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const { toast } = useToast();
  const { passwordLogin } = useUser();

  const phoneParam = searchParams.get('phone') || '';
  const isPhoneValid = useMemo(() => validatePhone(phoneParam.trim()), [phoneParam]);
  // 随机 formKey 防止浏览器自动填充历史密码/验证码
  const [formKey] = useState(() => Math.random().toString(36).slice(2));

  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [minLength, setMinLength] = useState(8);
  const [error, setError] = useState('');

  // 动态加载后端密码策略（site_config.password_min_length）
  useEffect(() => {
    loadMinPasswordLength().then((len) => setMinLength(len));
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError('');

    if (!isPhoneValid) {
      setError('手机号参数无效，请返回忘记密码页面重新发送验证码');
      return;
    }
    if (!/^\d{6}$/.test(code)) {
      setError('请输入6位验证码');
      return;
    }
    if (newPassword.length < minLength) {
      setError(`新密码至少 ${minLength} 位`);
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次输入的密码不一致');
      return;
    }

    setLoading(true);
    try {
      const res = await fetch('/api/auth/reset-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          phone: phoneParam.trim(),
          code: code.trim(),
          newPassword,
        }),
      });
      const data = await res.json();
      if (!res.ok || !data.success) {
        setError(data.error || '重置失败，请检查验证码或稍后重试');
        return;
      }

      toast({
        title: '密码重置成功',
        description: '正在自动登录，请稍候',
        duration: 2000,
      });

      // 重置成功后立即用新密码自动登录，直接进入系统
      const loginResult = await passwordLogin(phoneParam.trim(), newPassword);
      if (loginResult.success) {
        toast({
          title: '登录成功',
          description: '欢迎回来',
          duration: 2000,
        });
        router.replace('/');
      } else {
        setError(loginResult.error || '自动登录失败，请返回登录页手动登录');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  const canSubmit = !loading && !!(isPhoneValid && code && newPassword && confirmPassword);

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4 dark:bg-gray-950">
      <div className="w-full max-w-md">
        <Card>
          <CardHeader className="text-center">
            <CardTitle className="text-2xl">重置密码</CardTitle>
            <CardDescription>
              请输入短信验证码，验证通过后设置新密码
            </CardDescription>
          </CardHeader>
          <CardContent>
            <form key={formKey} onSubmit={handleSubmit} className="space-y-4" autoComplete="off">
              {error && (
                <div className="p-3 bg-red-50 text-red-600 rounded-lg text-sm">
                  {error}
                </div>
              )}

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  手机号 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="tel"
                  inputMode="numeric"
                  maxLength={11}
                  value={phoneParam}
                  readOnly
                  disabled
                  autoComplete="off"
                  className="bg-gray-100 text-gray-700 cursor-not-allowed"
                />
                <p className="text-xs text-gray-400">手机号已在忘记密码页验证，此处不可修改</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  验证码 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="text"
                  inputMode="numeric"
                  maxLength={6}
                  value={code}
                  onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="请输入6位验证码"
                  disabled={loading}
                  autoComplete="off"
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  新密码 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={`至少 ${minLength} 位`}
                  disabled={loading}
                  autoComplete="new-password"
                />
                <p className="text-xs text-gray-400">密码最小长度与后台安全设置动态同步（当前为 {minLength} 位）</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">
                  确认新密码 <span className="text-red-500">*</span>
                </label>
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请再次输入新密码"
                  disabled={loading}
                  autoComplete="new-password"
                />
              </div>

              <Button type="submit" className="w-full" disabled={!canSubmit}>
                {loading ? '保存中...' : '保存并登录'}
              </Button>

              <div className="text-center">
                <Link href="/login" className="text-sm text-primary hover:underline">
                  返回登录
                </Link>
              </div>
            </form>
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
