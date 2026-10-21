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
import { Phone, AlertCircle, Loader2, CheckCircle } from 'lucide-react';

interface PhoneChangeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentPhone?: string;
  onChanged: () => void;
}

/**
 * 绑定/换绑手机号对话框（#[20260829-1700] 换绑双验证）
 * - 绑定（无当前手机号）：新手机号验证码 → bindPhone(new, code)
 * - 换绑（有当前手机号）：旧手机号验证码 → 新手机号验证码 → bindPhone(new, newCode, old, oldCode)
 * 验证码通过 /api/auth/phone/bind 服务端校验（数据库驱动，杜绝本地假验证）。
 */
export function PhoneChangeDialog({
  open,
  onOpenChange,
  currentPhone,
  onChanged,
}: PhoneChangeDialogProps) {
  const { toast } = useToast();
  const { sendPhoneCode, bindPhone } = useUser();
  const [step, setStep] = useState<'input' | 'code'>('input');
  const [newPhone, setNewPhone] = useState('');
  const [code, setCode] = useState('');
  const [oldCode, setOldCode] = useState('');
  const [oldCodeSent, setOldCodeSent] = useState(false);
  const [loading, setLoading] = useState(false);
  const [countdown, setCountdown] = useState(0);
  const countdownTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    return () => {
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    };
  }, []);
  const [phoneError, setPhoneError] = useState('');
  const [bindSuccess, setBindSuccess] = useState(false);

  const isRebind = !!currentPhone;

  const validatePhone = (phone: string) => {
    const phoneRegex = /^1[3-9]\d{9}$/;
    return phoneRegex.test(phone);
  };

  // 重置状态
  useEffect(() => {
    if (!open) {
      setStep('input');
      setNewPhone('');
      setCode('');
      setOldCode('');
      setOldCodeSent(false);
      setPhoneError('');
      setBindSuccess(false);
      if (countdownTimerRef.current) clearInterval(countdownTimerRef.current);
    }
  }, [open]);

  // 倒计时
  useEffect(() => {
    if (countdown <= 0) return;
    const timer = setInterval(() => {
      setCountdown((prev) => (prev <= 1 ? 0 : prev - 1));
    }, 1000);
    return () => clearInterval(timer);
  }, [countdown]);

  const handlePhoneChange = (e: React.ChangeEvent<HTMLInputElement>) => {
    const value = e.target.value;
    setNewPhone(value);
    if (value && !validatePhone(value)) {
      setPhoneError('请输入正确的11位手机号');
    } else {
      setPhoneError('');
    }
  };

  // 发送旧手机号验证码（换绑第一步）
  const handleSendOldCode = async () => {
    setLoading(true);
    const result = await sendPhoneCode(currentPhone || '', 'bind');
    setLoading(false);
    if (result.success) {
      setOldCodeSent(true);
      setCountdown(60);
      toast({ title: '验证码已发送', description: `已发送至 ${currentPhone}`, duration: 3000 });
    } else {
      toast({ title: result.error || '发送失败', variant: 'destructive', duration: 3000 });
    }
  };

  // 发送新手机号验证码（绑定/换绑第二步）
  const handleSendCode = async () => {
    if (!newPhone) {
      toast({ title: '请输入手机号', variant: 'destructive', duration: 2000 });
      return;
    }
    if (!validatePhone(newPhone)) {
      toast({ title: '手机号格式不正确', variant: 'destructive', duration: 3000 });
      return;
    }

    setLoading(true);
    const result = await sendPhoneCode(newPhone, 'bind');
    setLoading(false);

    if (result.success) {
      toast({
        title: '验证码已发送',
        description: '请查收短信',
        duration: 3000,
      });
      setStep('code');
      setCountdown(60);
    } else {
      toast({ title: result.error || '发送失败', variant: 'destructive', duration: 3000 });
    }
  };

  const handleConfirm = async () => {
    if (!code || code.length !== 6) {
      toast({ title: '请输入6位验证码', variant: 'destructive', duration: 2000 });
      return;
    }
    if (isRebind && (!oldCode || oldCode.length !== 6)) {
      toast({ title: '请先完成旧手机号验证', variant: 'destructive', duration: 2000 });
      return;
    }

    setLoading(true);
    try {
      const result = await bindPhone(
        newPhone,
        code,
        isRebind ? currentPhone : undefined,
        isRebind ? oldCode : undefined
      );

      if (result.success) {
        setBindSuccess(true);
        toast({
          title: currentPhone ? '修改成功' : '绑定成功',
          description: currentPhone ? '手机号已更新' : '手机号已绑定',
          duration: 3000,
        });

        setTimeout(() => {
          onChanged();
          onOpenChange(false);
        }, 1500);
      } else {
        toast({
          title: currentPhone ? '修改失败' : '绑定失败',
          description: result.error || '请重试',
          variant: 'destructive',
          duration: 3000,
        });
      }
    } catch (_error) {
      toast({
        title: currentPhone ? '修改失败' : '绑定失败',
        description: '请稍后重试',
        variant: 'destructive',
        duration: 3000,
      });
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
              {currentPhone ? '修改成功' : '绑定成功'}
            </DialogTitle>
          </DialogHeader>
          <div className="py-8 text-center">
            <CheckCircle className="h-16 w-16 text-green-600 mx-auto mb-4" />
            <p className="text-lg font-medium">
              {currentPhone ? '手机号修改成功！' : '手机号绑定成功！'}
            </p>
            <p className="text-sm text-gray-500 mt-2">即将关闭...</p>
          </div>
        </DialogContent>
      </Dialog>
    );
  }

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Phone className="h-5 w-5 text-blue-600" />
            {currentPhone ? '变更手机号' : '绑定手机号'}
          </DialogTitle>
          <DialogDescription>
            {currentPhone && `当前手机号: ${currentPhone}`}
            {!currentPhone && '绑定手机号后，您可以用手机号登录'}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-4">
          {/* 换绑第一步：旧手机号验证 */}
          {isRebind && !oldCodeSent && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 p-3 space-y-2">
              <p className="text-sm font-medium text-amber-800">第一步：验证旧手机号</p>
              <p className="text-xs text-amber-700">
                为确保账号安全，更换手机号前需先验证当前手机号
              </p>
              <Button
                variant="outline"
                size="sm"
                onClick={handleSendOldCode}
                disabled={loading || countdown > 0}
              >
                {loading && <Loader2 className="h-3 w-3 mr-1 animate-spin" />}
                {countdown > 0 ? `${countdown}s后重发` : oldCodeSent ? '已发送，输入下方验证码' : '获取验证码'}
              </Button>
              {oldCodeSent && (
                <Input
                  value={oldCode}
                  onChange={(e) => setOldCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                  placeholder="旧手机号验证码"
                  maxLength={6}
                  inputMode="numeric"
                />
              )}
            </div>
          )}

          {step === 'input' ? (
            <>
              <div className="space-y-2">
                <label className="text-sm font-medium">
                  {currentPhone ? '新手机号' : '手机号'}
                </label>
                <Input
                  value={newPhone}
                  onChange={handlePhoneChange}
                  placeholder="请输入11位手机号"
                  className={phoneError ? 'border-red-500' : ''}
                />
                {phoneError && <p className="text-xs text-red-500">{phoneError}</p>}
              </div>

              <div className="bg-blue-50 dark:bg-blue-950/30 p-3 rounded-lg">
                <div className="flex items-start gap-2 text-sm text-blue-700 dark:text-blue-400">
                  <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
                  <span>
                    {currentPhone
                      ? '变更手机号后，您需要用新手机号登录'
                      : '绑定手机号后，您可以用手机号登录账号'}
                  </span>
                </div>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => onOpenChange(false)}>
                  取消
                </Button>
                <Button
                  onClick={handleSendCode}
                  disabled={
                    loading ||
                    !newPhone ||
                    !validatePhone(newPhone) ||
                    (isRebind && (!oldCodeSent || oldCode.length !== 6))
                  }
                >
                  {loading ? '发送中...' : '下一步'}
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
                    onChange={(e) => setCode(e.target.value.replace(/\D/g, '').slice(0, 6))}
                    placeholder="6位验证码"
                    maxLength={6}
                    inputMode="numeric"
                    className="flex-1"
                  />
                  <Button
                    type="button"
                    variant="outline"
                    onClick={handleSendCode}
                    disabled={countdown > 0 || loading}
                    className="w-24"
                  >
                    {countdown > 0 ? `${countdown}s` : '重发'}
                  </Button>
                </div>
              </div>

              <div className="bg-yellow-50 dark:bg-yellow-950/30 p-3 rounded-lg">
                <p className="text-xs text-yellow-700 dark:text-yellow-400">
                  验证码已发送至 {newPhone}，请查收短信
                </p>
              </div>

              <div className="flex justify-end gap-2 pt-4">
                <Button variant="outline" onClick={() => setStep('input')} disabled={loading}>
                  上一步
                </Button>
                <Button onClick={handleConfirm} disabled={loading || code.length !== 6}>
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
