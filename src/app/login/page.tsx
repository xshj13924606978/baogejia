'use client';

import React, { useState, useEffect, useRef } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@/contexts/UserContext';
import { Phone, Building2, Loader2 } from 'lucide-react';
import { LOGIN_TEXT } from '@/lib/constants/auth';

// 验证手机号格式
const validatePhone = (phone: string): boolean => {
  const phoneRegex = /^1[3-9]\d{9}$/;
  return phoneRegex.test(phone);
};

// 验证邮箱格式
const validateEmail = (email: string): boolean => {
  const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
  return emailRegex.test(email);
};

// 判断是邮箱、手机号还是用户名
// 用户名规则与注册一致（/api/auth/register）：2-30 位字母/数字/下划线/中文，
// 另兼容历史含中划线的用户名（#20260821-1500 修复中文用户名无法登录）
const identifyInput = (input: string): 'email' | 'phone' | 'username' | 'unknown' => {
  if (validateEmail(input)) return 'email';
  if (validatePhone(input)) return 'phone';
  // 用户名：至少2个字符，允许字母、数字、下划线、中划线、中文
  if (/^[\w\u4e00-\u9fa5-]{2,}$/.test(input)) return 'username';
  return 'unknown';
};

// Tab 高亮样式（非文案，组件内维护）
// #[20260901-1300] P3-7：窄屏（≤320px）三段均分时「手机验证码」会折行，
// 故小屏降级为 text-sm 并禁止折行，sm 及以上保持原 text-base 视觉。
const TAB_BASE =
  'flex-1 pb-3 text-center font-medium transition-colors relative whitespace-nowrap text-sm sm:text-base';
const TAB_ACTIVE =
  'text-blue-600 border-b-2 border-blue-600 bg-blue-50/60 dark:bg-blue-950/40 font-semibold';
const TAB_INACTIVE =
  'text-gray-500 hover:text-gray-700 hover:bg-gray-50 dark:text-gray-400 dark:hover:bg-gray-800/40';

function LoginPage() {
  const router = useRouter();
  const { toast } = useToast();
  const {
    phoneLogin,
    emailLogin,
    passwordLogin,
    thirdPartyLogin,
    sendPhoneCode,
    user,
    loading: userLoading,
  } = useUser();

  // 解析登录后的跳转地址：仅允许站内相对路径（防止开放重定向）
  const getRedirect = (): string => {
    if (typeof window === 'undefined') return '/';
    const params = new URLSearchParams(window.location.search);
    const redirect = params.get('redirect');
    return redirect && redirect.startsWith('/') && !redirect.startsWith('//') ? redirect : '/';
  };

  // 如果已经登录，直接跳转（优先回跳到 middleware 带来的 redirect 目标）
  useEffect(() => {
    if (user) {
      router.push(getRedirect());
    }
  }, [user, router]);

  // 状态
  // 默认使用密码登录：手机验证码后端接口（send-sms-code/verify-sms-code）尚未实现，
  // 默认手机模式会让被弹回登录页的用户误以为无法登录
  const [loginMode, setLoginMode] = useState<'phone' | 'password' | 'qrcode'>('password');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 组件卸载时清除倒计时
  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) {
        clearInterval(countdownTimerRef.current);
      }
    };
  }, []);

  // #20260822-1630：扫码登录 Tab 进入即自动跳微信二维码页，去掉中间"微信扫描"按钮
  // 原因：iframe 内嵌二维码无法扫码（微信官方策略），原中间页需用户再点一次按钮体验差；
  // 直接整页跳转到微信官方 qrconnect 显示二维码
  useEffect(() => {
    if (loginMode === 'qrcode') {
      thirdPartyLogin('wechat');
    }
  }, [loginMode]);

  // 表单数据
  const [phone, setPhone] = useState('');
  const [code, setCode] = useState('');
  const [account, setAccount] = useState('');
  const [password, setPassword] = useState('');

  // 错误信息
  const [phoneError, setPhoneError] = useState('');
  const [accountError, setAccountError] = useState('');

  // 生成随机key来防止浏览器自动填充
  const [formKey, setFormKey] = useState(Math.random().toString(36));

  // 当切换到密码登录模式时，重置表单key
  useEffect(() => {
    if (loginMode === 'password') {
      setFormKey(Math.random().toString(36));
      setPassword('');
    }
  }, [loginMode]);

  // 处理手机号输入
  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setPhone(value);
    setPhoneError(value && !validatePhone(value) ? LOGIN_TEXT.phoneError : '');
  };

  // 处理通用账号输入
  const handleAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAccount(value);
    if (value) {
      const type = identifyInput(value);
      if (type === 'unknown') {
        setAccountError(LOGIN_TEXT.accountError);
      } else {
        setAccountError('');
      }
    } else {
      setAccountError('');
    }
  };

  // 发送手机验证码
  const handleSendCode = async () => {
    if (!phone) {
      toast({ title: LOGIN_TEXT.toast.phoneRequired, variant: 'destructive', duration: 2000 });
      return;
    }

    if (!validatePhone(phone)) {
      toast({ title: LOGIN_TEXT.toast.phoneInvalid, variant: 'destructive', duration: 3000 });
      return;
    }

    setLoading(true);

    try {
      const result = await sendPhoneCode(phone);

      if (result.success) {
        toast({
          title: LOGIN_TEXT.toast.codeSent,
          description: LOGIN_TEXT.toast.codeSentDesc,
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
          title: LOGIN_TEXT.toast.sendFailed,
          description: result.error || LOGIN_TEXT.toast.retryLater,
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (_error) {
      toast({
        title: LOGIN_TEXT.toast.sendFailed,
        description: LOGIN_TEXT.toast.networkError,
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  // 处理手机登录
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    if (!validatePhone(phone)) {
      toast({ title: LOGIN_TEXT.toast.phoneInvalid, variant: 'destructive', duration: 3000 });
      return;
    }

    if (!code) {
      toast({ title: LOGIN_TEXT.toast.codeRequired, variant: 'destructive', duration: 2000 });
      return;
    }

    setLoading(true);

    try {
      const response = await phoneLogin(phone, code);

      if (response.success) {
        toast({ title: LOGIN_TEXT.toast.loginSuccess, description: LOGIN_TEXT.toast.welcomeBack, duration: 2000 });
        // 注册即登录（#[20260829-1700]）：未注册手机号自动建号后同样直接进入系统，
        // 不再强制跳转完善信息页；缺失项可在「账号安全-完善资料」中随时补充。
        router.push(getRedirect());
      } else {
        toast({
          title: LOGIN_TEXT.toast.loginFailed,
          description: response.error || LOGIN_TEXT.toast.codeWrong,
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (_error) {
      toast({
        title: LOGIN_TEXT.toast.loginFailed,
        description: LOGIN_TEXT.toast.retryLater,
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  // 处理账号密码登录
  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    // #[20260822-2028] 支持姓名登录：移除前端拦截，姓名匹配走后端第三轮 full_name 查询
    // 重名时由后端返回 code: NAME_NOT_UNIQUE，前端 toast 提示改用其他方式
    const trimmedAccount = account.trim();
    const inputType = identifyInput(account);
    
    if (inputType === 'unknown') {
      toast({ title: LOGIN_TEXT.accountError, variant: 'destructive', duration: 3000 });
      return;
    }

    if (!password) {
      toast({ title: LOGIN_TEXT.toast.passwordRequired, variant: 'destructive', duration: 2000 });
      return;
    }

    setLoading(true);

    try {
      const response = await passwordLogin(account, password);

      if (response.success) {
        toast({ title: LOGIN_TEXT.toast.loginSuccess, description: LOGIN_TEXT.toast.welcomeBack, duration: 2000 });
        router.push(getRedirect());
      } else {
        toast({
          title: LOGIN_TEXT.toast.loginFailed,
          description: response.error || LOGIN_TEXT.toast.accountWrong,
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (error) {
      console.error('[Login] passwordLogin error:', error);
      toast({
        title: LOGIN_TEXT.toast.loginFailed,
        description: LOGIN_TEXT.toast.retryLater,
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  // 返回上一级登录方式
  const handleBack = () => {
    setLoginMode('phone');
    // 清空表单数据
    setPhone('');
    setCode('');
    setAccount('');
    setPassword('');
  };

  // 加载状态
  if (userLoading) {
    return (
      <div className="min-h-screen flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-600"></div>
      </div>
    );
  }

  // 扫码登录界面（#20260822-1630：进入即跳微信二维码页，下方保留"返回"兜底）
  if (loginMode === 'qrcode') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <Card className="w-full max-w-md">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-2xl">{LOGIN_TEXT.logoChar}</span>
              </div>
            </div>
            <CardTitle className="text-2xl">{LOGIN_TEXT.cardTitle}</CardTitle>
            <CardDescription>{LOGIN_TEXT.subtitleQrcode}</CardDescription>
          </CardHeader>

          <CardContent>
            <div className="space-y-6 py-4">
              <div className="flex justify-center">
                <Loader2 className="h-24 w-24 text-gray-400 animate-spin" />
              </div>

              <div className="flex justify-center">
                <Button variant="ghost" className="px-8" onClick={handleBack}>
                  {LOGIN_TEXT.back}
                </Button>
              </div>
            </div>
          </CardContent>
        </Card>
      </div>
    );
  }

  return (
    <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
      <Card className="w-full max-w-md">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-brand-primary to-brand-secondary rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-2xl">{LOGIN_TEXT.logoChar}</span>
            </div>
          </div>
          <CardTitle className="text-2xl">{LOGIN_TEXT.cardTitle}</CardTitle>
          <CardDescription>
            {loginMode === 'phone' ? LOGIN_TEXT.subtitlePhone : LOGIN_TEXT.subtitlePassword}
          </CardDescription>
        </CardHeader>

        <CardContent>
          {/* 登录方式选择 */}
          <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6">
            <button
              onClick={() => setLoginMode('phone')}
              className={`${TAB_BASE} ${
                loginMode === 'phone' ? TAB_ACTIVE : TAB_INACTIVE
              }`}
            >
              {LOGIN_TEXT.tabPhone}
            </button>
            <button
              onClick={() => setLoginMode('password')}
              className={`${TAB_BASE} ${
                loginMode === 'password' ? TAB_ACTIVE : TAB_INACTIVE
              }`}
            >
              {LOGIN_TEXT.tabPassword}
            </button>
            <button
              onClick={() => setLoginMode('qrcode' as 'phone' | 'password' | 'qrcode')}
              className={`${TAB_BASE} ${
                (loginMode as any) === 'qrcode' ? TAB_ACTIVE : TAB_INACTIVE
              }`}
            >
              {LOGIN_TEXT.tabQrcode}
            </button>
          </div>

          {/* 手机验证码登录表单 */}
          {loginMode === 'phone' && (
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">{LOGIN_TEXT.phoneLabel}</label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder={LOGIN_TEXT.phonePlaceholder}
                  autoComplete="off"
                  className={phoneError ? 'border-red-500' : ''}
                />
                {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{LOGIN_TEXT.codeLabel}</label>
                <div className="flex gap-2">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder={LOGIN_TEXT.codePlaceholder}
                    autoComplete="off"
                    className="flex-1"
                    maxLength={6}
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendCode}
                    disabled={countdown > 0 || loading || !validatePhone(phone)}
                    className="w-24 whitespace-nowrap"
                  >
                    {countdown > 0 ? `${countdown}s` : LOGIN_TEXT.sendCodeButton}
                  </Button>
                </div>
              </div>

              <p className="text-xs text-gray-500">{LOGIN_TEXT.phoneLoginHint}</p>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !validatePhone(phone) || !code}
              >
                {loading ? LOGIN_TEXT.submitting : LOGIN_TEXT.phoneSubmit}
              </Button>
            </form>
          )}

          {/* 密码登录表单 - 使用key防止自动填充 */}
          {loginMode === 'password' && (
            <form onSubmit={handleAccountSubmit} className="space-y-4" key={formKey} autoComplete="off">
              <div className="space-y-2">
                <label className="text-sm font-medium">{LOGIN_TEXT.accountLabel}</label>
                <Input
                  type="text"
                  value={account}
                  onChange={handleAccountChange}
                  placeholder={LOGIN_TEXT.accountPlaceholder}
                  autoComplete="off"
                  autoCorrect="off"
                  spellCheck={false}
                  data-lpignore="true"
                  data-form-type="other"
                  className={accountError ? 'border-red-500' : ''}
                />
                {accountError && <p className="text-xs text-red-500">{accountError}</p>}
                <p className="text-xs text-gray-500">{LOGIN_TEXT.accountHint}</p>
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">{LOGIN_TEXT.passwordLabel}</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder={LOGIN_TEXT.passwordPlaceholder}
                  autoComplete="new-password"
                  data-lpignore="true"
                  data-form-type="other"
                />
              </div>

              <Button
                type="submit"
                className="w-full"
                disabled={loading || !account || !password}
              >
                {loading ? LOGIN_TEXT.submitting : LOGIN_TEXT.passwordSubmit}
              </Button>

              <div className="flex justify-end">
                <Link
                  href="/forgot-password"
                  className="text-sm text-primary hover:underline"
                >
                  忘记密码？
                </Link>
              </div>
            </form>
          )}

          {/* 第三方登录 */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-950 text-gray-500">{LOGIN_TEXT.thirdPartyDivider}</span>
              </div>
            </div>

            <div className="mt-4 flex justify-center gap-4">
              <Button
                variant="outline"
                size="icon"
                className="h-10 w-10 rounded-full"
                onClick={() => thirdPartyLogin('wechat')}
              >
                <span className="text-green-600 font-medium">{LOGIN_TEXT.logoChar}</span>
              </Button>
            </div>
          </div>

          {/* 底部：注册入口（左）+ 企业服务入口（右下角小字） */}
          <div className="mt-6 flex items-center justify-between border-t border-gray-200 dark:border-gray-800 pt-4">
            <Link
              href="/register"
              className="text-sm font-medium text-blue-600 hover:text-blue-700 hover:underline"
            >
              {LOGIN_TEXT.registerLink}
            </Link>
            <button
              type="button"
              onClick={() => router.push('/enterprise')}
              className="inline-flex items-center gap-1 text-xs text-gray-400 hover:text-blue-600 transition-colors"
            >
              <Building2 className="h-3.5 w-3.5" />
              {LOGIN_TEXT.enterpriseEntry}
            </button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default LoginPage;
