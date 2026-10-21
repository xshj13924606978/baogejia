'use client';

import React, { useState, useEffect, useRef } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '@/components/ui/avatar';
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@/contexts/UserContext';
import { EmailBindDialog } from '@/components/auth/EmailBindDialog';
import { PhoneChangeDialog } from '@/components/auth/PhoneChangeDialog';
import {
  Mail,
  Phone,
  MessageCircle,
  Building2,
  MapPin,
  User as UserIcon,
  Plus,
  Unlink,
  QrCode,
  AlertCircle,
  Camera,
  Loader2,
  Edit2,
} from 'lucide-react';

interface ProfileDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProfileDialog({ open, onOpenChange }: ProfileDialogProps) {
  const { user, updateUser, unbindEmail, unbindWechat, unbindPhone, uploadAvatar, refreshUser } =
    useUser();
  const { toast } = useToast();
  const fileInputRef = useRef<HTMLInputElement>(null);

  const [formData, setFormData] = useState({
    name: '',
    email: '',
    phone: '',
    company: '',
    address: '',
    avatar: '',
    wechat: null as any,
  });

  const [editing, setEditing] = useState(false);
  const [saving, setSaving] = useState(false);
  const [showEmailBind, setShowEmailBind] = useState(false);
  const [showPhoneChange, setShowPhoneChange] = useState(false);
  const [bindingWechat, setBindingWechat] = useState(false);
  const [unbinding, setUnbinding] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // 记录已被用户主动清空的字段（如解绑后），不被 user 变化覆盖
  const clearedFieldsRef = React.useRef<Set<string>>(new Set());
  // #20260827-0826-6：记录本次会话内已成功绑定的微信数据，防止 refreshUser 的
  // setUser 触发 useEffect[user] 时（若 users_db 同步失败读到旧数据）把已显示的
  // 绑定状态覆盖回"未绑定"。关闭弹窗时清空。
  const boundWechatRef = React.useRef<any>(null);

  // 当user变化时更新表单（跳过已被主动清空的字段）
  useEffect(() => {
    if (user) {
      setFormData(prev => ({
        name: user.name || prev.name || '',
        email: clearedFieldsRef.current.has('email') ? '' : (user.email || prev.email || ''),
        phone: clearedFieldsRef.current.has('phone') ? '' : (user.phone || prev.phone || ''),
        company: user.company || prev.company || '',
        address: user.address || prev.address || '',
        avatar: user.avatar || prev.avatar || '',
        wechat: clearedFieldsRef.current.has('wechat')
          ? null
          : ((user as any).wechat || boundWechatRef.current || prev.wechat || null),
      }));
      // 解绑成功后下次 user 变化不再保护（只在当前 dialog session 内有效）
    }
  }, [user]);

  // 当弹窗关闭时，退出编辑模式
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setSaving(false);
      clearedFieldsRef.current.clear();
      boundWechatRef.current = null;
    }
  }, [open]);

  const getInitials = () => {
    if (formData.name) {
      return formData.name
        .split(' ')
        .map((n) => n[0])
        .join('')
        .toUpperCase()
        .slice(0, 2);
    }
    return formData.email?.[0]?.toUpperCase() || 'U';
  };

  const getGradientByInitial = (initial: string) => {
    const gradients = [
      'from-blue-500 to-blue-600',
      'from-purple-500 to-purple-600',
      'from-green-500 to-green-600',
      'from-orange-500 to-orange-600',
      'from-pink-500 to-pink-600',
      'from-indigo-500 to-indigo-600',
    ];
    const index = (initial?.charCodeAt(0) || 65) % gradients.length;
    return gradients[index];
  };

  const handleAvatarClick = () => {
    fileInputRef.current?.click();
  };

  const handleAvatarChange = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setUploadingAvatar(true);

    try {
      const result = await uploadAvatar(file);

      if (result.success && result.url) {
        setFormData({ ...formData, avatar: result.url });
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
    } catch (_error) {
      toast({
        title: '上传失败',
        description: '请稍后重试',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setUploadingAvatar(false);
      if (fileInputRef.current) {
        fileInputRef.current.value = '';
      }
    }
  };

  // 修改保存逻辑：保存成功后关闭弹窗
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
        setEditing(false);
        // 关闭弹窗
        setTimeout(() => {
          onOpenChange(false);
        }, 500);
      } else {
        toast({
          title: '保存失败',
          description: '请稍后重试',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (_error) {
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

  const handleCancel = () => {
    if (user) {
      setFormData({
        name: user.name || '',
        email: user.email || '',
        phone: user.phone || '',
        company: user.company || '',
        address: user.address || '',
        avatar: user.avatar || '',
        wechat: (user as any).wechat || null,
      });
    }
    setEditing(false);
  };

  const handleUnbind = async (type: 'email' | 'wechat' | 'phone') => {
    setUnbinding(type);

    try {
      let success = false;
      if (type === 'email') {
        success = await unbindEmail();
      } else if (type === 'wechat') {
        success = await unbindWechat();
      } else if (type === 'phone') {
        success = await unbindPhone();
      }

      if (success) {
        // 标记已清空的字段，防止 refreshUser 的 setUser 恢复
        clearedFieldsRef.current.add(type);
        // 直接更新表单数据
        if (type === 'email') {
          setFormData(prev => ({ ...prev, email: '' }));
        } else if (type === 'wechat') {
          setFormData(prev => ({ ...prev, wechat: null }));
        } else if (type === 'phone') {
          setFormData(prev => ({ ...prev, phone: '' }));
        }
        // 后台静默刷新用户数据（获取等级/余额等信息）
        await refreshUser();
        toast({
          title: '解绑成功',
          description: `${type === 'email' ? '邮箱' : type === 'wechat' ? '微信' : '手机号'}已解绑`,
          duration: 2000,
        });
      } else {
        toast({
          title: '解绑失败',
          description: type === 'phone' ? '请至少保留一种登录方式' : '请稍后重试',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (_error) {
      toast({
        title: '解绑失败',
        description: '请稍后重试',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setUnbinding(null);
    }
  };

  const handleEmailBound = async () => {
    await refreshUser();
  };

  const handlePhoneChanged = async () => {
    await refreshUser();
  };

  // 微信绑定：window.open 弹出独立扫码窗口（#20260822-1645）
// 修复：之前整页跳转到微信 → 回调后跳首页（/?wechat_bound=success）造成"闪跳"首页
// 打断用户在 ProfileDialog 的其他操作。
// 新流程：弹窗内加载微信授权 URL → 用户扫码 → 微信回调到
// /api/auth/callback/[provider]（bind 模式）→ 服务端写入 user_oauth_bindings +
// 更新 users.wechat_* → 重定向到 /wechat/bind-result 中间页面 → 中间页面通过
// window.opener.postMessage 通知本对话框 → 自动关闭弹窗；主页面始终停留在
// ProfileDialog，绑定结果以 toast 形式呈现。
// 同时保留 fallback：弹窗被浏览器拦截时回退到整页跳转（与 #20260822-1351 旧实现一致）。
  const handleBindWechat = async () => {
    if (bindingWechat) return;
    setBindingWechat(true);

    try {
      const res = await fetch(
        '/api/auth/oauth-url?provider=wechat&mode=bind',
        { credentials: 'include' }
      );
      const data = await res.json();

      if (!data.success || !data.url) {
        toast({
          title: '绑定失败',
          description: data.error || '获取微信授权链接失败',
          variant: 'destructive',
          duration: 3000,
        });
        return;
      }

      // 计算弹窗居中位置
      const width = 480;
      const height = 620;
      const left = Math.max(0, Math.round((window.screen.width - width) / 2));
      const top = Math.max(0, Math.round((window.screen.height - height) / 2));
      const features = `width=${width},height=${height},left=${left},top=${top},menubar=no,toolbar=no,location=no,status=no,resizable=yes,scrollbars=yes`;

      const popup = window.open(data.url, 'wechat_bind_window', features);

      if (!popup) {
        // 浏览器拦截弹窗 → 回退到整页跳转（与 #20260822-1351 旧实现一致）
        console.warn('[ProfileDialog] window.open 被拦截，回退到整页跳转');
        window.location.href = data.url;
        return;
      }

      // 弹窗成功打开，无需额外操作：等中间页面通过 postMessage 回调通知
      try {
        popup.focus();
      } catch {}
      console.log('[ProfileDialog] 已打开微信扫码弹窗，等待扫码完成回调');
    } catch (error) {
      console.error('[ProfileDialog] 发起微信绑定失败:', error);
      toast({
        title: '绑定失败',
        description: '请稍后重试',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setBindingWechat(false);
    }
  };

  // 接收扫码弹窗回调：用户在微信扫码并完成绑定后，
  // /wechat/bind-result 中间页面会通过 window.opener.postMessage 通知本对话框
  //（事件来源固定为 window.location.origin，避免被任意第三方冒用）。
  useEffect(() => {
    const handler = async (event: MessageEvent) => {
      // 仅接受同源消息
      if (event.origin !== window.location.origin) return;
      const payload: any = event.data;
      if (!payload || payload.type !== 'wechat_bound') return;

      console.log('[ProfileDialog] 收到微信绑定回调:', payload);

      if (payload.success) {
        // #20260827-0826-4 修复：解绑时会把 wechat 加入 clearedFieldsRef，绑定成功后
        // 必须先清除该标记，否则 useEffect 初始化 formData.wechat 会被强制置 null，
        // 导致页面不显示绑定状态，必须刷新才能生效。
        clearedFieldsRef.current.delete('wechat');

        toast({
          title: '微信绑定成功',
          description: '绑定信息已更新',
          duration: 2000,
        });

        // #20260827-0826-6 兜底：verify-session 若失败，用回调携带的真实 OAuth 数据
        //（昵称/头像/openid，来自 bind-result 转发，非本地虚构）构造绑定对象，
        // 保证 UI 至少能立即显示"已绑定（昵称）"，且 openId 与数据库一致。
        const fallbackWechat =
          payload.nickname && typeof payload.nickname === 'string' && payload.nickname.length > 0
            ? {
                openId: typeof payload.openId === 'string' ? payload.openId : '',
                nickname: payload.nickname,
                avatar: typeof payload.avatar === 'string' ? payload.avatar : undefined,
                boundAt: new Date().toISOString(),
              }
            : null;

        // 应用绑定结果：① 直接更新本组件 formData（核心，确保 UI 立即生效）
        // ② 写 localStorage.user ③ 同步 users_db（供 refreshUser / 下次打开弹窗读取）
        const applyBoundUser = (serverUser: any) => {
          const wechatObj = serverUser?.wechat || fallbackWechat;

          // ① 核心：直接、同步地更新 formData，不依赖 refreshUser 间接链路
          if (wechatObj) {
            boundWechatRef.current = wechatObj;
            setFormData((prev) => ({
              ...prev,
              wechat: wechatObj,
            }));
            console.log('[ProfileDialog] 微信绑定状态已直接更新:', wechatObj.nickname);
          } else {
            console.warn('[ProfileDialog] 无法获取 wechat 绑定数据:', serverUser, payload);
          }

          // ② 写 localStorage.user（保留本地 data URL 头像）
          try {
            const localUserStr =
              typeof window !== 'undefined' ? window.localStorage.getItem('user') : null;
            let localUser: any = null;
            if (localUserStr) {
              try { localUser = JSON.parse(localUserStr); } catch {}
            }
            const localAvatar =
              localUser?.avatar && localUser.avatar.startsWith?.('data:') ? localUser.avatar : '';
            const base = serverUser && Object.keys(serverUser).length > 0 ? serverUser : localUser || {};
            const merged = {
              ...base,
              avatar: localAvatar || serverUser?.avatar || localUser?.avatar || '',
              ...(wechatObj ? { wechat: wechatObj } : {}),
            };
            window.localStorage.setItem('user', JSON.stringify(merged));
          } catch (localErr) {
            console.warn('[ProfileDialog] localStorage.user 写入失败:', localErr);
          }

          // ③ 同步 users_db：refreshUser() 只读取 users_db，不读 localStorage.user
          try {
            const dbKey = 'users_db';
            const dbRaw = window.localStorage.getItem(dbKey);
            const dbList = dbRaw ? JSON.parse(dbRaw) : [];
            if (Array.isArray(dbList)) {
              // 同时按 serverUser.id / 当前 context user.id 双维度匹配，
              // 覆盖 users_db 中记录 id 为本地 id 而 supabaseId 为 UUID 的各种场景
              const idx = dbList.findIndex(
                (u: any) =>
                  (serverUser?.id && u.id === serverUser.id) ||
                  (serverUser?.id && u.supabaseId === serverUser.id) ||
                  (user?.id && u.id === user.id) ||
                  (user?.id && u.supabaseId === user.id)
              );
              const wechatPatch = {
                wechat: wechatObj,
                wechatNickname: serverUser?.wechatNickname || wechatObj?.nickname || undefined,
              };
              if (idx !== -1) {
                dbList[idx] = { ...dbList[idx], ...wechatPatch };
                if (!wechatPatch.wechat) delete dbList[idx].wechat;
              } else {
                const localUserStr =
                  typeof window !== 'undefined' ? window.localStorage.getItem('user') : null;
                let localUser: any = null;
                if (localUserStr) {
                  try { localUser = JSON.parse(localUserStr); } catch {}
                }
                dbList.push({ ...(serverUser || localUser || {}), ...wechatPatch });
              }
              window.localStorage.setItem(dbKey, JSON.stringify(dbList));
            }
          } catch (dbSyncErr) {
            console.warn('[ProfileDialog] users_db 同步微信绑定失败:', dbSyncErr);
          }
        };

        // 从服务端重新拉取用户信息，让 ProfileDialog 显示最新的 wechat_nickname / 头像等
        try {
          const verifyRes = await fetch('/api/auth/verify-session', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            credentials: 'include',
            body: JSON.stringify({}),
          });
          const verifyData = await verifyRes.json();
          // #20260827-0826-7 修复：verify-session 返回结构为 { valid, user }（UserContext
          // 同字段），此前误用 success 导致绑定回调时永远走兜底分支；兜底又因回调
          // payload 无 nickname 而拿不到 wechat 数据，UI 停留在"未绑定"，刷新后才显示。
          if (verifyRes.ok && verifyData?.valid && verifyData.user) {
            applyBoundUser(verifyData.user);
          } else {
            console.warn('[ProfileDialog] verify-session 未成功，使用回调昵称兜底:', verifyData);
            applyBoundUser({});
          }
        } catch (e) {
          console.warn('[ProfileDialog] verify-session 刷新失败，使用回调昵称兜底:', e);
          applyBoundUser({});
        }
        if (typeof refreshUser === 'function') {
          try { await refreshUser(); } catch {}
        }
      } else {
        toast({
          title: '微信绑定失败',
          description: '请稍后重试',
          variant: 'destructive',
          duration: 3000,
        });
      }
    };

    window.addEventListener('message', handler);
    return () => window.removeEventListener('message', handler);
  }, [refreshUser, toast]);

  const initials = getInitials();
  const gradientClass = getGradientByInitial(initials);

  return (
    <>
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[500px] max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>个人资料</DialogTitle>
            <DialogDescription>查看和编辑您的个人信息</DialogDescription>
          </DialogHeader>

          <div className="space-y-4 py-4">
            {/* 头像区域 - 可点击上传 */}
            <div className="flex flex-col items-center gap-2">
              <div className="relative">
                <Avatar
                  className="h-20 w-20 ring-2 ring-blue-100 cursor-pointer hover:opacity-80 transition-opacity"
                  onClick={handleAvatarClick}
                >
                  {formData.avatar ? <AvatarImage src={formData.avatar} /> : null}
                  <AvatarFallback
                    className={`bg-gradient-to-br ${gradientClass} text-white text-xl`}
                  >
                    {initials}
                  </AvatarFallback>
                </Avatar>
                <div
                  className="absolute -bottom-1 -right-1 bg-blue-500 rounded-full p-1.5 cursor-pointer hover:bg-blue-600 transition-colors"
                  onClick={handleAvatarClick}
                >
                  {uploadingAvatar ? (
                    <Loader2 className="h-3 w-3 text-white animate-spin" />
                  ) : (
                    <Camera className="h-3 w-3 text-white" />
                  )}
                </div>
              </div>
              <input
                type="file"
                ref={fileInputRef}
                className="hidden"
                accept="image/*"
                onChange={handleAvatarChange}
              />
              <p className="text-xs text-gray-500">点击头像上传</p>
            </div>

            {/* 编辑按钮 - 非编辑模式显示 */}
            {!editing && (
              <div className="flex justify-end">
                <Button
                  variant="outline"
                  size="sm"
                  onClick={() => setEditing(true)}
                  className="gap-2"
                >
                  <Edit2 className="h-4 w-4" />
                  编辑资料
                </Button>
              </div>
            )}

            {/* 表单字段 */}
            <div className="space-y-4 mt-2">
              {/* 姓名/昵称 - 可编辑 */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <UserIcon className="h-4 w-4 text-gray-500" />
                  姓名
                </label>
                {editing ? (
                  <Input
                    value={formData.name}
                    onChange={(e) => setFormData({ ...formData, name: e.target.value })}
                    placeholder="请输入姓名"
                  />
                ) : (
                  <p className="text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                    {formData.name || '未设置'}
                  </p>
                )}
              </div>

              {/* 邮箱 - 绑定/解绑 */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Mail className="h-4 w-4 text-gray-500" />
                  邮箱
                </label>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                    {formData.email || '未绑定'}
                  </p>
                  {!formData.email ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowEmailBind(true)}
                      className="whitespace-nowrap"
                      disabled={unbinding === 'email'}
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      绑定
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnbind('email')}
                      className="whitespace-nowrap text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                      disabled={unbinding === 'email'}
                    >
                      {unbinding === 'email' ? '处理中...' : '解绑'}
                    </Button>
                  )}
                </div>
                {formData.email && <p className="text-xs text-gray-500">可用于登录账号</p>}
              </div>

              {/* 手机 - 可变更/绑定 */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Phone className="h-4 w-4 text-gray-500" />
                  手机
                </label>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                    {formData.phone || '未绑定'}
                  </p>
                  {!formData.phone ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPhoneChange(true)}
                      className="whitespace-nowrap"
                    >
                      <Plus className="h-4 w-4 mr-1" />
                      绑定
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => setShowPhoneChange(true)}
                      className="whitespace-nowrap"
                    >
                      变更
                    </Button>
                  )}
                </div>
                {formData.phone && <p className="text-xs text-gray-500">可用于登录账号</p>}
              </div>

              {/* 微信 - 绑定/解绑 */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <MessageCircle className="h-4 w-4 text-gray-500" />
                  微信
                </label>
                <div className="flex items-center gap-2">
                  <p className="flex-1 text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                    {formData.wechat ? (
                      <span className="flex items-center gap-2">
                        <span className="text-green-600">已绑定</span>
                        {formData.wechat.nickname && (
                          <span className="text-xs text-gray-500">
                            ({formData.wechat.nickname})
                          </span>
                        )}
                      </span>
                    ) : (
                      '未绑定'
                    )}
                  </p>
                  {!formData.wechat ? (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={handleBindWechat}
                      disabled={bindingWechat}
                      className="whitespace-nowrap bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                    >
                      <QrCode className="h-4 w-4 mr-1" />
                      {bindingWechat ? '跳转中...' : '绑定'}
                    </Button>
                  ) : (
                    <Button
                      variant="outline"
                      size="sm"
                      onClick={() => handleUnbind('wechat')}
                      className="whitespace-nowrap text-red-600 hover:text-red-700 border-red-200 hover:border-red-300"
                      disabled={unbinding === 'wechat'}
                    >
                      {unbinding === 'wechat' ? '处理中...' : '解绑'}
                    </Button>
                  )}
                </div>
                {formData.wechat && <p className="text-xs text-gray-500">可使用微信扫码登录</p>}
              </div>

              {/* 公司 - 可编辑 */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <Building2 className="h-4 w-4 text-gray-500" />
                  公司
                </label>
                {editing ? (
                  <Input
                    value={formData.company}
                    onChange={(e) => setFormData({ ...formData, company: e.target.value })}
                    placeholder="请输入公司名称"
                  />
                ) : (
                  <p className="text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                    {formData.company || '未设置'}
                  </p>
                )}
              </div>

              {/* 地址 - 可编辑 */}
              <div className="space-y-2">
                <label className="text-sm font-medium flex items-center gap-2">
                  <MapPin className="h-4 w-4 text-gray-500" />
                  地址
                </label>
                {editing ? (
                  <Input
                    value={formData.address}
                    onChange={(e) => setFormData({ ...formData, address: e.target.value })}
                    placeholder="请输入地址"
                  />
                ) : (
                  <p className="text-sm p-2 bg-gray-50 dark:bg-gray-800 rounded">
                    {formData.address || '未设置'}
                  </p>
                )}
              </div>

              {/* 提示信息 */}
              <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg mt-2">
                <div className="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-400">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    绑定邮箱或微信后，您可以使用更多方式登录账号。
                    手机号变更后，需要用新手机号登录。
                  </span>
                </div>
              </div>
            </div>

            {/* 编辑模式下的按钮 */}
            {editing && (
              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={handleCancel} disabled={saving}>
                  取消
                </Button>
                <Button onClick={handleSave} disabled={saving}>
                  {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {saving ? '保存中...' : '保存'}
                </Button>
              </div>
            )}
          </div>
        </DialogContent>
      </Dialog>

      {/* 邮箱绑定弹窗（#[20260829-1700]：传当前邮箱以支持换绑双验证） */}
      <EmailBindDialog
        open={showEmailBind}
        onOpenChange={setShowEmailBind}
        currentEmail={formData.email}
        onBound={handleEmailBound}
      />

      {/* 手机号变更/绑定弹窗 */}
      <PhoneChangeDialog
        open={showPhoneChange}
        onOpenChange={setShowPhoneChange}
        currentPhone={formData.phone}
        onChanged={handlePhoneChanged}
      />
    </>
  );
}
