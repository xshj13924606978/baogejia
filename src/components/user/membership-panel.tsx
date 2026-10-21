'use client';

// 会员中心（阶段二 #202608292500-会员与Token套餐）
// 数据源：/api/membership/plans + /api/membership/current
// 购买：/api/membership/purchase → 微信 Native code_url → 轮询 /api/membership/orders/[orderNo]

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Crown, CheckCircle2, History, RefreshCw, CalendarClock } from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { useToast } from '@/components/ui/use-toast';
import { MEMBERSHIP_CODE_LABEL } from '@/lib/level-constants';
import { formatDate } from '@/lib/date-utils';

interface MembershipPlan {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  duration_days: number;
  level_code: string;
  benefits: Record<string, any> | null;
  sort_order: number;
  is_popular: boolean;
}

interface MembershipRecord {
  id: string;
  order_no: string;
  plan_id: string;
  level_code: string;
  status: 'active' | 'expired' | 'cancelled' | 'pending';
  start_date: string;
  end_date: string;
  created_at: string;
  plan?: { id: string; name: string; price: number; duration_days: number } | null;
}

interface CurrentMembership {
  id: string;
  order_no: string;
  plan_id: string;
  level_code: string;
  start_date: string;
  end_date: string;
  status: string;
  days_left: number;
  plan?: { id: string; name: string; price: number } | null;
}

// #202608302400 阶段1：等级名称统一来源（用户 / 会员 / 白银 / 黄金 / 白金）
const LEVEL_LABEL: Record<string, string> = MEMBERSHIP_CODE_LABEL;

const LEVEL_STYLE: Record<string, string> = {
  vip: 'bg-purple-100 text-purple-700',
  premium: 'bg-amber-100 text-amber-700',
  enterprise: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white',
};

const STATUS_LABEL: Record<string, string> = {
  active: '生效中',
  expired: '已过期',
  cancelled: '已取消',
  pending: '待支付',
};

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 30;

export default function MembershipPanel() {
  const { toast } = useToast();
  const [plans, setPlans] = useState<MembershipPlan[]>([]);
  const [current, setCurrent] = useState<CurrentMembership | null>(null);
  const [history, setHistory] = useState<MembershipRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [buying, setBuying] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 扫码支付状态
  const [payPlan, setPayPlan] = useState<MembershipPlan | null>(null);
  const [codeUrl, setCodeUrl] = useState<string | null>(null);
  const [payOrderNo, setPayOrderNo] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccess, setPaySuccess] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const [showHistory, setShowHistory] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [plansRes, currentRes, historyRes] = await Promise.all([
        fetch('/api/membership/plans', { headers: getClientAuthHeaders() }),
        fetch('/api/membership/current', { headers: getClientAuthHeaders() }),
        fetch('/api/membership/history?limit=20', { headers: getClientAuthHeaders() }),
      ]);
      const plansData = await plansRes.json();
      const currentData = await currentRes.json();
      const historyData = await historyRes.json();
      if (!plansData.success) throw new Error(plansData.error || '加载套餐失败');
      setPlans(plansData.plans || []);
      setCurrent(currentData.success ? currentData.membership : null);
      setHistory(historyData.success ? historyData.history || [] : []);
    } catch (e: any) {
      setLoadError(e?.message || '加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadData();
    return () => stopPolling();
  }, [loadData]);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  /** 轮询会员订单状态 */
  const startPolling = (orderNo: string) => {
    stopPolling();
    let attempts = 0;
    pollTimerRef.current = setInterval(async () => {
      attempts += 1;
      if (attempts >= POLL_MAX_ATTEMPTS) {
        stopPolling();
        setPayError('支付超时，请确认支付后刷新查看');
        setCodeUrl(null);
        return;
      }
      try {
        const res = await fetch(`/api/membership/orders/${orderNo}`, { headers: getClientAuthHeaders() });
        const data = await res.json();
        if (!data.success) return;
        const order = data.order;
        if (order.status === 'active') {
          stopPolling();
          setPaySuccess(true);
          toast({ title: '开通成功', description: '会员权益已生效', duration: 2500 });
          setTimeout(() => {
            setPayPlan(null);
            setCodeUrl(null);
            setPaySuccess(false);
            setPayOrderNo(null);
            loadData();
          }, 1500);
        } else if (order.status === 'cancelled') {
          stopPolling();
          setPayError('订单已取消');
          setCodeUrl(null);
        }
      } catch (e) {
        console.warn('[MembershipPanel] 轮询支付状态失败:', e);
      }
    }, POLL_INTERVAL_MS);
  };

  /** 购买会员（微信扫码） */
  const handleBuy = async (plan: MembershipPlan) => {
    setPayPlan(plan);
    setPaying(true);
    setPayError('');
    setCodeUrl(null);
    try {
      const res = await fetch('/api/membership/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ planId: plan.id }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '下单失败');
      if (!data.code_url) throw new Error('支付二维码获取失败');
      setCodeUrl(data.code_url);
      setPayOrderNo(data.orderNo);
      setPaying(false);
      if (data.orderNo) startPolling(data.orderNo);
    } catch (e: any) {
      setPayError(e?.message || '下单失败，请重试');
      setPaying(false);
    }
  };

  const closePayDialog = () => {
    stopPolling();
    setPayPlan(null);
    setCodeUrl(null);
    setPayError('');
    setPaySuccess(false);
    setPayOrderNo(null);
    setPaying(false);
  };


  return (
    <div className="space-y-4">
      {/* 当前会员状态 */}
      <Card className="bg-gradient-to-r from-purple-500 to-fuchsia-600 border-purple-400 text-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white/80">当前会员</div>
              {current ? (
                <>
                  <div className="text-2xl font-bold flex items-center gap-2">
                    {LEVEL_LABEL[current.level_code] || current.level_code || '会员'}
                    <Crown className="h-5 w-5 text-yellow-300" />
                  </div>
                  <div className="text-xs text-white/80 mt-1">
                    有效期至 {formatDate(current.end_date)} · 剩余 {current.days_left} 天
                  </div>
                </>
              ) : (
                <>
                  <div className="text-2xl font-bold">暂未开通</div>
                  <div className="text-xs text-white/80 mt-1">开通会员解锁专属权益</div>
                </>
              )}
            </div>
            {current && (
              <div className="text-right">
                <div className="text-3xl font-bold">{current.days_left}</div>
                <div className="text-xs text-white/80">剩余天数</div>
              </div>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 消息提示 */}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* 套餐列表 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Crown className="h-4 w-4 text-purple-500" />
          会员套餐
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-slate-500"
          onClick={() => {
            setShowHistory((v) => !v);
          }}
        >
          <History className="mr-1 h-3.5 w-3.5" />
          {showHistory ? '收起历史' : `购买历史${history.length ? `(${history.length})` : ''}`}
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          套餐加载中...
        </div>
      )}
      {!loading && loadError && (
        <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
          <span>{loadError}</span>
          <Button variant="outline" size="sm" onClick={loadData}>
            <RefreshCw className="mr-1.5 h-3.5 w-3.5" />重试
          </Button>
        </div>
      )}
      {!loading && !loadError && plans.length === 0 && (
        <div className="rounded-xl border border-dashed py-8 text-center text-sm text-slate-400">
          暂无在售套餐，敬请期待
        </div>
      )}

      {!loading && !loadError && plans.length > 0 && (
        <div className="space-y-3">
          {plans.map((plan) => {
            const discount =
              plan.original_price && Number(plan.original_price) > Number(plan.price)
                ? Math.round((1 - Number(plan.price) / Number(plan.original_price)) * 100)
                : 0;
            return (
              <Card key={plan.id} className={`hover:shadow-md transition-all ${plan.is_popular ? 'border-purple-300' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-start justify-between">
                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-bold text-base">{plan.name}</span>
                        {plan.is_popular && (
                          <Badge className="bg-purple-500 text-white">热门</Badge>
                        )}
                        <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${LEVEL_STYLE[plan.level_code] || 'bg-gray-100 text-gray-600'}`}>
                          {LEVEL_LABEL[plan.level_code] || plan.level_code}
                        </span>
                      </div>
                      <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                        {plan.description || '会员专属权益'}
                      </div>
                      <div className="flex items-center gap-1 text-xs text-gray-400 mt-1">
                        <CalendarClock className="h-3 w-3" />
                        {plan.duration_days} 天有效期
                      </div>
                    </div>
                    <div className="text-right shrink-0">
                      <div className="flex items-baseline gap-1">
                        <span className="text-lg font-bold text-purple-600">¥{Number(plan.price).toFixed(2)}</span>
                        {plan.original_price && Number(plan.original_price) > Number(plan.price) && (
                          <span className="text-xs text-gray-400 line-through">¥{Number(plan.original_price).toFixed(2)}</span>
                        )}
                      </div>
                      {discount > 0 && <div className="text-[11px] text-red-500">立省 {discount}%</div>}
                      <Button
                        size="sm"
                        className="mt-2 bg-purple-500 hover:bg-purple-600"
                        disabled={buying === plan.id}
                        onClick={() => handleBuy(plan)}
                      >
                        {buying === plan.id ? '下单中...' : '立即开通'}
                      </Button>
                    </div>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      {/* 购买历史 */}
      {showHistory && (
        <div className="rounded-xl border border-slate-100 p-3">
          <div className="mb-2 text-sm font-medium text-slate-600">我的购买记录</div>
          {history.length === 0 && <p className="py-3 text-center text-sm text-slate-400">暂无购买记录</p>}
          {history.length > 0 && (
            <div className="space-y-1.5">
              {history.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-700">
                      {r.plan?.name || '会员套餐'} · {LEVEL_LABEL[r.level_code] || r.level_code}
                    </p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(r.created_at).toLocaleString('zh-CN', {
                        month: 'numeric',
                        day: 'numeric',
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </p>
                  </div>
                  <div className="ml-2 shrink-0 text-right">
                    <span className="text-sm font-bold text-purple-600">¥{Number(r.plan?.price || 0).toFixed(2)}</span>
                    <p className="text-[11px] text-slate-400">{STATUS_LABEL[r.status] || r.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 扫码支付弹窗 */}
      <Dialog open={!!payPlan} onOpenChange={(v) => { if (!v) closePayDialog(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{paySuccess ? '开通成功' : '微信扫码支付'}</DialogTitle>
            <DialogDescription>
              {paySuccess ? '会员权益已生效' : `${payPlan?.name} · ¥${Number(payPlan?.price || 0).toFixed(2)}`}
            </DialogDescription>
          </DialogHeader>
          {paySuccess ? (
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-500 mb-2" />
              <div className="text-sm font-medium text-slate-700">会员开通成功！</div>
            </div>
          ) : (
            <div className="space-y-4 py-2">
              {paying && (
                <div className="flex flex-col items-center justify-center py-8 text-sm text-slate-400">
                  <Loader2 className="h-8 w-8 animate-spin mb-2" />
                  正在生成支付二维码...
                </div>
              )}
              {!paying && codeUrl && (
                <div className="flex flex-col items-center">
                  <div className="rounded-xl border-2 border-slate-200 bg-white p-3">
                    <QRCodeSVG value={codeUrl} size={220} level="M" />
                  </div>
                  <p className="mt-3 text-xs text-slate-500">请使用微信扫一扫完成支付</p>
                  <p className="mt-1 text-xs text-slate-400">支付成功后会员将自动开通</p>
                </div>
              )}
              {payError && (
                <div className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{payError}</div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
}
