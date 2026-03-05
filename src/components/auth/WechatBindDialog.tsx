'use client';

import React, { useState } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { useToast } from '@/components/ui/use-toast';
import { useUser } from '@/contexts/UserContext';
import { QrCode, Smartphone, AlertCircle } from 'lucide-react';

interface WechatBindDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  onBound: () => void;
}

export function WechatBindDialog({ open, onOpenChange, onBound }: WechatBindDialogProps) {
  const { toast } = useToast();
  const { bindWechat } = useUser();
  const [loading, setLoading] = useState(false);

  const handleBind = async () => {
    setLoading(true);
    try {
      await bindWechat();
      // bindWechat 会跳转到微信授权页，绑定成功后返回
      onBound();
    } catch (error) {
      toast({
        title: "绑定失败",
        description: "请稍后重试",
        variant: "destructive",
        duration: 3000,
      });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-[400px]">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <QrCode className="h-5 w-5 text-green-600" />
            绑定微信
          </DialogTitle>
          <DialogDescription>
            使用微信扫码绑定账号，之后可以用微信快捷登录
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-6 py-4">
          {/* 二维码区域 */}
          <div className="flex justify-center">
            <div className="w-48 h-48 bg-gray-100 dark:bg-gray-800 rounded-lg flex items-center justify-center border-2 border-dashed border-gray-300 dark:border-gray-700">
              <div className="text-center">
                <QrCode className="h-16 w-16 mx-auto text-gray-400 mb-2" />
                <p className="text-xs text-gray-500">加载二维码中...</p>
              </div>
            </div>
          </div>

          {/* 说明文字 */}
          <div className="space-y-3">
            <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
              <Smartphone className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>打开微信，点击「发现」-「扫一扫」扫描二维码</span>
            </div>
            <div className="flex items-start gap-3 text-sm text-gray-600 dark:text-gray-400">
              <AlertCircle className="h-4 w-4 mt-0.5 flex-shrink-0" />
              <span>绑定后可使用微信快捷登录，无需输入密码</span>
            </div>
          </div>

          <div className="flex justify-end gap-2 pt-4">
            <Button variant="outline" onClick={() => onOpenChange(false)}>
              取消
            </Button>
            <Button onClick={handleBind} disabled={loading} className="bg-green-600 hover:bg-green-700">
              {loading ? '跳转中...' : '前往微信授权'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
