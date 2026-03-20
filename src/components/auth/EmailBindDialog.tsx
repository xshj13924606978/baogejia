'use client';

import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@/contexts/UserContext';
import { Mail, Loader2, CheckCircle } from 'lucide-react';

interface EmailBindDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBound: () => void;
}

export function EmailBindDialog({ open, onOpenChange, onBound }: EmailBindDialogProps) {
  const { toast } = useToast();
  const { bindEmail } = useUser();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [bindSuccess, setBindSuccess] = useState(false);

  // 重置状态
  useEffect(() => {
    if (!open) {
      setEmail('');
      setPassword('');
      setConfirmPassword('');
      setEmailError('');
      setBindSuccess(false);
    }
  }, [open]);

  const validateEmail = (email: string) => {
    const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
    return emailRegex.test(email);
  };

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setEmail(value);
    if (value && !validateEmail(value)) {
      setEmailError('请输入正确的邮箱格式');
    } else {
      setEmailError('');
    }
  };

  const handleBind = async () => {
    if (!email || !validateEmail(email)) {
      toast({ title: '请输入正确的邮箱', variant: 'destructive', duration: 3000 });
      return;
    }

    if (!password || password.length < 6) {
      toast({ title: '密码至少6位', variant: 'destructive', duration: 3000 });
      return;
    }

    if (password !== confirmPassword) {
      toast({ title: '两次密码不一致', variant: 'destructive', duration: 3000 });
      return;
    }

    setLoading(true);

    try {
      const result = await bindEmail(email, password);

      if (result.success) {
        setBindSuccess(true);
        toast({
          title: '绑定成功',
          description: '邮箱已绑定到您的账号',
          duration: 2000,
        });

        setTimeout(() => {
          onBound();
          onOpenChange(false);
        }, 1500);
      } else {
        toast({
          title: '绑定失败',
          description: result.error || '请重试',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (_error) {
      toast({
        title: '绑定失败',
        description: '请稍后重试',
        variant: 'destructive',
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {bindSuccess ? (
              <CheckCircle className="h-5 w-5 text-green-600" />
            ) : (
              <Mail className="h-5 w-5 text-blue-600" />
            )}
            {bindSuccess ? '绑定成功' : '绑定邮箱'}
          </DialogTitle>
          <DialogDescription>
            {bindSuccess
              ? '邮箱已绑定到您的账号'
              : '设置密码后，您可以用「邮箱+密码」方式登录'}
          </DialogDescription>
        </DialogHeader>

        {bindSuccess ? (
          <div className="py-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <p className="text-lg font-medium">邮箱绑定成功！</p>
            <p className="text-sm text-gray-500 mt-2">即将关闭...</p>
          </div>
        ) : (
        <div className="space-y-4 py-4">
          <div className="space-y-2">
            <label className="text-sm font-medium">邮箱地址</label>
            <Input
              value={email}
              onChange={handleEmailChange}
              placeholder="请输入邮箱"
              className={emailError ? 'border-red-500' : ''}
              autoComplete="off"
              autoCorrect="off"
              spellCheck={false}
              data-lpignore="true"
              data-form-type="other"
            />
            {emailError && <p className="text-xs text-red-500">{emailError}</p>}
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">设置密码</label>
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder="至少6位"
              minLength={6}
              autoComplete="new-password"
              data-lpignore="true"
              data-form-type="other"
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-medium">确认密码</label>
            <Input
              type="password"
              value={confirmPassword}
              onChange={(e) => setConfirmPassword(e.target.value)}
              placeholder="请再次输入密码"
              minLength={6}
              autoComplete="new-password"
              data-lpignore="true"
              data-form-type="other"
            />
          </div>

          <p className="text-xs text-gray-500">设置密码后，您可以用「邮箱+密码」方式登录</p>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleBind} disabled={loading}>
              {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              确认绑定
            </Button>
          </div>
        </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
