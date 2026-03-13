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
import { Mail, CheckCircle, XCircle, Loader2 } from 'lucide-react';

interface VerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  email: string;
  expectedCode?: string;
  onVerified: () => void;
}

export function VerificationDialog({
  open,
  onOpenChange,
  email,
  expectedCode,
  onVerified,
}: VerificationDialogProps) {
  const { toast } = useToast();
  const { verifyEmail, sendEmailVerification } = useUser();
  const [step, setStep] = useState<'input' | 'verifying' | 'success' | 'error'>('input');
  const [code, setCode] = useState('');
  const [countdown, setCountdown] = useState(60);
  const [canResend, setCanResend] = useState(false);

  // 验证码验证
  const handleVerify = async () => {
    if (!code || code.length !== 6) {
      toast({
        title: '请输入6位验证码',
        variant: 'destructive',
        duration: 2000,
      });
      return;
    }

    setStep('verifying');

    try {
      const success = await verifyEmail(email, code);

      if (success) {
        setStep('success');
        toast({
          title: '验证成功',
          description: '您的邮箱已成功验证',
          duration: 2000,
        });
        setTimeout(() => {
          onVerified();
        }, 1500);
      } else {
        setStep('error');
        toast({
          title: '验证失败',
          description: '验证码错误或已过期',
          variant: 'destructive',
          duration: 2000,
        });
        setTimeout(() => setStep('input'), 2000);
      }
    } catch (_error) {
      setStep('error');
      setTimeout(() => setStep('input'), 2000);
    }
  };

  // 重新发送验证码
  const handleResend = async () => {
    setCountdown(60);
    setCanResend(false);

    const result = await sendEmailVerification(email);

    toast({
      title: '验证码已重新发送',
      description: result.code ? `验证码: ${result.code}` : '请查收邮件',
      duration: 3000,
    });
  };

  // 倒计时
  useEffect(() => {
    if (step !== 'input' || countdown <= 0) {
      if (countdown === 0) setCanResend(true);
      return;
    }

    const timer = setInterval(() => {
      setCountdown((prev) => prev - 1);
    }, 1000);

    return () => clearInterval(timer);
  }, [step, countdown]);

  // 重置状态
  useEffect(() => {
    if (!open) {
      setStep('input');
      setCode('');
      setCountdown(60);
      setCanResend(false);
    }
  }, [open]);

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Mail className="h-5 w-5 text-blue-600" />
            邮箱验证
          </DialogTitle>
          <DialogDescription>
            验证码已发送至 <span className="font-medium text-blue-600">{email}</span>
            {expectedCode && (
              <span className="block mt-1 text-xs text-gray-500">调试验证码: {expectedCode}</span>
            )}
          </DialogDescription>
        </DialogHeader>

        {step === 'input' && (
          <div className="space-y-4 py-4">
            <div className="space-y-2">
              <label className="text-sm font-medium">验证码</label>
              <Input
                value={code}
                onChange={(e) => setCode(e.target.value)}
                placeholder="请输入6位验证码"
                maxLength={6}
                className="text-center text-lg tracking-widest"
                autoFocus
              />
            </div>

            <div className="flex items-center justify-between text-sm">
              <span className="text-gray-500">
                {countdown > 0 ? `${countdown}秒后可重新发送` : '验证码已过期'}
              </span>
              <button
                onClick={handleResend}
                disabled={!canResend}
                className={`text-blue-600 hover:underline ${
                  !canResend && 'opacity-50 cursor-not-allowed'
                }`}
              >
                重新发送
              </button>
            </div>

            <Button onClick={handleVerify} className="w-full" disabled={code.length !== 6}>
              验证
            </Button>
          </div>
        )}

        {step === 'verifying' && (
          <div className="py-8 text-center">
            <Loader2 className="h-12 w-12 animate-spin text-blue-600 mx-auto mb-4" />
            <p className="text-lg font-medium">正在验证...</p>
          </div>
        )}

        {step === 'success' && (
          <div className="py-8 text-center">
            <CheckCircle className="h-12 w-12 text-green-600 mx-auto mb-4" />
            <p className="text-lg font-medium text-green-600">验证成功！</p>
            <p className="text-sm text-gray-500 mt-2">即将跳转...</p>
          </div>
        )}

        {step === 'error' && (
          <div className="py-8 text-center">
            <XCircle className="h-12 w-12 text-red-600 mx-auto mb-4" />
            <p className="text-lg font-medium text-red-600">验证失败</p>
            <p className="text-sm text-gray-500 mt-2">验证码错误，请重试</p>
          </div>
        )}
      </DialogContent>
    </Dialog>
  );
}
