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
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@/contexts/UserContext';
import { Mail, Loader2, CheckCircle, AlertCircle } from 'lucide-react';

interface EmailBindDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail?: string;
  onBound: () => void;
}

const EMAIL_REGEX = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;

// 占位邮箱（contributor 等场景自动生成），视为"未绑定真实邮箱"
function isPlaceholderEmail(email: string): boolean {
  return /@(contributor\.local|local|example\.com)$/i.test(email) || !email;
}

/**
 * 绑定/换绑邮箱对话框（#[20260829-1700] 重构）
 * - 绑定（无真实邮箱）：新邮箱验证码 → bindEmail(email, undefined, code)
 * - 换绑（有真实邮箱）：旧邮箱验证码（发送至本人旧邮箱）→ 新邮箱验证码 →
 *   bindEmail(new, undefined, newCode, oldEmail, oldCode)
 * - 密码设置已从绑定流程移除（密码在「账号安全」中单独设置），杜绝重复设置密码。
 */
export function EmailBindDialog({
  open,
  onOpenChange,
  currentEmail,
  onBound,
}: EmailBindDialogProps) {
  const { toast } = useToast();
  const { bindEmail } = useUser();
  const [email, setEmail] = useState('');
  const [code, setCode] = useState('');
  const [oldCode, setOldCode] = useState('');
  const [oldCodeSent, setOldCodeSent] = useState(false);
  const [step, setStep] = useState<'input' | 'code'>('input');
  const [loading, setLoading] = useState(false);
  const [sending, setSending] = useState(false);
  const [emailError, setEmailError] = useState('');
  const [bindSuccess, setBindSuccess] = useState(false);
  const [countdown, setCountdown] = useState(0);

  const isRebind = !!currentEmail && !isPlaceholderEmail(currentEmail);

  // 重置状态
  useEffect(() => {
    if (!open) {
      setEmail('');
      setCode('');
      setOldCode('');
      setOldCodeSent(false);
      setStep('input');
      setEmailError('');
      setBindSuccess(false);
      setCountdown(0);
    }
  }, [open]);

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => setCountdown((c) => (c <= 1 ? 0 : c - 1)), 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const validateEmail = (value: string) => EMAIL_REGEX.test(value);

  const handleEmailChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value.trim();
    setEmail(value);
    setEmailError(value && !validateEmail(value) ? '请输入正确的邮箱格式' : '');
  };

  // 发送旧邮箱验证码（换绑第一步）
  const sendOldCode = async () => {
    setSending(true);
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('session_token') : null;
      const res = await fetch('/api/auth/send-email-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-user-token': token } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ email: currentEmail, purpose: 'rebind' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setOldCodeSent(true);
        setCountdown(60);
        toast({ title: '验证码已发送', description: `已发送至 ${currentEmail}`, duration: 3000 });
      } else {
        toast({ title: data.error || '发送失败', variant: 'destructive', duration: 3000 });
      }
    } catch {
      toast({ title: '网络错误，请稍后重试', variant: 'destructive', duration: 3000 });
    } finally {
      setSending(false);
    }
  };

  // 发送新邮箱验证码
  const sendNewCode = async (goToCodeStep = true) => {
    if (!validateEmail(email)) {
      toast({ title: '请输入正确的邮箱', variant: 'destructive', duration: 3000 });
      return;
    }
    setSending(true);
    try {
      const token = typeof window !== 'undefined' ? window.localStorage.getItem('session_token') : null;
      const res = await fetch('/api/auth/send-email-code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          ...(token ? { 'x-user-token': token } : {}),
        },
        credentials: 'include',
        body: JSON.stringify({ email, purpose: 'bind' }),
      });
      const data = await res.json();
      if (res.ok && data.success) {
        setCountdown(60);
        if (goToCodeStep) setStep('code');
        toast({ title: '验证码已发送', description: `已发送至 ${email}`, duration: 3000 });
      } else {
        toast({ title: data.error || '发送失败', variant: 'destructive', duration: 3000 });
      }
    } catch {
      toast({ title: '网络错误，请稍后重试', variant: 'destructive', duration: 3000 });
    } finally {
      setSending(false);
    }
  };

  const handleBind = async () => {
    if (!code || code.length < 4) {
      toast({ title: '请输入验证码', variant: 'destructive', duration: 3000 });
      return;
    }
    if (isRebind && (!oldCodeSent || oldCode.length < 4)) {
      toast({ title: '请先完成旧邮箱验证', variant: 'destructive', duration: 3000 });
      return;
    }

    setLoading(true);
    try {
      const result = await bindEmail(
        email,
        undefined,
        code,
        isRebind ? currentEmail : undefined,
        isRebind ? oldCode : undefined
      );
      if (result.success) {
        setBindSuccess(true);
        toast({
          title: isRebind ? '修改成功' : '绑定成功',
          description: '邮箱已更新',
          duration: 2000,
        });
        setTimeout(() => {
          onBound();
          onOpenChange(false);
        }, 1500);
      } else {
        toast({ title: result.error || '绑定失败，请重试', variant: 'destructive', duration: 3000 });
      }
    } catch (_error) {
      toast({ title: '绑定失败', description: '请稍后重试', variant: 'destructive', duration: 3000 });
    } finally {
      setLoading(false);
    }
  };

  if (bindSuccess) {
    return (
      <Dialog open={open} onOpenChange={onOpenChange}>
        <DialogContent className="sm:max-w-[400px]">
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2 text-green-600">
              <CheckCircle className="h-5 w-5" />
              {isRebind ? '修改成功' : '绑定成功'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <p className="text-lg font-medium">{isRebind ? '邮箱修改成功！' : '邮箱绑定成功！'}</p>
            <p className="text-sm text-gray-500 mt-2">即将关闭...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[450px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            {isRebind ? '更换邮箱' : '绑定邮箱'}
          </DialogTitle>
          <DialogDescription>
            {isRebind
              ? `当前邮箱: ${currentEmail}。更换邮箱需先验证旧邮箱`
              : '绑定邮箱后，您可以用邮箱找回密码'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 换绑第一步：旧邮箱验证 */}
          {isRebind && !oldCodeSent && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-800">第一步：验证旧邮箱</p>
              <p className="text-xs text-amber-700">验证码将发送至 {currentEmail}</p>
              <Button
                variant="outline"
                size="sm"
                onClick={sendOldCode}
                disabled={sending || countdown > 0}
              >
                {sending && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {countdown > 0 ? `${countdown}s后重发` : '获取验证码'}
              </Button>
              {oldCodeSent && (
                <Input
                  value={oldCode}
                  onChange={(e) => setOldCode(e.target.value.replace(/\s/g, '').slice(0, 12))}
                  placeholder="旧邮箱验证码"
                  inputMode="numeric"
                />
              )}
            </div>
          )}

          {step === 'input' ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">{isRebind ? '新邮箱地址' : '邮箱地址'}</label>
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

              <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg flex items-start gap-2">
                <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0 text-blue-600" />
                <p className="text-xs text-blue-700 dark:text-blue-400">
                  绑定需通过邮箱验证码完成，验证码将发送至 {email || '新邮箱'}。密码可在「账号安全」中单独设置。
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  取消
                </Button>
                <Button
                  onClick={() => sendNewCode(true)}
                  disabled={sending || !email || !!emailError || (isRebind && (!oldCodeSent || oldCode.length < 4))}
                >
                  {sending && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  下一步
                </Button>
              </div>
            </>
          ) : (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">验证码</label>
                <div className="flex gap-2">
                  <Input
                    value={code}
                    onChange={(e) => setCode(e.target.value.replace(/\s/g, '').slice(0, 12))}
                    placeholder="请输入验证码"
                    className="flex-1"
                    inputMode="numeric"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={() => sendNewCode(false)}
                    disabled={countdown > 0 || sending}
                    className="w-24"
                  >
                    {countdown > 0 ? `${countdown}s` : '重发'}
                  </Button>
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-950/30 p-3 rounded-lg">
                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                  验证码已发送至 {email}，请查收邮件
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setStep('input')} disabled={loading}>
                  上一步
                </Button>
                <Button onClick={handleBind} disabled={loading || code.length < 4}>
                  {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
                  {loading ? '提交中...' : '确认'}
                </Button>
              </div>
            </>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
