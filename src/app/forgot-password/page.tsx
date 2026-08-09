'use client';

import React, { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';

/**
 * 忘记密码页面
 * 流程：输入手机号/邮箱 → 获取验证码 → 验证并设置新密码
 */
export default function ForgotPasswordPage() {
  const router = useRouter();
  const [step, setStep] = useState<'input' | 'code' | 'password'>('input');
  const [account, setAccount] = useState('');
  const [code, setCode] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const [error, setError] = useState('');
  const [successMsg, setSuccessMsg] = useState('');

  const isEmail = (s: string) => /^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(s);
  const isPhone = (s: string) => /^1[3-9]\d{9}$/.test(s);

  // 发送验证码
  const handleSendCode = async () => {
    setError('');
    if (!isEmail(account) && !isPhone(account)) {
      setError('请输入正确的邮箱或手机号');
      return;
    }
    // 邮箱找回密码暂依赖短信服务，引导用户使用手机号
    if (isEmail(account)) {
      setError('邮箱找回密码功能开发中，请使用手机号找回');
      return;
    }
    setSendingCode(true);
    try {
      const res = await fetch('/api/auth/send-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: account }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setStep('code');
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) { clearInterval(timer); return 0; }
            return prev - 1;
          });
        }, 1000);
      } else {
        setError(data.error || '验证码发送失败，请稍后重试');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setSendingCode(false);
    }
  };

  // 验证验证码，进入密码设置
  const handleVerifyCode = async () => {
    setError('');
    if (!code || code.length !== 6) {
      setError('请输入 6 位验证码');
      return;
    }
    setStep('password');
  };

  // 提交重置密码
  const handleResetPassword = async () => {
    setError('');
    if (newPassword.length < 6) {
      setError('密码长度至少 6 位');
      return;
    }
    if (newPassword !== confirmPassword) {
      setError('两次密码不一致');
      return;
    }
    setLoading(true);
    try {
      const body = { phone: account, code, newPassword };

      const res = await fetch('/api/auth/forgot-password', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setSuccessMsg('密码重置成功，即将跳转到登录页...');
        setTimeout(() => router.push('/login'), 2000);
      } else {
        setError(data.error || '重置失败，请稍后重试');
        setStep('input');
      }
    } catch {
      setError('网络错误，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 px-4">
      <div className="w-full max-w-md">
        <div className="bg-white rounded-2xl shadow-lg p-8">
          <div className="text-center mb-8">
            <h1 className="text-2xl font-bold text-gray-900">忘记密码</h1>
            <p className="text-gray-500 mt-2">
              {step === 'input' && '请输入您的注册邮箱或手机号'}
              {step === 'code' && '请输入收到的验证码'}
              {step === 'password' && '请设置新密码'}
            </p>
          </div>

          {successMsg && (
            <div className="mb-4 p-3 bg-green-50 text-green-700 rounded-lg text-sm text-center">
              {successMsg}
            </div>
          )}

          {error && (
            <div className="mb-4 p-3 bg-red-50 text-red-600 rounded-lg text-sm">
              {error}
            </div>
          )}

          {/* Step 1: 输入账号 */}
          {step === 'input' && (
            <div className="space-y-4">
              <input
                type="text"
                value={account}
                onChange={(e) => setAccount(e.target.value)}
                placeholder="输入邮箱或手机号"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
                disabled={sendingCode}
              />
              <button
                onClick={handleSendCode}
                disabled={sendingCode || !account}
                className="w-full py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
              >
                {sendingCode ? '发送中...' : '获取验证码'}
              </button>
            </div>
          )}

          {/* Step 2: 输入验证码 */}
          {step === 'code' && (
            <div className="space-y-4">
              <div className="text-sm text-gray-500">
                验证码已发送至 <span className="font-medium text-gray-700">{account}</span>
              </div>
              <input
                type="text"
                value={code}
                onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                placeholder="输入 6 位验证码"
                maxLength={6}
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent text-center text-xl tracking-widest"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('input')}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  返回
                </button>
                <button
                  onClick={handleVerifyCode}
                  disabled={code.length !== 6}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  验证
                </button>
              </div>
              <button
                onClick={handleSendCode}
                disabled={sendingCode || countdown > 0}
                className="w-full text-sm text-blue-600 hover:underline disabled:text-gray-400 disabled:cursor-not-allowed"
              >
                {countdown > 0 ? `${countdown} 秒后重新发送` : '重新发送验证码'}
              </button>
            </div>
          )}

          {/* Step 3: 设置新密码 */}
          {step === 'password' && (
            <div className="space-y-4">
              <input
                type="password"
                value={newPassword}
                onChange={(e) => setNewPassword(e.target.value)}
                placeholder="输入新密码（至少 6 位）"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <input
                type="password"
                value={confirmPassword}
                onChange={(e) => setConfirmPassword(e.target.value)}
                placeholder="确认新密码"
                className="w-full px-4 py-3 border border-gray-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500 focus:border-transparent"
              />
              <div className="flex gap-3">
                <button
                  onClick={() => setStep('code')}
                  className="flex-1 py-3 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50 transition-colors"
                >
                  返回
                </button>
                <button
                  onClick={handleResetPassword}
                  disabled={loading}
                  className="flex-1 py-3 bg-blue-600 text-white rounded-lg hover:bg-blue-700 disabled:bg-gray-300 disabled:cursor-not-allowed transition-colors"
                >
                  {loading ? '提交中...' : '重置密码'}
                </button>
              </div>
            </div>
          )}

          <div className="mt-6 text-center">
            <Link href="/login" className="text-sm text-blue-600 hover:underline">
              返回登录
            </Link>
          </div>
        </div>
      </div>
    </div>
  );
}
