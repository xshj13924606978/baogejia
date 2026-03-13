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
import { WechatBindDialog } from '@/components/auth/WechatBindDialog';
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
  const [showWechatBind, setShowWechatBind] = useState(false);
  const [showPhoneChange, setShowPhoneChange] = useState(false);
  const [unbinding, setUnbinding] = useState<string | null>(null);
  const [uploadingAvatar, setUploadingAvatar] = useState(false);

  // 当user变化时更新表单
  useEffect(() => {
    if (user) {
      console.log('[ProfileDialog] 用户数据更新:', user);
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
  }, [user]);

  // 当弹窗关闭时，退出编辑模式
  useEffect(() => {
    if (!open) {
      setEditing(false);
      setSaving(false);
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
                      onClick={() => setShowWechatBind(true)}
                      className="whitespace-nowrap bg-green-50 text-green-700 border-green-200 hover:bg-green-100"
                    >
                      <QrCode className="h-4 w-4 mr-1" />
                      绑定
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

      {/* 邮箱绑定弹窗 */}
      <EmailBindDialog
        open={showEmailBind}
        onOpenChange={setShowEmailBind}
        onBound={handleEmailBound}
      />

      {/* 微信绑定弹窗 */}
      <WechatBindDialog
        open={showWechatBind}
        onOpenChange={setShowWechatBind}
        onBound={async () => {
          await refreshUser();
        }}
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
