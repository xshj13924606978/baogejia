'use client';

import React from 'react';
import { Lock } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Check, X } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';

interface PermissionDeniedProps {
  requiredLevel?: number;
  requiredPoints?: number;
  moduleName?: string;
  open?: boolean;
  onClose?: () => void;
}

export const PermissionDenied: React.FC<PermissionDeniedProps> = ({
  requiredLevel = 3,
  requiredPoints = 500,
  moduleName = '此功能',
  open = true,
  onClose,
}) => {
  const { user } = useUser();

  // #202608292100-P0: 会员购买链路未接入真实支付，/upgrade 页面不存在，不再跳转
  const handleUpgrade = () => {
    onClose?.();
  };

  const levelSatisfied = (user?.level || 1) >= requiredLevel;
  const pointsSatisfied = (user?.currentPoints || 0) >= requiredPoints;

  return (
    <Dialog open={open} onOpenChange={(isOpen) => !isOpen && onClose?.()}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Lock className="h-5 w-5 text-red-500" />
            <span>暂无权限访问</span>
          </DialogTitle>
        </DialogHeader>

        <div className="space-y-4 py-4">
          <div className="text-sm">
            <p className="font-medium mb-2">{moduleName}需要以下条件：</p>
            <div className="space-y-2">
              <div className="flex items-center justify-between p-2 bg-muted rounded">
                <span>最低等级：Lv.{requiredLevel}</span>
                {user &&
                  (levelSatisfied ? (
                    <Badge variant="default" className="bg-green-500">
                      <Check className="h-3 w-3 mr-1" />
                      Lv.{user.level}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <X className="h-3 w-3 mr-1" />
                      Lv.{user.level}
                    </Badge>
                  ))}
              </div>

              <div className="flex items-center justify-between p-2 bg-muted rounded">
                <span>所需积分：{requiredPoints}</span>
                {user &&
                  (pointsSatisfied ? (
                    <Badge variant="default" className="bg-green-500">
                      <Check className="h-3 w-3 mr-1" />
                      {user.currentPoints}
                    </Badge>
                  ) : (
                    <Badge variant="destructive">
                      <X className="h-3 w-3 mr-1" />
                      {user.currentPoints}
                    </Badge>
                  ))}
              </div>
            </div>
          </div>

          {!levelSatisfied && (
            <p className="text-sm text-muted-foreground">您的等级不足，请升级后再试</p>
          )}

          {!pointsSatisfied && (
            <p className="text-sm text-muted-foreground">您的积分不足，请充值后再试</p>
          )}
        </div>

        <DialogFooter>
          <Button variant="outline" onClick={onClose}>
            知道了
          </Button>
          <Button onClick={handleUpgrade}>立即升级</Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};
