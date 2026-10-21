'use client';

import React, { useCallback, useEffect, useRef, useState } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { useToast } from '@/components/ui/use-toast';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { useUser } from '@/contexts/UserContext';
import {
  Mail,
  Phone,
  Building,
  MapPin,
  Edit2,
  Loader2,
  MessageCircle,
  LogOut,
  Trash2,
  KeyRound,
} from 'lucide-react';
import { COMPLETE_PROFILE_TEXT, WECHAT_TEXT } from '@/lib/constants/auth';
import { loadMinPasswordLength } from '@/lib/password-policy';

export default function ProfilePanel() {
  const { user, uploadAvatar, updateUser, refreshUser, logoutAllDevices, deleteAccount } = useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  // 会话与账号操作（#[20260829-1700]）
  const [showLogoutAll, setShowLogoutAll] = useState(false);
  const [showDeleteAccount, setShowDeleteAccount] = useState(false);
  const [deletePassword, setDeletePassword] = useState('');
  const [logoutAllLoading, setLogoutAllLoading] = useState(false);
  const [deleteLoading, setDeleteLoading] = useState(false);

  const [formData, setFormData] = useState({
    name: '',
    company: '',
    address: '',
  });
  const [avatar, setAvatar] = useState('');
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);

  // 账号安全：用户名 / 密码 / 微信绑定（#20260820-1600）
  const [username, setUsername] = useState('');
  const [savingUsername, setSavingUsername] = useState(false);
  // 设置/修改密码（#20260827-PASSWORD）
  const [oldPassword, setOldPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [smsCode, setSmsCode] = useState('');
  const [savingPassword, setSavingPassword] = useState(false);
  const [sendingCode, setSendingCode] = useState(false);
  const [codeCountdown, setCodeCountdown] = useState(0);
  const [wechatBound, setWechatBound] = useState(false);
  const [wechatNickname, setWechatNickname] = useState('');
  const [wechatActionLoading, setWechatActionLoading] = useState(false);
  // #20260827-1600-1：绑定轮询兜底。真实微信 OAuth 链路上弹窗会经历
  // open.weixin.qq.com（跨域）→ 本域 callback → bind-result，跨域导航后 window.opener
  // 引用可能丢失（或主窗口在弹窗期间重载导致 opener.closed），bind-result 无法
  // postMessage → 按钮不更新。轮询定期从数据库（/api/auth/bind，权威）拉取绑定状态，
  // 绑定一旦落库立即更新按钮，不依赖 postMessage/opener（与管理员 ProfileDialog
  // "直接更新 UI、不依赖间接链路"的经验一致）。
  const bindPollingRef = useRef<ReturnType<typeof setInterval> | null>(null);
  const stopBindPolling = useCallback(() => {
    if (bindPollingRef.current) {
      clearInterval(bindPollingRef.current);
      bindPollingRef.current = null;
    }
  }, []);
  const startBindPolling = useCallback(
    (durationMs = 120000) => {
      stopBindPolling();
      // 2.5s 间隔，绑定落库后最多延迟约 2.5s 感知，达到"动态及时性"
      bindPollingRef.current = setInterval(async () => {
        try {
          const res = await fetch('/api/auth/bind');
          const data = await res.json();
          if (!data.success) return;
          const wechatBinding = (data.bindings || []).find((b: any) => b.provider === 'wechat');
          if (wechatBinding) {
            stopBindPolling();
            setWechatBound(true);
            setWechatNickname(wechatBinding?.nickname || '');
            refreshUser?.();
            toast({ title: '微信绑定成功', duration: 2000 });
          }
        } catch (_e) {
          // 网络抖动忽略，下轮重试
        }
      }, 2500);
      // 超时自动停止（避免长期空转），时长覆盖完整扫码流程
      setTimeout(stopBindPolling, durationMs);
    },
    [stopBindPolling, refreshUser, toast]
  );
  // 卸载时清理轮询
  useEffect(() => () => stopBindPolling(), [stopBindPolling]);

  // 短信验证码倒计时
  useEffect(() => {
    if (codeCountdown <= 0) return;
    const timer = setInterval(() => {
      setCodeCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [codeCountdown]);

  // user 变化时同步表单（保持与登录状态一致）
  useEffect(() => {
    if (user) {
      setFormData({
        name: user.name || '',
        company: user.company || '',
        address: user.address || '',
      });
      setAvatar(user.avatar || '');
      setUsername(user.username || '');
    }
  }, [user]);

  // 从数据库（/api/auth/bind）权威加载微信绑定状态
  // #20260827-1600：抽取为可复用函数，绑定回调后即时刷新（杜绝硬编码，全部来自数据库）
  const loadWechatBindState = useCallback(async () => {
    try {
      const res = await fetch('/api/auth/bind');
      const data = await res.json();
      if (!data.success) return;
      const wechatBinding = (data.bindings || []).find((b: any) => b.provider === 'wechat');
      setWechatBound(!!wechatBinding);
      setWechatNickname(wechatBinding?.nickname || '');
    } catch (_e) {
      // 查询失败静默，仅显示未绑定
    }
  }, []);

  // 挂载时 + UserContext.user 变化时（绑定/解绑/登录态切换）刷新绑定状态
  useEffect(() => {
    loadWechatBindState();
  }, [user?.id, loadWechatBindState]);

  // #20260827-1600：监听绑定结果弹窗（window.open 弹出的扫码窗口）的回传消息，
  // 绑定成功后立即从数据库刷新绑定状态 + 刷新 UserContext（与管理员 ProfileDialog 行为一致）
  // #20260827-1600-1：postMessage 送达时即时停止轮询兜底（双链路互斥，避免重复刷新）
  useEffect(() => {
    const handleMessage = (event: MessageEvent) => {
      if (event.data?.type !== 'wechat_bound') return;
      if (event.data?.provider !== 'wechat') return;
      if (event.data?.success) {
        stopBindPolling();
        loadWechatBindState();
        // 同步 UserContext，让全站用户状态即时包含最新微信绑定信息
        refreshUser?.();
        toast({ title: '微信绑定成功', duration: 2000 });
      }
    };
    window.addEventListener('message', handleMessage);
    return () => window.removeEventListener('message', handleMessage);
  }, [loadWechatBindState, refreshUser, toast, stopBindPolling]);

  const saveUsername = async () => {
    const name = username.trim();
    if (!name) return;
    setSavingUsername(true);
    try {
      const res = await fetch('/api/auth/profile', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ username: name }),
      });
      const data = await res.json();
      if (data.success) {
        toast({ title: '保存成功', description: '用户名已更新', duration: 2000 });
      } else {
        toast({ title: '保存失败', description: data.error || '请重试', variant: 'destructive', duration: 3000 });
      }
    } catch {
      toast({ title: '保存失败', description: '请稍后重试', variant: 'destructive', duration: 3000 });
    } finally {
      setSavingUsername(false);
    }
  };

  const isPhone = (s: string) => /^1[3-9]\d{9}$/.test(s);

  const sendPasswordCode = async () => {
    const target = user?.phone || user?.username || '';
    if (!isPhone(target)) {
      toast({ title: '当前账号未绑定手机号，无法发送验证码', variant: 'destructive', duration: 3000 });
      return;
    }
    setSendingCode(true);
    try {
      const res = await fetch('/api/auth/send-sms-code', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ phone: target }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCodeCountdown(60);
        toast({ title: '验证码已发送', description: data.message || '请查收短信', duration: 2000 });
      } else {
        toast({ title: data.error || '发送失败', variant: 'destructive', duration: 3000 });
      }
    } catch {
      toast({ title: '发送失败', description: '请稍后重试', variant: 'destructive', duration: 3000 });
    } finally {
      setSendingCode(false);
    }
  };

  const handleSavePassword = async () => {
    const minLen = Math.max(8, await loadMinPasswordLength());
    if (newPassword.length < minLen) {
      toast({ title: `密码至少${minLen}位`, variant: 'destructive', duration: 3000 });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: '两次输入的密码不一致', variant: 'destructive', duration: 3000 });
      return;
    }

    setSavingPassword(true);
    try {
      if (user?.hasPassword) {
        // 修改密码：旧密码 + 新密码
        const res = await fetch('/api/auth/change-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ oldPassword, newPassword }),
        });
        const data = await res.json();
        if (data.success) {
          setOldPassword('');
          setNewPassword('');
          setConfirmPassword('');
          refreshUser?.();
          toast({ title: '修改成功', description: '密码已更新', duration: 2000 });
        } else {
          toast({ title: data.error || '修改失败', variant: 'destructive', duration: 3000 });
        }
      } else {
        // 设置密码：短信验证码 + 新密码
        if (!/^\d{6}$/.test(smsCode)) {
          toast({ title: '请输入6位短信验证码', variant: 'destructive', duration: 3000 });
          return;
        }
        const res = await fetch('/api/auth/set-password', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ code: smsCode, newPassword }),
        });
        const data = await res.json();
        if (data.success) {
          setSmsCode('');
          setNewPassword('');
          setConfirmPassword('');
          refreshUser?.();
          toast({ title: '设置成功', description: '密码已设置，可用密码登录', duration: 2000 });
        } else {
          toast({ title: data.error || '设置失败', variant: 'destructive', duration: 3000 });
        }
      }
    } catch {
      toast({ title: '请求失败', description: '请稍后重试', variant: 'destructive', duration: 3000 });
    } finally {
      setSavingPassword(false);
    }
  };

  const handleBindWechat = async () => {
    setWechatActionLoading(true);
    try {
      const res = await fetch('/api/auth/oauth-url?provider=wechat&mode=bind');
      const data = await res.json();
      if (data.success && data.url) {
        // #20260827-1600：改为弹窗扫码（与 ProfileDialog 一致），绑定结果通过
        // bind-result → window.opener.postMessage 回传，由上面的监听器即时刷新状态，
        // 避免整页跳转闪跳首页、绑定状态不即时生效的问题。
        // #20260827-1600-1：同时启动轮询兜底（opener 跨域导航后可能丢失），
        // 无论 postMessage 是否送达，绑定落库后按钮都会及时更新。
        const popup = window.open(data.url, '_blank', 'width=520,height=640');
        if (!popup) {
          toast({ title: '弹窗被浏览器拦截，请允许弹窗后重试', variant: 'destructive', duration: 3000 });
        } else {
          startBindPolling();
        }
        return;
      }
      toast({ title: data.error || WECHAT_TEXT.notConfigured, variant: 'destructive', duration: 3000 });
    } catch {
      toast({ title: WECHAT_TEXT.notConfigured, variant: 'destructive', duration: 3000 });
    } finally {
      setWechatActionLoading(false);
    }
  };

  const handleUnbindWechat = async () => {
    setWechatActionLoading(true);
    try {
      const res = await fetch('/api/auth/unlink', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ provider: 'wechat' }),
      });
      const data = await res.json();
      if (data.success) {
        setWechatBound(false);
        setWechatNickname('');
        // 同步 UserContext，让全站用户状态即时移除微信绑定信息（与绑定行为一致）
        refreshUser?.();
        toast({ title: '已解绑微信', duration: 2000 });
      } else {
        toast({ title: '解绑失败', description: data.error || '请重试', variant: 'destructive', duration: 3000 });
      }
    } catch {
      toast({ title: '解绑失败', description: '请稍后重试', variant: 'destructive', duration: 3000 });
    } finally {
      setWechatActionLoading(false);
    }
  };

  // 全部设备登出（#[20260829-1700]：服务端递增会话版本，真实生效）
  const handleLogoutAll = async () => {
    setLogoutAllLoading(true);
    try {
      const ok = await logoutAllDevices();
      if (ok) {
        toast({ title: '已退出全部设备', description: '所有设备需要重新登录', duration: 2500 });
        // logoutAllDevices 内部已执行登出清理并跳转登录页
      } else {
        toast({ title: '操作失败', description: '请稍后重试', variant: 'destructive', duration: 3000 });
        setShowLogoutAll(false);
      }
    } finally {
      setLogoutAllLoading(false);
    }
  };

  // 注销账号（#[20260829-1700]：服务端级联删除/标记删除，真实生效）
  const handleDeleteAccount = async () => {
    setDeleteLoading(true);
    try {
      const ok = await deleteAccount(deletePassword);
      if (ok) {
        toast({ title: '账号已注销', description: '感谢您的使用，再见', duration: 2500 });
        // deleteAccount 内部已执行登出清理并跳转登录页
      } else {
        toast({ title: '注销失败', description: '请确认密码后重试', variant: 'destructive', duration: 3000 });
        setShowDeleteAccount(false);
      }
    } finally {
      setDeleteLoading(false);
    }
  };

  // 格式化手机号为脱敏显示（历史用户手机号可能只存在 username 中，兜底识别）
  const displayPhone =
    user?.phone || (/^1\d{10}$/.test(user?.username || '') ? user?.username || '' : '') || '';
  const maskedPhone = displayPhone
    ? displayPhone.length >= 11
      ? `${displayPhone.slice(0, 3)}****${displayPhone.slice(-4)}`
      : displayPhone
    : '';

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploading(true);
    try {
      const result = await uploadAvatar(file);
      if (result.success && result.url) {
        setAvatar(result.url);
        toast({
          title: '上传成功',
          description: '头像已更新',
          duration: 2000,
        });
      } else {
        toast({
          title: '上传失败',
          description: result.error || '请重试',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch {
      toast({
        title: '上传失败',
        description: '请稍后重试',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setUploading(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const success = await updateUser({
        name: formData.name,
        company: formData.company,
        address: formData.address,
      });
      if (success) {
        toast({
          title: '保存成功',
          description: '个人资料已更新',
          duration: 2000,
        });
      } else {
        toast({
          title: '保存失败',
          description: '请稍后重试',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch {
      toast({
        title: '保存失败',
        description: '请稍后重试',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="p-4 space-y-4">
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">个人资料</CardTitle>
          <CardDescription>管理您的个人信息</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="flex items-center gap-4">
            <Avatar className="h-16 w-16 ring-2 ring-blue-100">
              <AvatarImage src={avatar} />
              <AvatarFallback className="bg-gradient-to-br from-brand-primary to-brand-secondary text-white text-lg">
                {formData.name?.[0] || 'U'}
              </AvatarFallback>
            </Avatar>
            <input
              type="file"
              ref={fileInputRef}
              className="hidden"
              accept="image/*"
              onChange={handleAvatarChange}
            />
            <Button
              variant="outline"
              size="sm"
              onClick={handleAvatarClick}
              disabled={uploading}
            >
              {uploading ? (
                <Loader2 className="h-3 w-3 mr-2 animate-spin" />
              ) : (
                <Edit2 className="h-3 w-3 mr-2" />
              )}
              更换头像
            </Button>
          </div>

          <div className="space-y-3">
            <div className="space-y-1">
              <Label>姓名</Label>
              <Input
                value={formData.name}
                onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                placeholder="请输入姓名"
              />
            </div>
            <div className="space-y-1">
              <Label>邮箱</Label>
              <div className="flex items-center gap-2">
                <Mail className="h-4 w-4 text-gray-400" />
                {/* #[20260829-1700] 修复虚假数据：无邮箱时显示"未设置"而非假邮箱 */}
                <Input value={user?.email || '未设置'} readOnly className="bg-gray-50" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>手机</Label>
              <div className="flex items-center gap-2">
                <Phone className="h-4 w-4 text-gray-400" />
                <Input value={maskedPhone || '未设置'} readOnly className="bg-gray-50" />
              </div>
            </div>
            <div className="space-y-1">
              <Label>公司</Label>
              <div className="flex items-center gap-2">
                <Building className="h-4 w-4 text-gray-400" />
                <Input
                  value={formData.company}
                  onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                  placeholder="请输入公司名称"
                />
              </div>
            </div>
            <div className="space-y-1">
              <Label>地址</Label>
              <div className="flex items-center gap-2">
                <MapPin className="h-4 w-4 text-gray-400" />
                <Input
                  value={formData.address}
                  onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                  placeholder="请输入地址"
                />
              </div>
            </div>
          </div>

          <Button
            className="w-full bg-gradient-to-r from-brand-primary to-brand-secondary"
            onClick={handleSave}
            disabled={saving}
          >
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            {saving ? '保存中...' : '保存修改'}
          </Button>
        </CardContent>
      </Card>

      {/* 账号安全：用户名 / 密码 / 微信绑定（#20260820-1600） */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">账号安全</CardTitle>
          <CardDescription>设置用户名、密码，绑定微信快速登录</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="space-y-1">
            <Label>用户名</Label>
            <div className="flex gap-2">
              <Input
                value={username}
                onChange={(e) => setUsername(e.target.value)}
                placeholder={COMPLETE_PROFILE_TEXT.usernamePlaceholder}
                maxLength={30}
                autoComplete="off"
              />
              <Button
                variant="outline"
                size="sm"
                className="shrink-0"
                onClick={saveUsername}
                disabled={savingUsername}
              >
                {savingUsername && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                保存
              </Button>
            </div>
          </div>

          <div className="space-y-3 rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center justify-between">
              <p className="text-sm font-medium">
                {user?.hasPassword ? '修改密码' : '设置密码'}
              </p>
              <p className="text-xs text-gray-400">
                {user?.hasPassword ? '验证旧密码后更新' : '短信验证码确认后设置'}
              </p>
            </div>

            {user?.hasPassword ? (
              <div className="space-y-2">
                <Input
                  type="password"
                  value={oldPassword}
                  onChange={(e) => setOldPassword(e.target.value)}
                  placeholder="请输入旧密码"
                  autoComplete="current-password"
                />
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={COMPLETE_PROFILE_TEXT.passwordPlaceholder}
                  autoComplete="new-password"
                />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请确认新密码"
                  autoComplete="new-password"
                />
              </div>
            ) : (
              <div className="space-y-2">
                <div className="flex gap-2">
                  <Input
                    type="text"
                    inputMode="numeric"
                    maxLength={6}
                    value={smsCode}
                    onChange={(e) => setSmsCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="短信验证码"
                    disabled={codeCountdown > 0 || sendingCode}
                  />
                  <Button
                    variant="outline"
                    size="sm"
                    className="shrink-0"
                    onClick={sendPasswordCode}
                    disabled={sendingCode || codeCountdown > 0}
                  >
                    {sendingCode && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                    {codeCountdown > 0 ? `${codeCountdown}s` : '获取验证码'}
                  </Button>
                </div>
                <Input
                  type="password"
                  value={newPassword}
                  onChange={(e) => setNewPassword(e.target.value)}
                  placeholder={COMPLETE_PROFILE_TEXT.passwordPlaceholder}
                  autoComplete="new-password"
                />
                <Input
                  type="password"
                  value={confirmPassword}
                  onChange={(e) => setConfirmPassword(e.target.value)}
                  placeholder="请确认新密码"
                  autoComplete="new-password"
                />
              </div>
            )}

            <Button
              className="w-full"
              onClick={handleSavePassword}
              disabled={savingPassword || !newPassword || !confirmPassword}
            >
              {savingPassword && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
              {user?.hasPassword ? '修改密码' : '设置密码'}
            </Button>
          </div>

          <div className="flex items-center justify-between rounded-lg border border-gray-200 bg-gray-50 p-3">
            <div className="flex items-center gap-2">
              <MessageCircle className="h-4 w-4 text-emerald-500" />
              <div>
                <p className="text-sm font-medium">微信</p>
                <p className="text-xs text-gray-400">
                  {wechatBound
                    ? `已绑定${wechatNickname ? `：${wechatNickname}` : ''}`
                    : COMPLETE_PROFILE_TEXT.wechatBindHint}
                </p>
              </div>
            </div>
            <Button
              variant="outline"
              size="sm"
              className="shrink-0"
              onClick={wechatBound ? handleUnbindWechat : handleBindWechat}
              disabled={wechatActionLoading}
            >
              {wechatActionLoading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
              {wechatBound ? '解绑' : COMPLETE_PROFILE_TEXT.wechatBindButton}
            </Button>
          </div>

          {/* 会话与账号操作（#[20260829-1700]：真实生效的服务端操作） */}
          <div className="space-y-3 pt-1">
            <Button
              variant="outline"
              className="w-full justify-start text-slate-600"
              onClick={() => setShowLogoutAll(true)}
              disabled={logoutAllLoading}
            >
              <LogOut className="h-4 w-4 mr-2" />
              退出全部设备
              <span className="ml-auto text-xs text-gray-400">清除所有设备登录状态</span>
            </Button>
            <Button
              variant="outline"
              className="w-full justify-start text-red-600 hover:text-red-700"
              onClick={() => setShowDeleteAccount(true)}
              disabled={deleteLoading}
            >
              <Trash2 className="h-4 w-4 mr-2" />
              注销账号
              <span className="ml-auto text-xs text-gray-400">永久删除账号及全部数据</span>
            </Button>
          </div>
        </CardContent>
      </Card>

      {/* 全部设备登出确认 */}
      <AlertDialog open={showLogoutAll} onOpenChange={setShowLogoutAll}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>退出全部设备？</AlertDialogTitle>
            <AlertDialogDescription>
              所有设备上的登录状态将被清除，包括手机、平板及其他电脑。执行后需要重新登录。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={logoutAllLoading}>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleLogoutAll} disabled={logoutAllLoading}>
              {logoutAllLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认退出
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      {/* 注销账号确认（需输入密码；未设置密码可直接确认） */}
      <AlertDialog open={showDeleteAccount} onOpenChange={setShowDeleteAccount}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="text-red-600">注销账号</AlertDialogTitle>
            <AlertDialogDescription>
              <div className="space-y-3 pt-2">
                <p>
                  注销后您的账号将被永久删除，包括报价、会话、收藏等全部数据，且无法恢复。请谨慎操作。
                </p>
                {user?.hasPassword && (
                  <div>
                    <label className="text-sm font-medium text-slate-700">请输入登录密码确认</label>
                    <Input
                      type="password"
                      value={deletePassword}
                      onChange={(e) => setDeletePassword(e.target.value)}
                      placeholder="当前账号密码"
                      className="mt-1"
                      autoComplete="current-password"
                    />
                  </div>
                )}
              </div>
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleteLoading}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={handleDeleteAccount}
              disabled={deleteLoading || (!!user?.hasPassword && !deletePassword)}
              className="bg-red-600 text-white hover:bg-red-700"
            >
              {deleteLoading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              永久注销
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
