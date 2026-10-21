'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Loader2, AlertCircle, RotateCcw, ReceiptText, ChevronDown, QrCode, CheckCircle2, RefreshCw } from 'lucide-react';
import { QRCodeSVG } from 'qrcode.react';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { useToast } from '@/components/ui/use-toast';
import { OrderType, PaymentMethod } from '@/types/payment';

interface RechargeDialogProps {
  open: boolean;
  onClose: () => void;
  /** 本次对话所需积分 */
  required: number;
  /** 当前剩余积分 */
  balance: number;
  /** 用户 ID（supabaseId 优先） */
  userId: string;
}

interface RechargePack {
  id: string;
  name: string;
  desc: string;
  points: number;
  price: number;
}

interface ExchangeRates {
  yuanToTokens: number;
  yuanToPoints: number;
  pointsToTokens: number;
}

const PAY_METHODS = [
  { value: PaymentMethod.WECHAT_NATIVE, label: '微信扫码', icon: '微' },
  { value: PaymentMethod.ALIPAY_WEB, label: '支付宝', icon: '支' },
];

// #202608292100-P0: 支付宝支付入口下架（未配置真实凭据时隐藏，避免走 mock 链路）
// 配置来源：/api/recharge/plans 返回的 alipayEnabled（服务端判断 ALIPAY_APP_ID/PRIVATE_KEY）
// 或客户端 NEXT_PUBLIC_ALIPAY_APP_ID（若未来提供）
const isAlipayConfiguredByEnv = !!process.env.NEXT_PUBLIC_ALIPAY_APP_ID;

// 轮询参数：每 3 秒一次，最多 20 次（60 秒）
const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 20;

export default function RechargeDialog({
  open,
  onClose,
  required,
  balance,
  userId,
}: RechargeDialogProps) {
  const { toast } = useToast();
  const [plans, setPlans] = useState<RechargePack[]>([]);
  const [exchangeRates, setExchangeRates] = useState<ExchangeRates | null>(null);
  const [loading, setLoading] = useState(false);
  const [loadError, setLoadError] = useState('');
  const [selectedPackId, setSelectedPackId] = useState<string>('');
  const [payMethod, setPayMethod] = useState<PaymentMethod>(PaymentMethod.WECHAT_NATIVE);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  // #202608292100-P0: 支付宝是否已配置（服务端判断，未配置则隐藏支付宝支付方式）
  const [alipayEnabled, setAlipayEnabled] = useState(false);

  // 微信扫码支付流程状态
  const [payStep, setPayStep] = useState<'choose' | 'paying'>('choose');
  const [qrCodeUrl, setQrCodeUrl] = useState<string | null>(null);
  const [payOrderNo, setPayOrderNo] = useState<string | null>(null);
  const [paymentSuccess, setPaymentSuccess] = useState(false);
  const [pollingLeft, setPollingLeft] = useState(POLL_MAX_ATTEMPTS);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 积分明细折叠面板（默认收起，展开时加载最近 10 条，仅当前登录用户自己的记录）
  const [showTxPanel, setShowTxPanel] = useState(false);
  const [txList, setTxList] = useState<Array<{
    id: string;
    points: number;
    type: string;
    description: string;
    balanceAfter: number | null;
    createdAt: string;
  }>>([]);
  const [txLoading, setTxLoading] = useState(false);
  const [txError, setTxError] = useState('');

  const loadTx = async () => {
    setTxLoading(true);
    setTxError('');
    try {
      const res = await fetch('/api/user/transactions?page=1&limit=10');
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取积分明细失败');
      setTxList(data.data || []);
    } catch (e: any) {
      setTxList([]);
      setTxError(e?.message || '获取积分明细失败，请稍后重试');
    } finally {
      setTxLoading(false);
    }
  };

  useEffect(() => {
    if (open && showTxPanel) loadTx();
  }, [open, showTxPanel]);

  // 打开弹窗时动态拉取后台充值套餐与兑换比例（与后台积分兑换规则同步，不硬编码）
  const loadPlans = async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/recharge/plans');
      const data = await res.json();
      if (!data.success || !data.data?.plans?.length) {
        throw new Error(data.error || '获取充值套餐失败');
      }
      setPlans(data.data.plans);
      setExchangeRates(data.data.exchangeRates || null);
      // #202608292100-P0: 读取服务端支付宝配置状态
      setAlipayEnabled(data.data.alipayEnabled === true);
      setSelectedPackId(data.data.plans[0].id);
    } catch (e: any) {
      setPlans([]);
      setLoadError(e?.message || '加载充值套餐失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  };

  // 重置弹窗状态（重新打开 / 关闭时调用）
  const resetPayState = () => {
    stopPolling();
    setPayStep('choose');
    setQrCodeUrl(null);
    setPayOrderNo(null);
    setPaymentSuccess(false);
    setError('');
    setSubmitting(false);
  };

  useEffect(() => {
    if (open) {
      loadPlans();
      resetPayState();
    }
  }, [open]);

  // 卸载时清理轮询定时器
  useEffect(() => {
    return () => stopPolling();
  }, []);

  const selectedPack = useMemo(
    () => plans.find((p) => p.id === selectedPackId) || plans[0],
    [plans, selectedPackId]
  );
  const shortage = Math.max(0, required - balance);

  // #202608292100-P0: 支付宝未配置时隐藏，仅显示微信扫码支付
  const isAlipayConfigured = alipayEnabled || isAlipayConfiguredByEnv;
  const visiblePayMethods = PAY_METHODS.filter(
    (m) => m.value !== PaymentMethod.ALIPAY_WEB || isAlipayConfigured
  );

  /** 停止订单状态轮询 */
  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  /** 开始轮询订单状态（每 3 秒一次，最多 60 秒） */
  const startPolling = (orderNo: string) => {
    stopPolling();
    let attempts = 0;

    pollTimerRef.current = setInterval(async () => {
      attempts += 1;
      setPollingLeft(Math.max(0, POLL_MAX_ATTEMPTS - attempts));

      // 达到最大轮询次数：停止轮询并提示
      if (attempts >= POLL_MAX_ATTEMPTS) {
        stopPolling();
        setError('支付超时，请确认支付后重新查询或重新下单');
        setPayStep('choose');
        setQrCodeUrl(null);
        setPayOrderNo(null);
        toast({ title: '支付超时', description: '请确认支付结果后重新下单', variant: 'destructive', duration: 3000 });
        return;
      }

      try {
        const res = await fetch(`/api/recharge/orders/${orderNo}`, {
          headers: getClientAuthHeaders(),
        });
        const data = await res.json();
        if (!data.success) return;

        const status = data.order?.status;
        if (status === 'completed') {
          stopPolling();
          setPaymentSuccess(true);
          // 触发积分更新事件，通知全局刷新积分显示
          try {
            window.dispatchEvent(new CustomEvent('points-updated'));
          } catch (e) {
            console.error('[RechargeDialog] 触发积分更新事件失败:', e);
          }
          toast({ title: '充值成功', description: `已到账 ${data.order.points || ''} 积分`, duration: 2500 });
          setTimeout(() => onClose(), 1200);
        } else if (status === 'cancelled' || status === 'expired' || status === 'failed') {
          stopPolling();
          setError(`订单${status === 'expired' ? '已过期' : status === 'cancelled' ? '已取消' : '已失败'}，请重新下单`);
          setPayStep('choose');
          setQrCodeUrl(null);
          setPayOrderNo(null);
        }
      } catch (e) {
        // 网络异常不中断轮询，等待下一轮
        console.warn('[RechargeDialog] 轮询订单状态失败:', e);
      }
    }, POLL_INTERVAL_MS);
  };

  /** 微信扫码支付：创建订单 → 获取二维码 → 轮询状态 */
  const handleWechatPay = async () => {
    if (submitting || !userId || !selectedPack) return;
    setSubmitting(true);
    setError('');
    try {
      const headers = { 'Content-Type': 'application/json', ...getClientAuthHeaders() };

      // 1. 创建充值订单（pending）
      const orderRes = await fetch('/api/recharge/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({ planId: selectedPack.id }),
      });
      const orderData = await orderRes.json();
      if (!orderData.success || !orderData.order?.order_no) {
        throw new Error(orderData.error || '创建订单失败');
      }
      const orderNo = orderData.order.order_no;

      // 2. 获取微信支付二维码
      const payRes = await fetch('/api/payment/wechat/unifiedorder', {
        method: 'POST',
        headers,
        body: JSON.stringify({ orderNo }),
      });
      const payData = await payRes.json();
      if (!payData.success || !payData.code_url) {
        throw new Error(payData.error || '获取支付二维码失败');
      }

      setQrCodeUrl(payData.code_url);
      setPayOrderNo(orderNo);
      setPayStep('paying');
      setSubmitting(false);

      // 3. 开始轮询订单状态
      startPolling(orderNo);
    } catch (e: any) {
      setError(e?.message || '创建支付失败，请重试');
      setSubmitting(false);
    }
  };

  /** 支付宝（网页跳转）：沿用原有 /api/orders + /api/payment 流程 */
  const handleAlipayPay = async () => {
    if (submitting || !userId || !selectedPack) return;
    setSubmitting(true);
    setError('');
    try {
      const headers = { 'Content-Type': 'application/json', ...getClientAuthHeaders() };

      // 1. 创建积分购买订单
      const orderRes = await fetch('/api/orders', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          user_id: userId,
          type: OrderType.POINTS_PURCHASE,
          item_id: selectedPack.id,
          item_name: selectedPack.name,
          amount: selectedPack.price,
          payment_method: payMethod,
          metadata: { points_reward: selectedPack.points },
        }),
      });
      const orderData = await orderRes.json();
      if (!orderData.success || !orderData.order?.id) {
        throw new Error(orderData.error || '创建订单失败');
      }

      // 2. 发起支付
      const paymentRes = await fetch('/api/payment', {
        method: 'POST',
        headers,
        body: JSON.stringify({
          order_id: orderData.order.id,
          payment_method: payMethod,
          return_url: `${window.location.origin}/payment/result`,
        }),
      });
      const paymentData = await paymentRes.json();
      if (!paymentData.success) {
        throw new Error(paymentData.error || '创建支付失败');
      }

      // 3. 跳转支付
      if (paymentData.payment?.payment_url) {
        window.location.href = paymentData.payment.payment_url;
      } else if (paymentData.payment?.qr_code) {
        // #[20260901-1300] P2-3：原生 alert 替换为设计系统 toast
        toast({
          title: '请扫描二维码完成支付',
          description: paymentData.payment.qr_code,
        });
      } else {
        throw new Error('支付方式暂不支持，请稍后重试');
      }
    } catch (e: any) {
      setError(e?.message || '发起支付失败，请重试');
      setSubmitting(false);
    }
  };

  const handlePay = async () => {
    if (payMethod === PaymentMethod.WECHAT_NATIVE) {
      await handleWechatPay();
    } else {
      await handleAlipayPay();
    }
  };

  /** 用户手动点击"我已支付"：立即查询一次订单状态 */
  const handleCheckPaid = async () => {
    if (!payOrderNo) return;
    try {
      const res = await fetch(`/api/recharge/orders/${payOrderNo}`, {
        headers: getClientAuthHeaders(),
      });
      const data = await res.json();
      if (data.success && data.order?.status === 'completed') {
        stopPolling();
        setPaymentSuccess(true);
        try {
          window.dispatchEvent(new CustomEvent('points-updated'));
        } catch (e) {
          console.error('[RechargeDialog] 触发积分更新事件失败:', e);
        }
        toast({ title: '充值成功', description: `已到账 ${data.order.points || ''} 积分`, duration: 2500 });
        setTimeout(() => onClose(), 1200);
      } else if (data.success && data.order?.status === 'pending') {
        toast({ title: '尚未支付', description: '请使用微信扫码完成支付', duration: 2000 });
      } else {
        toast({ title: '查询失败', description: data.error || '请稍后重试', variant: 'destructive', duration: 2000 });
      }
    } catch (e) {
      console.error('[RechargeDialog] 查询支付状态失败:', e);
      toast({ title: '查询失败', description: '请稍后重试', variant: 'destructive', duration: 2000 });
    }
  };

  return (
    <Dialog
      open={open}
      onOpenChange={(v) => {
        // 弹窗任何状态下均可关闭（关闭时清理轮询）
        if (!v) {
          resetPayState();
          onClose();
        }
      }}
    >
      <DialogContent className="flex max-h-[85vh] flex-col sm:max-w-3xl">
        <DialogHeader>
          <DialogTitle>积分充值</DialogTitle>
          <DialogDescription>
            当前余额 <span className="font-bold text-amber-600">{balance}</span> 积分，本次对话需要{' '}
            <span className="font-bold">{required}</span> 积分，还差{' '}
            <span className="font-bold text-red-600">{shortage}</span> 积分。
            {exchangeRates && (
              <span className="mt-1 block text-xs text-slate-500 dark:text-slate-400">
                兑换比例：1 元 = {exchangeRates.yuanToPoints} 积分
                {exchangeRates.pointsToTokens ? ` · 1 积分 = ${exchangeRates.pointsToTokens} Tokens` : ''}
              </span>
            )}
          </DialogDescription>
        </DialogHeader>

        <div className="flex min-h-0 flex-1 flex-col gap-3 overflow-hidden py-2">
          {/* ===== 选择阶段：套餐 + 支付方式 ===== */}
          {payStep === 'choose' && (
            <>
              {/* 充值套餐选择（动态加载，紧凑卡片） */}
              <div className="shrink-0 space-y-1.5">
                <div className="text-sm font-medium">选择充值套餐</div>

                {loading && (
                  <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed border-slate-300 dark:border-slate-600 py-6 text-sm text-slate-500">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    正在加载套餐...
                  </div>
                )}

                {!loading && loadError && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {loadError}
                    </div>
                    <Button variant="outline" size="sm" onClick={loadPlans}>
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      重新加载
                    </Button>
                  </div>
                )}

                {!loading && !loadError && (
                  <div className="grid grid-cols-2 gap-1.5 sm:grid-cols-3">
                    {plans.map((pack) => (
                      <button
                        key={pack.id}
                        type="button"
                        onClick={() => setSelectedPackId(pack.id)}
                        className={`rounded-xl border-2 p-2 text-left transition-all ${
                          selectedPackId === pack.id
                            ? 'border-orange-500 bg-orange-50 dark:bg-orange-950/30'
                            : 'border-slate-200 dark:border-slate-700 hover:border-slate-300'
                        }`}
                      >
                        <div className="text-sm font-semibold">{pack.name}</div>
                        <div className="mt-0.5 truncate text-[11px] text-slate-500 dark:text-slate-400">{pack.desc}</div>
                        <div className="mt-0.5 text-base font-bold text-orange-600">¥{pack.price}</div>
                      </button>
                    ))}
                  </div>
                )}
              </div>

              {/* 支付方式选择（紧凑一行小标签） */}
              <div className="shrink-0 space-y-1.5">
                <div className="text-sm font-medium">选择支付方式</div>
                <div className="flex flex-wrap gap-1.5">
                  {visiblePayMethods.map((m) => (
                    <button
                      key={m.value}
                      type="button"
                      onClick={() => setPayMethod(m.value)}
                      className={`flex items-center gap-1.5 rounded-full border px-3 py-1.5 text-xs transition-all ${
                        payMethod === m.value
                          ? 'border-blue-500 bg-blue-50 text-blue-700 dark:bg-blue-950/30 dark:text-blue-300'
                          : 'border-slate-200 text-slate-600 hover:border-slate-300 dark:border-slate-700 dark:text-slate-300'
                      }`}
                    >
                      <span className="flex h-4 w-4 shrink-0 items-center justify-center rounded-full bg-blue-600 text-[10px] font-bold text-white">
                        {m.icon}
                      </span>
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>
            </>
          )}

          {/* ===== 支付中阶段：微信扫码二维码 ===== */}
          {payStep === 'paying' && qrCodeUrl && (
            <div className="flex flex-col items-center justify-center gap-3 py-2">
              {paymentSuccess ? (
                <div className="flex flex-col items-center gap-2 py-4">
                  <CheckCircle2 className="h-14 w-14 text-green-500" />
                  <p className="text-lg font-bold text-green-600">充值成功！</p>
                  <p className="text-sm text-slate-500">积分即将到账，正在关闭窗口...</p>
                </div>
              ) : (
                <>
                  <div className="rounded-2xl border-2 border-slate-200 bg-white p-3 dark:border-slate-700">
                    <QRCodeSVG value={qrCodeUrl} size={200} marginSize={1} />
                  </div>
                  <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-200">
                    <QrCode className="h-4 w-4 text-blue-500" />
                    请使用微信「扫一扫」扫描二维码支付
                  </div>
                  <p className="text-xs text-slate-400">
                    订单号：{payOrderNo} · 金额：¥{selectedPack?.price} · {pollingLeft} 次轮询后超时
                  </p>
                  {/* #[20260901-1510] 明确状态语义：成功态仅由系统轮询确认后展示，避免误解 */}
                  <p className="text-xs text-slate-400">支付成功后系统将在几秒内自动确认到账，无需手动操作</p>
                  <div className="flex items-center gap-2">
                    {/* #[20260901-1510] 手动查询按钮去"完成态"视觉：中性图标+动作文案，
                        避免未支付时被误认为"已支付完成"状态提示（原为绿色✓+陈述文案） */}
                    <Button variant="outline" size="sm" onClick={handleCheckPaid}>
                      <RefreshCw className="mr-1.5 h-3.5 w-3.5 text-slate-500" />
                      我已完成支付，点击查询
                    </Button>
                    <Button
                      variant="ghost"
                      size="sm"
                      onClick={() => {
                        resetPayState();
                      }}
                    >
                      返回重新选择
                    </Button>
                  </div>
                </>
              )}
            </div>
          )}

          {/* 积分明细折叠面板（默认收起，仅显示当前登录用户自己的记录，主体占约 3/5 高度） */}
          <div className="flex min-h-0 flex-[3] flex-col border-t border-slate-100 pt-2 dark:border-slate-800">
            <button
              type="button"
              onClick={() => setShowTxPanel((v) => !v)}
              className="flex w-full items-center justify-between text-sm font-medium text-slate-600 transition-colors hover:text-slate-900 dark:text-slate-300 dark:hover:text-slate-100"
            >
              <span className="flex items-center gap-1.5">
                <ReceiptText className="h-4 w-4" />
                积分明细
              </span>
              <ChevronDown className={`h-4 w-4 transition-transform ${showTxPanel ? 'rotate-180' : ''}`} />
            </button>

            {showTxPanel && (
              <div className="mt-1.5 min-h-0 flex-1 space-y-1.5">
                {txLoading && (
                  <div className="flex items-center justify-center gap-2 py-4 text-sm text-slate-500 dark:text-slate-400">
                    <Loader2 className="h-4 w-4 animate-spin" />
                    加载中...
                  </div>
                )}

                {!txLoading && txError && (
                  <div className="space-y-2">
                    <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">
                      <AlertCircle className="h-4 w-4 shrink-0" />
                      {txError}
                    </div>
                    <Button variant="outline" size="sm" onClick={loadTx}>
                      <RotateCcw className="mr-1.5 h-3.5 w-3.5" />
                      重新加载
                    </Button>
                  </div>
                )}

                {!txLoading && !txError && txList.length === 0 && (
                  <p className="py-3 text-center text-sm text-slate-400 dark:text-slate-500">暂无积分记录</p>
                )}

                {!txLoading && !txError && txList.length > 0 && (
                  <div className="min-h-0 flex-1 space-y-1 overflow-y-auto pr-1">
                    {txList.map((item) => (
                      <div
                        key={item.id}
                        className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-1.5 dark:bg-slate-800/40"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-xs font-medium text-slate-700 dark:text-slate-200">
                            {item.description}
                          </p>
                          <p className="text-[11px] text-slate-400 dark:text-slate-500">
                            {new Date(item.createdAt).toLocaleString('zh-CN', {
                              year: 'numeric',
                              month: 'numeric',
                              day: 'numeric',
                              hour: '2-digit',
                              minute: '2-digit',
                            })}
                          </p>
                        </div>
                        <div className="ml-2 shrink-0 text-right">
                          <span
                            className={`text-sm font-bold ${
                              item.points >= 0 ? 'text-green-600' : 'text-red-600'
                            }`}
                          >
                            {item.points >= 0 ? '+' : ''}
                            {item.points}
                          </span>
                          {item.balanceAfter !== null && item.balanceAfter !== undefined && (
                            <p className="text-[11px] text-slate-400 dark:text-slate-500">
                              余额 {item.balanceAfter}
                            </p>
                          )}
                        </div>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            )}
          </div>

          {error && (
            <div className="flex items-center gap-2 rounded-lg bg-red-50 dark:bg-red-950/40 px-3 py-2 text-sm text-red-600 dark:text-red-400">
              <AlertCircle className="h-4 w-4 shrink-0" />
              {error}
            </div>
          )}
        </div>

        {/* 底部操作区：选择阶段显示确认支付；支付中阶段仅保留关闭按钮 */}
        <div className="flex justify-end gap-2">
          {payStep === 'choose' ? (
            <>
              <Button variant="outline" onClick={onClose}>
                取消
              </Button>
              <Button
                onClick={handlePay}
                disabled={submitting || !userId || loading || !selectedPack}
                className="bg-orange-500 text-white hover:bg-orange-600"
              >
                {submitting ? (
                  <>
                    <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                    正在创建订单...
                  </>
                ) : (
                  <>确认支付 {selectedPack ? `¥${selectedPack.price}` : ''}</>
                )}
              </Button>
            </>
          ) : (
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          )}
        </div>
      </DialogContent>
    </Dialog>
  );
}
