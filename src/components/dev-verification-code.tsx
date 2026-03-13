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
  phone: string;
  code: string;
}

export function DevVerificationCode() {
  const [open, setOpen] = useState(false);
  const [codeInfo, setCodeInfo] = useState<CodeInfo | null>(null);

  useEffect(() => {
    const handleShowCode = (event: CustomEvent<CodeInfo>) => {
      setCodeInfo(event.detail);
      setOpen(true);

      // 3秒后自动关闭
      setTimeout(() => {
        setOpen(false);
      }, 5000);
    };

    window.addEventListener('show-verification-code', handleShowCode as EventListener);
    return () => {
      window.removeEventListener('show-verification-code', handleShowCode as EventListener);
    };
  }, []);

  if (process.env.NODE_ENV !== 'development') {
    return null;
  }

  return (
    <Dialog open={open} onOpenChange={setOpen}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="text-blue-600">📱 开发环境验证码</DialogTitle>
          <DialogDescription>手机号: {codeInfo?.phone}</DialogDescription>
        </DialogHeader>
        <div className="py-6 text-center">
          <div className="text-4xl font-bold tracking-wider text-blue-600">{codeInfo?.code}</div>
          <p className="text-sm text-gray-500 mt-2">该验证码仅在开发环境显示，5分钟内有效</p>
        </div>
      </DialogContent>
    </Dialog>
  );
}
