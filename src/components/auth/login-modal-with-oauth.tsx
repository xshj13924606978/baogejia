'use client';

import { useState, useEffect } from 'react';
import { useRouter, useSearchParams } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Separator } from '@/components/ui/separator';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { OAuthProvider } from '@/types/oauth';

interface LoginModalProps {
  isOpen: boolean;
  onClose: () => void;
  onLoginSuccess?: (user: any) => void;
}

export default function LoginModalWithOAuth({ isOpen, onClose, onLoginSuccess }: LoginModalProps) {
  const router = useRouter();
  const searchParams = useSearchParams();

  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [loginForm, setLoginForm] = useState({
    username: '',
    password: '',
  });
  const [registerForm, setRegisterForm] = useState({
    username: '',
    password: '',
    email: '',
    phone: '',
    company: '',
    contact: '',
    role: 'user',
  });
  const [bindForm, setBindForm] = useState({
    username: '',
    password: '',
  });
  const [showBind, setShowBind] = useState(false);
  const [oauthInfo, setOauthInfo] = useState<any>(null);

  // 添加随机key防止自动填充
  const [formKey, setFormKey] = useState(Math.random().toString(36));

  // 当登录模态框打开时重置key
  useEffect(() => {
    if (isOpen) {
      setFormKey(Math.random().toString(36));
      setLoginForm({ username: '', password: '' });
    }
  }, [isOpen]);

  // 检查URL参数，判断是否需要显示绑定页面
  useEffect(() => {
    const action = searchParams.get('action');
    const provider = searchParams.get('provider');
    const openid = searchParams.get('openid');
    const nickname = searchParams.get('nickname');
    const avatar = searchParams.get('avatar');
    const success = searchParams.get('success');

    if (success === 'true' && provider) {
      // 登录成功
      handleOAuthLoginSuccess(provider as OAuthProvider);
    } else if (action === 'bind' && provider && openid) {
      // 需要绑定账号
      setOauthInfo({ provider, openid, nickname, avatar });
      setShowBind(true);
    }
  }, [searchParams]);

  const handleOAuthLoginSuccess = (provider: OAuthProvider) => {
    // 模拟第三方登录成功
    const mockUser = {
      id: 2,
      username: `${provider}_user`,
      nickname: provider === OAuthProvider.WECHAT ? '微信用户' : 'QQ用户',
      avatar: 'https://api.dicebear.com/7.x/avataaars/svg?seed=oauth',
      role: 'user',
      points: 100,
    };

    localStorage.setItem('user', JSON.stringify(mockUser));
    setSuccess('登录成功！');
    setTimeout(() => {
      onLoginSuccess?.(mockUser);
      onClose();
      router.push('/');
    }, 1000);
  };

  const handleLogin = async () => {
    if (!loginForm.username || !loginForm.password) {
      setError('请输入用户名和密码');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const res = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(loginForm),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('user', JSON.stringify(data.user));
        setSuccess('登录成功！');
        setTimeout(() => {
          onLoginSuccess?.(data.user);
          onClose();
        }, 1000);
      } else {
        setError(data.error || '登录失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleRegister = async () => {
    if (!registerForm.username || !registerForm.password) {
      setError('请输入用户名和密码');
      return;
    }

    if (registerForm.password.length < 6) {
      setError('密码至少6位');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const res = await fetch('/api/auth/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(registerForm),
      });

      const data = await res.json();

      if (data.success) {
        setSuccess('注册成功！请等待管理员审核');
        setTimeout(() => {
          setLoginForm({
            username: registerForm.username,
            password: registerForm.password,
          });
        }, 2000);
      } else {
        setError(data.error || '注册失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleBind = async () => {
    if (!bindForm.username || !bindForm.password) {
      setError('请输入用户名和密码');
      return;
    }

    try {
      setLoading(true);
      setError('');

      const res = await fetch('/api/auth/bind', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ...oauthInfo,
          ...bindForm,
        }),
      });

      const data = await res.json();

      if (data.success) {
        localStorage.setItem('user', JSON.stringify(data.user));
        setSuccess('绑定成功！');
        setTimeout(() => {
          onLoginSuccess?.(data.user);
          onClose();
          router.push('/');
        }, 1000);
      } else {
        setError(data.error || '绑定失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    } finally {
      setLoading(false);
    }
  };

  const handleWechatLogin = async () => {
    try {
      const res = await fetch('/api/auth/wechat');
      const data = await res.json();

      if (data.success && data.qr_code_url) {
        // 打开新窗口进行微信扫码登录
        window.open(data.qr_code_url, 'wechat_login', 'width=400,height=500');
      } else {
        setError('获取微信登录二维码失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    }
  };

  const handleQQLogin = async () => {
    try {
      const res = await fetch('/api/auth/qq');
      const data = await res.json();

      if (data.success && data.auth_url) {
        // 打开新窗口进行QQ登录
        window.open(data.auth_url, 'qq_login', 'width=600,height=500');
      } else {
        setError('获取QQ登录链接失败');
      }
    } catch (err) {
      setError('网络错误，请重试');
    }
  };

  // 如果需要绑定账号，显示绑定页面
  if (showBind && oauthInfo) {
    return (
      <Dialog open={isOpen} onOpenChange={onClose}>
        <DialogContent className="sm:max-w-md">
          <DialogHeader>
            <DialogTitle>绑定账号</DialogTitle>
            <DialogDescription>
              {oauthInfo.provider === OAuthProvider.WECHAT ? '微信' : 'QQ'}登录需要绑定已有账号
            </DialogDescription>
          </DialogHeader>

          <div className="space-y-4 pt-4">
            {oauthInfo.avatar && (
              <div className="flex items-center gap-4 p-4 bg-gray-50 rounded-lg">
                <img
                  src={oauthInfo.avatar}
                  alt={oauthInfo.nickname}
                  className="w-12 h-12 rounded-full"
                />
                <div>
                  <div className="font-medium">{oauthInfo.nickname}</div>
                  <div className="text-sm text-gray-500">
                    {oauthInfo.provider === OAuthProvider.WECHAT ? '微信' : 'QQ'}用户
                  </div>
                </div>
              </div>
            )}

            <div className="space-y-2">
              <Label htmlFor="bind-username">用户名</Label>
              <Input
                id="bind-username"
                placeholder="请输入用户名"
                value={bindForm.username}
                onChange={(e) => setBindForm({ ...bindForm, username: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && handleBind()}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="bind-password">密码</Label>
              <Input
                id="bind-password"
                type="password"
                placeholder="请输入密码"
                value={bindForm.password}
                onChange={(e) => setBindForm({ ...bindForm, password: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && handleBind()}
                autoComplete="off"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="bg-green-50 border-green-200">
                <AlertDescription className="text-green-700">{success}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleBind} disabled={loading} className="w-full">
              {loading ? '绑定中...' : '确认绑定'}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md" key={formKey}>
        <DialogHeader>
          <DialogTitle>欢迎来到报个价</DialogTitle>
          <DialogDescription>登录后享受智能报价服务</DialogDescription>
        </DialogHeader>

        <Tabs defaultValue="login" className="w-full">
          <TabsList className="grid w-full grid-cols-2">
            <TabsTrigger value="login">登录</TabsTrigger>
            <TabsTrigger value="register">注册</TabsTrigger>
          </TabsList>

          {/* 登录表单 */}
          <TabsContent value="login" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="login-username">用户名</Label>
              <Input
                id="login-username"
                placeholder="请输入用户名"
                value={loginForm.username}
                onChange={(e) => setLoginForm({ ...loginForm, username: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="login-password">密码</Label>
              <Input
                id="login-password"
                type="password"
                placeholder="请输入密码"
                value={loginForm.password}
                onChange={(e) => setLoginForm({ ...loginForm, password: e.target.value })}
                onKeyPress={(e) => e.key === 'Enter' && handleLogin()}
                autoComplete="off"
              />
            </div>

            {error && (
              <Alert variant="destructive">
                <AlertDescription>{error}</AlertDescription>
              </Alert>
            )}

            {success && (
              <Alert className="bg-green-50 border-green-200">
                <AlertDescription className="text-green-700">{success}</AlertDescription>
              </Alert>
            )}

            <Button onClick={handleLogin} disabled={loading} className="w-full">
              {loading ? '登录中...' : '登录'}
            </Button>

            {/* 第三方登录 */}
            <div className="space-y-3">
              <div className="relative">
                <div className="absolute inset-0 flex items-center">
                  <Separator className="w-full" />
                </div>
                <div className="relative flex justify-center text-xs uppercase">
                  <span className="bg-background px-2 text-muted-foreground">第三方登录</span>
                </div>
              </div>

              <div className="flex gap-3">
                <Button
                  type="button"
                  variant="outline"
                  className="flex-1"
                  onClick={handleWechatLogin}
                >
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="#07C160">
                    <path d="M8.5,13.5c-0.83,0-1.5-0.67-1.5-1.5s0.67-1.5,1.5-1.5s1.5,0.67,1.5,1.5S9.33,13.5,8.5,13.5z M15.5,13.5c-0.83,0-1.5-0.67-1.5-1.5s0.67-1.5,1.5-1.5s1.5,0.67,1.5,1.5S16.33,13.5,15.5,13.5z" />
                    <path d="M12,2C6.48,2,2,6.48,2,12c0,5.52,4.48,10,10,10s10-4.48,10-10C22,6.48,17.52,2,12,2z M12,20c-4.41,0-8-3.59-8-8s3.59-8,8-8s8,3.59,8,8S16.41,20,12,20z" />
                  </svg>
                  微信登录
                </Button>
                <Button type="button" variant="outline" className="flex-1" onClick={handleQQLogin}>
                  <svg className="w-5 h-5 mr-2" viewBox="0 0 24 24" fill="#12B7F5">
                    <path d="M12,2C6.48,2,2,6.48,2,12c0,5.52,4.48,10,10,10s10-4.48,10-10C22,6.48,17.52,2,12,2z M12,20c-4.41,0-8-3.59-8-8s3.59-8,8-8s8,3.59,8,8S16.41,20,12,20z" />
                  </svg>
                  QQ登录
                </Button>
              </div>
            </div>

            {/* 测试账号提示 */}
            <Alert className="bg-blue-50 border-blue-200">
              <AlertDescription className="text-blue-700">
                <div className="font-medium mb-1">💡 测试账号</div>
                <div className="text-xs space-y-1">
                  <div>• admin / 123456 (超级管理员)</div>
                  <div>• vip / 123456 (高级会员)</div>
                  <div>• factory / 123456 (产品厂家)</div>
                  <div>• user / 123456 (普通用户)</div>
                </div>
              </AlertDescription>
            </Alert>
          </TabsContent>

          {/* 注册表单 */}
          <TabsContent value="register" className="space-y-4 pt-4">
            <div className="space-y-2">
              <Label htmlFor="register-username">用户名 *</Label>
              <Input
                id="register-username"
                placeholder="请输入用户名"
                value={registerForm.username}
                onChange={(e) => setRegisterForm({ ...registerForm, username: e.target.value })}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-password">密码 *</Label>
              <Input
                id="register-password"
                type="password"
                placeholder="至少6位密码"
                value={registerForm.password}
                onChange={(e) => setRegisterForm({ ...registerForm, password: e.target.value })}
                autoComplete="off"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="register-email">邮箱</Label>
              <Input
                id="register-email"
                type="email"
                placeholder="请输入邮箱"
                value={registerForm.email}
                onChange={(e) => setRegisterForm({ ...registerForm, email: e.target.value })}
                autoComplete="off"
              />
            </div>

            <Button onClick={handleRegister} disabled={loading} className="w-full">
              {loading ? '注册中...' : '注册'}
            </Button>
          </TabsContent>
        </Tabs>
      </DialogContent>
    </Dialog>
  );
}
