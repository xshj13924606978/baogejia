'use client';

// Token 充值（阶段二 #202608292500-会员与Token套餐）
// 数据源：/api/token/packages + /api/token/balance
// 购买：/api/token/purchase → 微信 Native code_url → 轮询 /api/token/orders/[orderNo]

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Zap, CheckCircle2, History, RefreshCw, Gift } from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { useToast } from '@/components/ui/use-toast';

interface TokenPackage {
  id: string;
  code: string;
  name: string;
  description: string | null;
  token_amount: number;
  price: number;
  original_price: number | null;
  bonus_token: number;
  sort_order: number;
  is_popular: boolean;
}

interface TokenPurchaseRecord {
  id: string;
  order_no: string;
  package_id: string;
  token_amount: number;
  bonus_token: number;
  total_token: number;
  price: number;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  created_at: string;
  package?: { id: string; name: string; token_amount: number } | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待支付',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 30;

export default function TokenPanel() {
  const { toast } = useToast();
  const [packages, setPackages] = useState<TokenPackage[]>([]);
  const [balance, setBalance] = useState<number | null>(null);
  const [history, setHistory] = useState<TokenPurchaseRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // 扫码支付状态
  const [payPackage, setPayPackage] = useState<TokenPackage | null>(null);
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
      const [pkgRes, balRes, histRes] = await Promise.all([
        fetch('/api/token/packages', { headers: getClientAuthHeaders() }),
        fetch('/api/token/balance', { headers: getClientAuthHeaders() }),
        fetch('/api/token/history?limit=20', { headers: getClientAuthHeaders() }),
      ]);
      const pkgData = await pkgRes.json();
      const balData = await balRes.json();
      const histData = await histRes.json();
      if (!pkgData.success) throw new Error(pkgData.error || '加载套餐失败');
      setPackages(pkgData.packages || []);
      setBalance(balData.success ? balData.balance : null);
      setHistory(histData.success ? histData.history || [] : []);
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

  /** 轮询 Token 订单状态 */
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
        const res = await fetch(`/api/token/orders/${orderNo}`, { headers: getClientAuthHeaders() });
        const data = await res.json();
        if (!data.success) return;
        const order = data.order;
        if (order.status === 'completed') {
          stopPolling();
          setPaySuccess(true);
          toast({ title: '充值成功', description: `${order.total_token} Tokens 已到账`, duration: 2500 });
          setTimeout(() => {
            setPayPackage(null);
            setCodeUrl(null);
            setPaySuccess(false);
            setPayOrderNo(null);
            loadData();
          }, 1500);
        } else if (order.status === 'cancelled' || order.status === 'refunded') {
          stopPolling();
          setPayError('订单已取消或退款');
          setCodeUrl(null);
        }
      } catch (e) {
        console.warn('[TokenPanel] 轮询支付状态失败:', e);
      }
    }, POLL_INTERVAL_MS);
  };

  /** 购买 Token（微信扫码） */
  const handleBuy = async (pkg: TokenPackage) => {
    setPayPackage(pkg);
    setPaying(true);
    setPayError('');
    setCodeUrl(null);
    try {
      const res = await fetch('/api/token/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ packageId: pkg.id }),
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
    setPayPackage(null);
    setCodeUrl(null);
    setPayError('');
    setPaySuccess(false);
    setPayOrderNo(null);
    setPaying(false);
  };

  return (
    <div className="space-y-4">
      {/* Token 余额 */}
      <Card className="bg-gradient-to-r from-cyan-500 to-blue-600 border-cyan-400 text-white">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-white/80">当前 Token 余额</div>
              <div className="text-3xl font-bold flex items-center gap-2">
                {balance === null ? '--' : balance}
                <Zap className="h-6 w-6 text-yellow-300" />
              </div>
              <div className="text-xs text-white/80 mt-1">AI 报价与方案生成消耗 Token</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-white/80">单位</div>
              <div className="text-2xl font-bold">Tokens</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 套餐列表 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Zap className="h-4 w-4 text-blue-500" />
          Token 套餐
        </div>
        <Button
          variant="ghost"
          size="sm"
          className="text-xs text-slate-500"
          onClick={() => setShowHistory((v) => !v)}
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
      {!loading && !loadError && packages.length === 0 && (
        <div className="rounded-xl border border-dashed py-8 text-center text-sm text-slate-400">
          暂无在售套餐，敬请期待
        </div>
      )}

      {!loading && !loadError && packages.length > 0 && (
        <div className="grid grid-cols-2 gap-3">
          {packages.map((pkg) => {
            const discount =
              pkg.original_price && Number(pkg.original_price) > Number(pkg.price)
                ? Math.round((1 - Number(pkg.price) / Number(pkg.original_price)) * 100)
                : 0;
            return (
              <Card key={pkg.id} className={`hover:shadow-md transition-all ${pkg.is_popular ? 'border-blue-300' : ''}`}>
                <CardContent className="p-4">
                  <div className="flex items-center justify-between">
                    <span className="font-bold">{pkg.name}</span>
                    {pkg.is_popular && <Badge className="bg-blue-500 text-white">热门</Badge>}
                  </div>
                  <div className="flex items-baseline gap-1 mt-2">
                    <span className="text-2xl font-bold text-blue-600">{pkg.token_amount}</span>
                    <span className="text-xs text-slate-400">Tokens</span>
                  </div>
                  {pkg.bonus_token > 0 && (
                    <div className="flex items-center gap-1 mt-0.5 text-[11px] text-green-600">
                      <Gift className="h-3 w-3" />
                      赠送 {pkg.bonus_token} Tokens
                    </div>
                  )}
                  <div className="text-[11px] text-slate-400 mt-1 line-clamp-1">{pkg.description || ''}</div>
                  <div className="flex items-center justify-between mt-3">
                    <div>
                      <span className="text-sm font-bold text-slate-700">¥{Number(pkg.price).toFixed(2)}</span>
                      {pkg.original_price && Number(pkg.original_price) > Number(pkg.price) && (
                        <span className="text-[10px] text-gray-400 line-through ml-1">¥{Number(pkg.original_price).toFixed(2)}</span>
                      )}
                      {discount > 0 && <div className="text-[10px] text-red-500">省 {discount}%</div>}
                    </div>
                    <Button
                      size="sm"
                      className="bg-blue-500 hover:bg-blue-600"
                      disabled={paying}
                      onClick={() => handleBuy(pkg)}
                    >
                      购买
                    </Button>
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
          <div className="mb-2 text-sm font-medium text-slate-600">我的充值记录</div>
          {history.length === 0 && <p className="py-3 text-center text-sm text-slate-400">暂无充值记录</p>}
          {history.length > 0 && (
            <div className="space-y-1.5">
              {history.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-700">
                      {r.package?.name || 'Token套餐'} · {r.total_token} Tokens
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
                    <span className="text-sm font-bold text-blue-600">¥{Number(r.price).toFixed(2)}</span>
                    <p className="text-[11px] text-slate-400">{STATUS_LABEL[r.status] || r.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 扫码支付弹窗 */}
      <Dialog open={!!payPackage} onOpenChange={(v) => { if (!v) closePayDialog(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{paySuccess ? '充值成功' : '微信扫码支付'}</DialogTitle>
            <DialogDescription>
              {paySuccess
                ? 'Tokens 已到账'
                : `${payPackage?.name} · ${payPackage?.token_amount || 0} Tokens · ¥${Number(payPackage?.price || 0).toFixed(2)}`}
            </DialogDescription>
          </DialogHeader>
          {paySuccess ? (
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-500 mb-2" />
              <div className="text-sm font-medium text-slate-700">Tokens 已到账！</div>
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
                  <p className="mt-1 text-xs text-slate-400">支付成功后 Tokens 将自动到账</p>
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
