'use client';

import React, { useState, useEffect } from 'react';
import { useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@/contexts/UserContext';
import { Mail, Phone, QrCode, Github, Chrome, Building2 } from 'lucide-react';

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

// 判断是邮箱还是手机号
const identifyInput = (input: string): 'email' | 'phone' | 'unknown' => {
  if (validateEmail(input)) return 'email';
  if (validatePhone(input)) return 'phone';
  return 'unknown';
};

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
    loading: userLoading
  } = useUser();
  
  // 如果已经登录，直接跳转
  useEffect(() => {
    if (user) {
      router.push('/');
    }
  }, [user, router]);

  // 状态
  const [loginMode, setLoginMode] = useState<'phone' | 'password' | 'qrcode'>('phone');
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  
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
    setPhoneError(value && !validatePhone(value) ? '请输入正确的11位手机号' : '');
  };

  // 处理通用账号输入
  const handleAccountChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setAccount(value);
    if (value) {
      const type = identifyInput(value);
      if (type === 'unknown') {
        setAccountError('请输入正确的邮箱或手机号');
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
      toast({ title: "请输入手机号", variant: "destructive", duration: 2000 });
      return;
    }
    
    if (!validatePhone(phone)) {
      toast({ title: "手机号格式不正确", variant: "destructive", duration: 3000 });
      return;
    }
    
    setLoading(true);
    
    try {
      const result = await sendPhoneCode(phone);
      
      if (result.success) {
        toast({
          title: "验证码已发送",
          description: "请查收短信验证码",
          duration: 3000,
        });
        setCountdown(60);
        const timer = setInterval(() => {
          setCountdown((prev) => {
            if (prev <= 1) {
              clearInterval(timer);
              return 0;
            }
            return prev - 1;
          });
        }, 1000);
      } else {
        toast({ 
          title: "发送失败", 
          description: result.error || "请稍后重试", 
          variant: "destructive", 
          duration: 3000 
        });
      }
    } catch (error) {
      toast({ 
        title: "发送失败", 
        description: "网络错误，请检查网络连接", 
        variant: "destructive", 
        duration: 3000 
      });
    } finally {
      setLoading(false);
    }
  };

  // 处理手机登录
  const handlePhoneSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!validatePhone(phone)) {
      toast({ title: "手机号格式不正确", variant: "destructive", duration: 3000 });
      return;
    }
    
    if (!code) {
      toast({ title: "请输入验证码", variant: "destructive", duration: 2000 });
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await phoneLogin(phone, code);
      
      if (response.success) {
        toast({ title: "登录成功", description: "欢迎回来", duration: 2000 });
        router.push('/');
      } else {
        toast({ 
          title: "登录失败", 
          description: response.error || "验证码错误或已过期", 
          variant: "destructive", 
          duration: 3000 
        });
      }
    } catch (error) {
      toast({ 
        title: "登录失败", 
        description: "请稍后重试", 
        variant: "destructive", 
        duration: 3000 
      });
    } finally {
      setLoading(false);
    }
  };

  // 处理账号密码登录
  const handleAccountSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    const inputType = identifyInput(account);
    if (inputType === 'unknown') {
      toast({ title: "请输入正确的邮箱或手机号", variant: "destructive", duration: 3000 });
      return;
    }
    
    if (!password) {
      toast({ title: "请输入密码", variant: "destructive", duration: 2000 });
      return;
    }
    
    setLoading(true);
    
    try {
      const response = await passwordLogin(account, password);
      
      if (response.success) {
        toast({ title: "登录成功", description: "欢迎回来", duration: 2000 });
        router.push('/');
      } else {
        toast({ 
          title: "登录失败", 
          description: response.error || "账号或密码错误", 
          variant: "destructive", 
          duration: 3000 
        });
      }
    } catch (error) {
      toast({ 
        title: "登录失败", 
        description: "请稍后重试", 
        variant: "destructive", 
        duration: 3000 
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

  // 扫码登录界面
  if (loginMode === 'qrcode') {
    return (
      <div className="min-h-screen flex items-center justify-center bg-gray-50 dark:bg-gray-950 p-4">
        <Card className="w-[450px]">
          <CardHeader className="text-center">
            <div className="flex justify-center mb-4">
              <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
                <span className="text-white font-bold text-2xl">报</span>
              </div>
            </div>
            <CardTitle className="text-2xl">欢迎回来</CardTitle>
            <CardDescription>
              请使用微信或手机应用扫码登录
            </CardDescription>
          </CardHeader>
          
          <CardContent>
            <div className="space-y-6 py-4">
              <div className="flex justify-center">
                <div className="w-48 h-48 bg-gray-200 dark:bg-gray-700 rounded-lg flex items-center justify-center">
                  <QrCode className="h-24 w-24 text-gray-400" />
                </div>
              </div>
              
              <div className="flex justify-center gap-4">
                <Button 
                  variant="outline" 
                  className="px-8"
                  onClick={() => thirdPartyLogin('wechat')}
                >
                  微信扫码
                </Button>
                <Button 
                  variant="ghost" 
                  className="px-8"
                  onClick={handleBack}
                >
                  返回
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
      <Card className="w-[450px]">
        <CardHeader className="text-center">
          <div className="flex justify-center mb-4">
            <div className="w-12 h-12 bg-gradient-to-br from-blue-600 to-blue-700 rounded-lg flex items-center justify-center">
              <span className="text-white font-bold text-2xl">报</span>
            </div>
          </div>
          <CardTitle className="text-2xl">欢迎回来</CardTitle>
          <CardDescription>
            {loginMode === 'phone' 
              ? '使用手机号+验证码登录' 
              : '使用邮箱或手机号+密码登录'}
          </CardDescription>
        </CardHeader>
        
        <CardContent>
          {/* 登录方式选择 */}
          <div className="flex border-b border-gray-200 dark:border-gray-800 mb-6">
            <button
              onClick={() => setLoginMode('phone')}
              className={`flex-1 pb-3 text-center font-medium transition-colors relative ${
                loginMode === 'phone'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              手机验证码
            </button>
            <button
              onClick={() => setLoginMode('password')}
              className={`flex-1 pb-3 text-center font-medium transition-colors relative ${
                loginMode === 'password'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              密码登录
            </button>
            <button
              onClick={() => setLoginMode('qrcode')}
              className={`flex-1 pb-3 text-center font-medium transition-colors relative ${
                loginMode === 'qrcode'
                  ? 'text-blue-600 border-b-2 border-blue-600'
                  : 'text-gray-500 hover:text-gray-700 dark:text-gray-400'
              }`}
            >
              扫码登录
            </button>
          </div>

          {/* 手机验证码登录表单 */}
          {loginMode === 'phone' && (
            <form onSubmit={handlePhoneSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="text-sm font-medium">手机号</label>
                <Input
                  type="tel"
                  value={phone}
                  onChange={handlePhoneChange}
                  placeholder="请输入11位手机号"
                  autoComplete="off"
                  className={phoneError ? 'border-red-500' : ''}
                />
                {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
              </div>

              <div className="space-y-2">
                <label className="text-sm font-medium">验证码</label>
                <div className="flex gap-2">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value)}
                    placeholder="6位验证码"
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
                    {countdown > 0 ? `${countdown}s` : '获取验证码'}
                  </Button>
                </div>
              </div>

              <p className="text-xs text-gray-500">
                未注册的手机号验证后将自动创建账号
              </p>

              <Button type="submit" className="w-full" disabled={loading || !validatePhone(phone) || !code}>
                {loading ? '登录中...' : '手机号一键登录'}
              </Button>
            </form>
          )}

          {/* 密码登录表单 - 使用key防止自动填充 */}
          {loginMode === 'password' && (
            <form onSubmit={handleAccountSubmit} className="space-y-4" key={formKey}>
              <div className="space-y-2">
                <label className="text-sm font-medium">账号</label>
                <Input
                  type="text"
                  value={account}
                  onChange={handleAccountChange}
                  placeholder="请输入邮箱或手机号"
                  autoComplete="off"
                  className={accountError ? 'border-red-500' : ''}
                />
                {accountError && <p className="text-xs text-red-500">{accountError}</p>}
                <p className="text-xs text-gray-500">
                  支持邮箱或手机号登录
                </p>
              </div>
              
              <div className="space-y-2">
                <label className="text-sm font-medium">密码</label>
                <Input
                  type="password"
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="请输入密码"
                  autoComplete="off"
                />
              </div>

              <Button type="submit" className="w-full" disabled={loading || !account || accountError !== '' || !password}>
                {loading ? '登录中...' : '登录'}
              </Button>
            </form>
          )}

          {/* 第三方登录 */}
          <div className="mt-6">
            <div className="relative">
              <div className="absolute inset-0 flex items-center">
                <div className="w-full border-t border-gray-300 dark:border-gray-700"></div>
              </div>
              <div className="relative flex justify-center text-sm">
                <span className="px-2 bg-white dark:bg-gray-950 text-gray-500">
                  其他登录方式
                </span>
              </div>
            </div>

            <div className="mt-4 flex justify-center gap-4">
              <Button 
                variant="outline" 
                size="icon" 
                className="h-10 w-10 rounded-full"
                onClick={() => thirdPartyLogin('wechat')}
              >
                <span className="text-green-600 font-medium">微</span>
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-10 w-10 rounded-full"
                onClick={() => thirdPartyLogin('qq')}
              >
                <span className="text-blue-600 font-medium">Q</span>
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-10 w-10 rounded-full"
                onClick={() => thirdPartyLogin('github')}
              >
                <Github className="h-4 w-4" />
              </Button>
              <Button 
                variant="outline" 
                size="icon" 
                className="h-10 w-10 rounded-full"
                onClick={() => thirdPartyLogin('google')}
              >
                <Chrome className="h-4 w-4" />
              </Button>
            </div>
          </div>

          {/* 企业入口 */}
          <div className="mt-4 text-center">
            <Button
              variant="link"
              className="text-sm text-gray-500 hover:text-blue-600"
              onClick={() => router.push('/enterprise')}
            >
              <Building2 className="h-4 w-4 mr-1 inline" />
              企业服务入口
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

export default LoginPage;
