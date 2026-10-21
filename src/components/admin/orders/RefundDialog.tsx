'use client';

// 管理端：订单退款弹窗（#202608292700-阶段四：统一订单）
// POST /api/admin/orders/[orderNo]/refund

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription,
} from '@/components/ui/dialog';
import { useToast } from '@/components/ui/use-toast';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { Loader2 } from 'lucide-react';

interface RefundDialogProps {
  orderNo: string | null;
  onClose: () => void;
  onRefunded: () => void;
}

export const RefundDialog: React.FC<RefundDialogProps> = ({ orderNo, onClose, onRefunded }) => {
  const { toast } = useToast();
  const [reason, setReason] = useState('');
  const [submitting, setSubmitting] = useState(false);

  const handleSubmit = async () => {
    if (!orderNo) return;
    if (!reason.trim()) {
      toast({ title: '请填写退款原因', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/orders/${orderNo}/refund`, {
        method: 'POST',
        headers: getClientAuthHeaders(),
        body: JSON.stringify({ reason: reason.trim() }),
      });
      const data = await res.json();
      if (!data.success) {
        toast({ title: '退款失败', description: data.error || '请稍后重试', variant: 'destructive' });
        return;
      }
      toast({ title: '退款成功', description: `订单 ${orderNo} 已退款` });
      onRefunded();
      onClose();
    } catch (e: any) {
      toast({ title: '退款失败', description: e?.message || '网络异常', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <Dialog open={!!orderNo} onOpenChange={(open) => !open && onClose()}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>订单退款</DialogTitle>
          <DialogDescription>
            订单号：{orderNo}。退款仅标记订单为已退款并同步业务状态，不发起真实资金原路退回。
          </DialogDescription>
        </DialogHeader>
        <div className="space-y-4 py-2">
          <div>
            <Label>退款原因</Label>
            <Input
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="请输入退款原因（必填）"
              className="mt-1.5"
            />
          </div>
          <div className="flex justify-end gap-2">
            <Button variant="outline" onClick={onClose} disabled={submitting}>
              取消
            </Button>
            <Button variant="destructive" onClick={handleSubmit} disabled={submitting}>
              {submitting && <Loader2 className="h-4 w-4 animate-spin mr-1" />}
              确认退款
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
