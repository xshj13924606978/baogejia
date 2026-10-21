'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, ShieldCheck } from 'lucide-react';

// 验证手机号格式
const validatePhone = (phone: string): boolean => {
  return /^1[3-9]\d{9}$/.test(phone);
};

/**
 * 扫码登录「绑定已有账号或注册新账号」引导页（#20260828-账号统一）
 *
 * 触发链路：微信/QQ 扫码登录（未绑定账号）→ OAuth 回调暂存身份到 oauth_pending_logins
 * → 重定向到本页（?t=<token>）。
 *
 * 本页职责：用户输入手机号 + 短信验证码，提交 /api/auth/oauth-link：
 *   - 手机号已注册 → 微信绑定到该账号（账号合并，不再产生第二个账号）并登录；
 *   - 手机号未注册 → 注册新账号（经 registerUserByPhone，发放注册积分）并绑定微信后登录。
 */
export default function WechatLinkPage() {
  const router = useRouter();
  const { toast } = useToast();

  const [token, setToken] = useState('');
  const [provider, setProvider] = useState('wechat');
  const [nickname, setNickname] = useState('');
  const [avatar, setAvatar] = useState('');
  const [pendingState, setPendingState] = useState<'loading' | 'ready' | 'invalid'>('loading');
  const [pendingError, setPendingError] = useState('');

  const [phone, setPhone] = useState('');
  const [phoneError, setPhoneError] = useState('');
  const [code, setCode] = useState('');
  const [password, setPassword] = useState('');
  const [countdown, setCountdown] = useState(0);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const [loading, setLoading] = useState(false);
  // #20260828-2156：拉取后端 site_config 密码最小长度，作为前端即时校验（与后端校验保持一致）。
  // 默认 6 兜底，避免 /api/auth/password-policy 暂时不可达时把用户卡住。
  const [passwordMinLength, setPasswordMinLength] = useState(6);
  const passwordRef = useRef<HTMLInputElement | null>(null);
  const codeRef = useRef<HTMLInputElement | null>(null);

  useEffect(() => {
    fetch('/api/auth/password-policy')
      .then((res) => res.json())
      .then((data) => {
        if (data && typeof data.minLength === 'number' && data.minLength > 0) {
          setPasswordMinLength(data.minLength);
        }
      })
      .catch(() => {
        /* 保留默认 */
      });
  }, []);

  // 解析 token 并查询待绑定身份
  useEffect(() => {
    if (typeof window === 'undefined') return;
    const params = new URLSearchParams(window.location.search);
    const t = params.get('t') || '';
    if (!t) {
      setPendingState('invalid');
      setPendingError('缺少登录凭据，请返回登录页重新扫码');
      return;
    }
    setToken(t);
    if (params.get('provider')) setProvider(params.get('provider') as string);

    fetch(`/api/auth/oauth-link?t=${encodeURIComponent(t)}`)
      .then((res) => res.json())
      .then((data) => {
        if (data.valid) {
          if (data.provider) setProvider(data.provider);
          if (data.name) setNickname(data.name);
          if (data.avatar) setAvatar(data.avatar);
          setPendingState('ready');
        } else {
          setPendingState('invalid');
          setPendingError(data.error || '登录凭据已失效，请重新扫码');
        }
      })
      .catch(() => {
        setPendingState('invalid');
        setPendingError('网络异常，请稍后重试');
      });
  }, []);

  // 发送短信验证码（绑定/注册通用场景）
  const handleSendCode = async () => {
    if (!validatePhone(phone)) {
      toast({
        title: '请输入正确的手机号',
        variant: 'destructive',
        duration: 2000,
      });
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/send-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone, purpose: 'general' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: '验证码已发送',
          description: '请查收手机短信',
          duration: 3000,
        });
        setCountdown(60);
        if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
        countdownTimerRef.current = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
              countdownTimerRef.current = null;
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        toast({
          title: '验证码发送失败',
          description: data.error || '请稍后重试',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (_e) {
      toast({
        title: '验证码发送失败',
        description: '网络异常，请稍后重试',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  // 提交绑定/注册
  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!validatePhone(phone)) {
      toast({ title: '请输入正确的手机号', variant: 'destructive', duration: 2000 });
      return;
    }
    // #20260828-2156：登录密码强制必填（即便是「微信绑定」场景也要求新账号带密码）
    const pwdInput = password.trim();
    if (!pwdInput) {
      toast({
        title: '请设置登录密码',
        description: '首次绑定微信需设置密码，后续可用手机号+密码直接登录',
        variant: 'destructive',
        duration: 3000,
      });
      passwordRef.current?.focus();
      return;
    }
    if (pwdInput.length < passwordMinLength) {
      toast({
        title: `密码长度不能少于 ${passwordMinLength} 位`,
        variant: 'destructive',
        duration: 3000,
      });
      passwordRef.current?.focus();
      return;
    }
    if (!code) {
      toast({
        title: '请输入短信验证码',
        description: `设置密码后再输入${passwordMinLength}位以上短信验证码完成绑定`,
        variant: 'destructive',
        duration: 2000,
      });
      codeRef.current?.focus();
      return;
    }
    setLoading(true);
    try {
      const res = await fetch('/api/auth/oauth-link', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ token, phone, sms_code: code, password: pwdInput }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        toast({
          title: data.isNewUser ? '注册成功，已登录' : '绑定成功，已登录',
          description: data.isNewUser ? '欢迎加入' : '微信已绑定到您的账号',
          duration: 2000,
        });
        // 注册即登录（#[20260829-1700]）：
        // 写入本地会话数据 + 整页跳转。整页跳转确保 UserContext 重新加载，
        // 立即用服务端签发的 cookie/localStorage 恢复已登录状态——
        // 此前 router.push 为客户端导航不重跑 loadUser，导致首页仍显示"登录"按钮；
        // 也不再强制跳转 complete-profile，避免「绑定/注册 → 完善信息」双重跳转。
        try {
          localStorage.removeItem('logged_out_flag');
          if (data.user) localStorage.setItem('user', JSON.stringify(data.user));
          if (data.sessionToken) localStorage.setItem('session_token', data.sessionToken);
        } catch {
          /* localStorage 不可用时依赖 httpOnly cookie */
        }
        let redirect = '/';
        try {
          const params = new URLSearchParams(window.location.search);
          const r = params.get('redirect');
          if (r && r.startsWith('/') && !r.startsWith('//')) redirect = r;
        } catch {
          /* 忽略 */
        }
        window.location.href = redirect;
      } else {
        toast({
          title: '操作失败',
          description: data.error || '请稍后重试',
          variant: 'destructive',
          duration: 3000,
        });
        // #20260828-2156：后端 PASSWORD_REQUIRED_FOR_REGISTER 错误码聚焦密码框
        if (data && data.code === 'PASSWORD_REQUIRED_FOR_REGISTER') {
          passwordRef.current?.focus();
        }
      }
    } catch (_e) {
      toast({
        title: '操作失败',
        description: '网络异常，请稍后重试',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  const providerLabel = provider === 'wechat' ? '微信' : provider === 'qq' ? 'QQ' : provider;

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            {avatar ? (
              // 头像来自微信/QQ 授权返回的 https 图片地址（或服务端上传），非用户可控 HTML
              <img
                src={avatar}
                alt="头像"
                className="w-14 h-14 rounded-full object-cover"
                referrerPolicy="no-referrer"
              />
            ) : (
              <div className="w-14 h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center text-white text-2xl font-bold">
                {providerLabel.slice(0, 1)}
              </div>
            )}
          </div>
          <CardTitle className="text-2xl">绑定或注册账号</CardTitle>
          <CardDescription>
            {nickname ? `「${nickname}」` : `该${providerLabel}`}尚未绑定账号，
            输入手机号完成验证即可登录
          </CardDescription>
        </CardHeader>

        <CardContent>
          {pendingState === 'loading' && (
            <div className="flex flex-col items-center py-8 gap-3 text-gray-500">
              <Loader2 className="h-6 w-6 animate-spin" />
              <p className="text-sm">正在校验登录凭据…</p>
            </div>
          )}

          {pendingState === 'invalid' && (
            <div className="flex flex-col items-center py-8 gap-4">
              <div className="w-12 h-12 rounded-full bg-red-100 dark:bg-red-900/40 flex items-center justify-center text-red-500">
                <ShieldCheck className="h-6 w-6" />
              </div>
              <p className="text-sm text-center text-gray-600 dark:text-gray-400">{pendingError}</p>
              <Button variant="outline" onClick={() => router.push('/login?mode=qrcode')}>
                返回重新扫码登录
              </Button>
            </div>
          )}

          {pendingState === 'ready' && (
            <form onSubmit={handleSubmit} className="space-y-4">
              <div className="rounded-lg bg-blue-50 dark:bg-blue-950/40 border border-blue-200 dark:border-blue-900 p-3 text-xs text-blue-700 dark:text-blue-300 leading-relaxed">
                手机号已注册：{providerLabel}将绑定到该账号并登录；
                <br />
                手机号未注册：将自动注册新账号（发放注册积分）并绑定{providerLabel}。
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">手机号</label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={(e) => {
                    const value = e.target.value;
                    setPhone(value);
                    setPhoneError(value && !validatePhone(value) ? '手机号格式不正确' : '');
                  }}
                  placeholder="请输入手机号"
                  autoComplete="off"
                  maxLength={11}
                  className={phoneError ? 'border-red-500' : ''}
                />
                {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
              </div>

              {/* #20260828-2156：登录密码字段下移至「手机号」与「短信验证码」之间，标签改为必填。
                  这样用户在第一步就先输入密码，再请求短信验证码，可以避免「设了验证码，
                  但忘了设密码→ 后续只能用扫码/验证码登录」的死循环。 */}
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  登录密码 <span className="text-red-500">*</span>
                  <span className="text-gray-400 font-normal ml-1">
                    （必填，至少 {passwordMinLength} 位，后续可用手机号+密码登录）
                  </span>
                </label>
                <Input
                  ref={passwordRef}
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={`请设置登录密码（必填，至少 ${passwordMinLength} 位）`}
                  autoComplete="new-password"
                  minLength={passwordMinLength}
                />
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">短信验证码</label>
                <div className="flex gap-2">
                  <Input
                    ref={codeRef}
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="6位验证码"
                    autoComplete="off"
                    maxLength={6}
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendCode}
                    disabled={countdown > 0 || loading || !validatePhone(phone)}
                    className="w-24 whitespace-nowrap"
                  >
                    {countdown > 0 ? `${countdown}s` : '获取验证码'}
                  </Button>
                </div>
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={
                  loading ||
                  !validatePhone(phone) ||
                  password.trim().length < passwordMinLength ||
                  !code
                }
              >
                {loading ? (
                  <>
                    <Loader2 className="h-4 w-4 mr-2 animate-spin" />
                    处理中…
                  </>
                ) : (
                  '确认并登录'
                )}
              </Button>

              <div className="text-center">
                <Link
                  href="/login"
                  className="text-sm text-blue-600 hover:text-blue-700 hover:underline"
                >
                  返回登录页
                </Link>
              </div>
            </form>
          )}
        </CardContent>
      </Card>
    </div>
  );
}
