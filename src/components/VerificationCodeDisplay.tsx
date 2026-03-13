'use client';

import React, { useEffect, useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogDescription,
} from '@/components/ui/dialog';

interface CodeInfo {
  type: 'phone' | 'email';
  target: string;
  code: string;
  message: string;
}

export function VerificationCodeDisplay() {
  const [open, setOpen] = useState(false);
  const [codeInfo, setCodeInfo] = useState<CodeInfo | null>(null);

  useEffect(() => {
    const handleShowCode = (event: CustomEvent<CodeInfo>) => {
      setCodeInfo(event.detail);
      setOpen(true);

      // 10秒后自动关闭
      setTimeout(() => {
        setOpen(false);
      }, 10000);
    };

    window.addEventListener('show-verification-code', handleShowCode as EventListener);
    return () => {
      window.removeEventListener('show-verification-code', handleShowCode as EventListener);
    };
  }, []);

  if (!codeInfo) return null;

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className={codeInfo.type === 'phone' ? 'text-blue-600' : 'text-green-600'}>
            {codeInfo.type === 'phone' ? '📱 手机验证码' : '📧 邮箱验证码'}
          </DialogTitle>
          <DialogDescription>
            {codeInfo.type === 'phone' ? `手机号: ${codeInfo.target}` : `邮箱: ${codeInfo.target}`}
          </DialogDescription>
        </DialogHeader>
        <div className="py-6 text-center">
          <div className="text-5xl font-bold tracking-wider text-blue-600 mb-4">
            {codeInfo.code}
          </div>
          <p className="text-sm text-gray-500">{codeInfo.message}</p>
          <p className="text-xs text-gray-400 mt-2">该验证码仅在开发环境显示，5分钟内有效</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
