'use client';

import { useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { PaymentMethod } from '@/types/payment';

interface PaymentDialogProps {
  open: boolean;
  onClose: () => void;
  item: {
    id: number;
    name: string;
    desc: string;
    points: number;
    price?: number; // 现金价格（元）
  };
  user: {
    id: number;
    points: number;
  };
  onConfirm: (paymentMethod: PaymentMethod) => Promise<void>;
}

export default function PaymentDialog({
  open,
  onClose,
  item,
  user,
  onConfirm,
}: PaymentDialogProps) {
  const [selectedPayment, setSelectedPayment] = useState<PaymentMethod>(PaymentMethod.WECHAT_JSAPI);
  const [processing, setProcessing] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const paymentMethods = [
    {
      value: PaymentMethod.WECHAT_JSAPI,
      label: '微信支付',
      icon: '💬',
      desc: '使用微信余额支付',
      enabled: true,
    },
    {
      value: PaymentMethod.ALIPAY_WEB,
      label: '支付宝支付',
      icon: '🔵',
      desc: '使用支付宝支付',
      enabled: true,
    },
    {
      value: PaymentMethod.WECHAT_NATIVE,
      label: '微信扫码',
      icon: '📱',
      desc: '扫码使用微信支付',
      enabled: true,
    },
    {
      value: PaymentMethod.ALIPAY_QR,
      label: '支付宝扫码',
      icon: '📱',
      desc: '扫码使用支付宝支付',
      enabled: true,
    },
  ];

  const handleConfirm = async () => {
    try {
      setProcessing(true);
      setError(null);

      await onConfirm(selectedPayment);

      // 支付成功后关闭弹窗
      onClose();
    } catch (err: any) {
      setError(err.message || '支付失败，请重试');
    } finally {
      setProcessing(false);
    }
  };

  // 判断是否可以积分兑换
  const canExchangeByPoints = user.points >= item.points;

  return (
    <Dialog open={open} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>选择支付方式</DialogTitle>
        </DialogHeader>

        <div className="space-y-4">
          {/* 商品信息 */}
          <div className="bg-gray-50 p-4 rounded-lg">
            <div className="font-bold">{item.name}</div>
            <div className="text-sm text-gray-600 mt-1">{item.desc}</div>
            <div className="flex items-center justify-between mt-2">
              {item.price ? (
                <>
                  <div className="text-2xl font-bold text-orange-600">¥{item.price}</div>
                  <div className="text-sm text-gray-500 line-through">{item.points}积分</div>
                </>
              ) : (
                <div className="text-2xl font-bold text-orange-600">{item.points}积分</div>
              )}
            </div>
          </div>

          {/* 提示信息 */}
          {canExchangeByPoints ? (
            <Alert>
              <AlertDescription>您的积分充足，可以直接兑换</AlertDescription>
            </Alert>
          ) : (
            <Alert variant="destructive">
              <AlertDescription>
                积分不足，还差 {item.points - user.points} 积分，请使用现金支付
              </AlertDescription>
            </Alert>
          )}

          {/* 支付方式选择 */}
          {(!canExchangeByPoints || item.price) && (
            <div className="space-y-3">
              <Label className="text-sm font-medium">选择支付方式</Label>
              <RadioGroup
                value={selectedPayment}
                onValueChange={(value) => setSelectedPayment(value as PaymentMethod)}
              >
                {paymentMethods
                  .filter((method) => method.enabled)
                  .map((method) => (
                    <div
                      key={method.value}
                      className={`flex items-center space-x-3 p-3 border rounded-lg hover:bg-gray-50 cursor-pointer ${
                        selectedPayment === method.value ? 'border-primary bg-primary/5' : ''
                      }`}
                      onClick={() => setSelectedPayment(method.value)}
                    >
                      <RadioGroupItem value={method.value} id={method.value} />
                      <div className="flex-1">
                        <Label htmlFor={method.value} className="font-medium cursor-pointer">
                          {method.icon} {method.label}
                        </Label>
                        <div className="text-xs text-gray-500 mt-1">{method.desc}</div>
                      </div>
                    </div>
                  ))}
              </RadioGroup>
            </div>
          )}

          {/* 错误提示 */}
          {error && (
            <Alert variant="destructive">
              <AlertDescription>{error}</AlertDescription>
            </Alert>
          )}

          {/* 操作按钮 */}
          <div className="flex gap-3">
            <Button variant="outline" className="flex-1" onClick={onClose} disabled={processing}>
              取消
            </Button>
            <Button
              className="flex-1 bg-orange-500 hover:bg-orange-600"
              onClick={canExchangeByPoints ? undefined : handleConfirm}
              disabled={processing || (canExchangeByPoints && !item.price)}
            >
              {processing
                ? '处理中...'
                : canExchangeByPoints && !item.price
                  ? '请使用积分兑换'
                  : '确认支付'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
}
