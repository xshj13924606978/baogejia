'use client';

// 积分商城（数据库驱动，替换旧静态兑换目录）
// 数据源：/api/mall/products（mall_products 表）
// 积分兑换：/api/mall/exchange { mode: 'points' }
// 现金购买：/api/mall/exchange { mode: 'cash' } → 返回微信 Native code_url → 轮询状态

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, QrCode, CheckCircle2, RotateCcw, ShoppingBag, Inbox } from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { useToast } from '@/components/ui/use-toast';

interface MallProduct {
  id: string;
  name: string;
  description: string | null;
  category: 'vip' | 'rank' | 'gift' | 'template' | 'physical' | 'custom';
  points_price: number;
  cash_price: number;
  stock: number;
  image_url: string | null;
  is_active: boolean;
  is_virtual: boolean;
  sort_order: number;
  metadata: Record<string, any> | null;
}

interface ExchangeRecord {
  id: string;
  exchange_no: string;
  product_name: string;
  category: string;
  points_used: number;
  cash_paid: number;
  quantity: number;
  pay_method: 'points' | 'cash';
  status: 'pending' | 'completed' | 'shipped' | 'cancelled' | 'refunded';
  delivery_info: Record<string, any> | null;
  created_at: string;
}

interface PointsMallProps {
  user: any;
}

const CATEGORY_LABEL: Record<string, string> = {
  vip: '会员',
  rank: '推广',
  gift: '礼品',
  template: '模板',
  physical: '实物',
  custom: '定制',
};

const CATEGORY_STYLE: Record<string, string> = {
  vip: 'bg-purple-100 text-purple-700',
  rank: 'bg-green-100 text-green-700',
  gift: 'bg-red-100 text-red-700',
  template: 'bg-blue-100 text-blue-700',
  physical: 'bg-orange-100 text-orange-700',
  custom: 'bg-gray-100 text-gray-700',
};

const STATUS_LABEL: Record<string, string> = {
  pending: '待处理',
  completed: '已完成',
  shipped: '已发货',
  cancelled: '已取消',
  refunded: '已退款',
};

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 30;

export default function PointsMall({ user }: PointsMallProps) {
  const { toast } = useToast();
  const [products, setProducts] = useState<MallProduct[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [exchangingId, setExchangingId] = useState<string | null>(null);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 现金购买扫码状态
  const [payProduct, setPayProduct] = useState<MallProduct | null>(null);
  const [codeUrl, setCodeUrl] = useState<string | null>(null);
  const [payExchangeId, setPayExchangeId] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccess, setPaySuccess] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  // 兑换记录
  const [records, setRecords] = useState<ExchangeRecord[]>([]);
  const [recordsLoading, setRecordsLoading] = useState(false);
  const [showRecords, setShowRecords] = useState(false);

  const loadProducts = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const res = await fetch('/api/mall/products', { headers: getClientAuthHeaders() });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '获取商品失败');
      setProducts(data.products || []);
    } catch (e: any) {
      setLoadError(e?.message || '加载商品失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  const loadRecords = useCallback(async () => {
    setRecordsLoading(true);
    try {
      const res = await fetch('/api/mall/exchanges', { headers: getClientAuthHeaders() });
      const data = await res.json();
      if (data.success) setRecords(data.records || []);
    } catch (e) {
      console.error('[PointsMall] 加载兑换记录失败:', e);
    } finally {
      setRecordsLoading(false);
    }
  }, []);

  useEffect(() => {
    loadProducts();
    return () => stopPolling();
  }, [loadProducts]);

  const stopPolling = () => {
    if (pollTimerRef.current) {
      clearInterval(pollTimerRef.current);
      pollTimerRef.current = null;
    }
  };

  /** 轮询商城订单状态（现金购买） */
  const startPolling = (exchangeId: string) => {
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
        const res = await fetch('/api/mall/exchanges', { headers: getClientAuthHeaders() });
        const data = await res.json();
        if (!data.success) return;
        const target = (data.records || []).find((r: ExchangeRecord) => r.id === exchangeId);
        if (!target) return;
        if (target.status === 'completed' || target.status === 'shipped') {
          stopPolling();
          setPaySuccess(true);
          try {
            window.dispatchEvent(new CustomEvent('points-updated'));
          } catch (e) {
            console.error(e);
          }
          toast({ title: '购买成功', description: '商品已发放，请查看兑换记录', duration: 2500 });
          setTimeout(() => {
            setPayProduct(null);
            setCodeUrl(null);
            setPaySuccess(false);
            setPayExchangeId(null);
            loadProducts();
            loadRecords();
          }, 1500);
        } else if (target.status === 'cancelled' || target.status === 'refunded') {
          stopPolling();
          setPayError('订单已取消或退款');
          setCodeUrl(null);
        }
      } catch (e) {
        console.warn('[PointsMall] 轮询支付状态失败:', e);
      }
    }, POLL_INTERVAL_MS);
  };

  /** 积分兑换 */
  const handleExchangeByPoints = async (product: MallProduct) => {
    const price = product.points_price || 0;
    if (user.points < price) {
      setMessage({ type: 'error', text: `积分不足，还差 ${price - user.points} 积分` });
      return;
    }
    setExchangingId(product.id);
    setMessage(null);
    try {
      const res = await fetch('/api/mall/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ productId: product.id, quantity: 1, mode: 'points' }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: `兑换成功！消耗 ${price} 积分` });
        try {
          window.dispatchEvent(new CustomEvent('points-updated'));
        } catch (e) {
          console.error(e);
        }
        setTimeout(() => {
          setMessage(null);
          loadProducts();
          loadRecords();
        }, 1800);
      } else {
        setMessage({ type: 'error', text: data.error || '兑换失败' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '网络错误，请重试' });
    } finally {
      setExchangingId(null);
    }
  };

  /** 现金购买（微信扫码） */
  const handlePayByMoney = async (product: MallProduct) => {
    setPayProduct(product);
    setPaying(true);
    setPayError('');
    setCodeUrl(null);
    try {
      const res = await fetch('/api/mall/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ productId: product.id, quantity: 1, mode: 'cash' }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '下单失败');
      if (!data.codeUrl) throw new Error('支付二维码获取失败');
      setCodeUrl(data.codeUrl);
      setPayExchangeId(data.exchange?.id || null);
      setPaying(false);
      if (data.exchange?.id) startPolling(data.exchange.id);
    } catch (e: any) {
      setPayError(e?.message || '下单失败，请重试');
      setPaying(false);
    }
  };

  const closePayDialog = () => {
    stopPolling();
    setPayProduct(null);
    setCodeUrl(null);
    setPayError('');
    setPaySuccess(false);
    setPayExchangeId(null);
    setPaying(false);
  };

  const toggleRecords = () => {
    const next = !showRecords;
    setShowRecords(next);
    if (next) loadRecords();
  };

  return (
    <div className="space-y-4">
      {/* 当前积分 */}
      <Card className="bg-gradient-to-r from-yellow-50 to-orange-50 border-yellow-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-yellow-600">可用积分</div>
              <div className="text-3xl font-bold text-yellow-700">{user.points || 0}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-orange-600">总积分</div>
              <div className="text-lg font-bold text-orange-700">{user.total_points || 0}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 消息提示 */}
      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {/* 商品列表 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <ShoppingBag className="h-4 w-4 text-orange-500" />
          积分好物
        </div>
        <Button variant="ghost" size="sm" className="text-xs text-slate-500" onClick={toggleRecords}>
          <Inbox className="mr-1 h-3.5 w-3.5" />
          {showRecords ? '收起记录' : `兑换记录${records.length ? `(${records.length})` : ''}`}
        </Button>
      </div>

      {loading && (
        <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-8 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />
          商品加载中...
        </div>
      )}
      {!loading && loadError && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</div>
          <Button variant="outline" size="sm" onClick={loadProducts}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />重新加载
          </Button>
        </div>
      )}
      {!loading && !loadError && products.length === 0 && (
        <div className="rounded-xl border border-dashed py-8 text-center text-sm text-slate-400">
          暂无在售商品，敬请期待
        </div>
      )}

      {!loading && !loadError && products.length > 0 && (
        <ScrollArea className="h-[430px]">
          <div className="space-y-3 pr-2">
            {products.map((product) => {
              const pointsPrice = product.points_price || 0;
              const cashPrice = Number(product.cash_price || 0);
              const canAfford = user.points >= pointsPrice;
              const soldOut = product.stock === 0;

              return (
                <Card key={product.id} className="hover:shadow-md transition-all">
                  <CardContent className="p-4">
                    <div className="flex items-start gap-4">
                      {product.image_url ? (
                        <img
                          src={product.image_url}
                          alt={product.name}
                          className="h-14 w-14 rounded-lg object-cover"
                        />
                      ) : (
                        <div className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-gradient-to-br from-orange-100 to-yellow-100 text-2xl">
                          🎁
                        </div>
                      )}
                      <div className="flex-1">
                        <div className="flex items-start justify-between">
                          <div>
                            <div className="font-bold text-base">{product.name}</div>
                            <div className="text-xs text-gray-500 mt-1 line-clamp-2">
                              {product.description || '暂无描述'}
                            </div>
                          </div>
                          <Badge className={`${CATEGORY_STYLE[product.category] || CATEGORY_STYLE.custom} shrink-0`}>
                            {CATEGORY_LABEL[product.category] || product.category}
                            {!product.is_virtual && '·实物'}
                          </Badge>
                        </div>

                        <div className="flex items-center justify-between mt-3">
                          <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1">
                            {pointsPrice > 0 && (
                              <span className={`text-lg font-bold ${canAfford ? 'text-orange-600' : 'text-gray-400'}`}>
                                {pointsPrice}积分
                              </span>
                            )}
                            {cashPrice > 0 && (
                              <span className="text-sm font-semibold text-gray-600">¥{cashPrice}</span>
                            )}
                            {soldOut && <span className="text-xs text-red-500">已售罄</span>}
                          </div>

                          <div className="flex gap-2">
                            {pointsPrice > 0 && (
                              <Button
                                onClick={() => handleExchangeByPoints(product)}
                                disabled={exchangingId === product.id || !canAfford || soldOut}
                                size="sm"
                                variant="outline"
                                className="border-orange-500 text-orange-600 hover:bg-orange-50"
                              >
                                {exchangingId === product.id ? '兑换中...' : canAfford ? '积分兑换' : '积分不足'}
                              </Button>
                            )}
                            {cashPrice > 0 && (
                              <Button
                                onClick={() => handlePayByMoney(product)}
                                disabled={paying || soldOut}
                                size="sm"
                                className="bg-orange-500 hover:bg-orange-600"
                              >
                                立即购买
                              </Button>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        </ScrollArea>
      )}

      {/* 兑换记录折叠面板 */}
      {showRecords && (
        <div className="rounded-xl border border-slate-100 p-3">
          <div className="mb-2 text-sm font-medium text-slate-600">我的兑换记录</div>
          {recordsLoading && (
            <div className="flex items-center justify-center gap-2 py-3 text-sm text-slate-400">
              <Loader2 className="h-4 w-4 animate-spin" />加载中...
            </div>
          )}
          {!recordsLoading && records.length === 0 && (
            <p className="py-3 text-center text-sm text-slate-400">暂无兑换记录</p>
          )}
          {!recordsLoading && records.length > 0 && (
            <div className="space-y-1.5">
              {records.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-700">{r.product_name}</p>
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
                    <span className="text-sm font-bold text-orange-600">
                      {r.pay_method === 'points' ? `-${r.points_used}积分` : `¥${r.cash_paid}`}
                    </span>
                    <p className="text-[11px] text-slate-400">{STATUS_LABEL[r.status] || r.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 现金购买扫码弹窗 */}
      <Dialog open={!!payProduct} onOpenChange={(v) => { if (!v) closePayDialog(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>微信扫码支付</DialogTitle>
            <DialogDescription>
              {payProduct?.name} · ¥{payProduct?.cash_price}
            </DialogDescription>
          </DialogHeader>
          <div className="flex flex-col items-center gap-3 py-2">
            {paySuccess ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <CheckCircle2 className="h-14 w-14 text-green-500" />
                <p className="text-lg font-bold text-green-600">购买成功！</p>
                <p className="text-sm text-slate-500">权益已发放，正在关闭窗口...</p>
              </div>
            ) : paying ? (
              <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" />正在创建订单...
              </div>
            ) : codeUrl ? (
              <>
                <div className="rounded-2xl border-2 border-slate-200 bg-white p-3">
                  <QRCodeSVG value={codeUrl} size={200} marginSize={1} />
                </div>
                <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
                  <QrCode className="h-4 w-4 text-blue-500" />
                  请使用微信「扫一扫」扫描二维码支付
                </div>
                <p className="text-xs text-slate-400">
                  支付成功后商品将自动发放，请留意兑换记录
                </p>
              </>
            ) : payError ? (
              <div className="flex flex-col items-center gap-2 py-4">
                <p className="text-sm text-red-600">{payError}</p>
                <Button variant="outline" size="sm" onClick={() => payProduct && handlePayByMoney(payProduct)}>
                  <RotateCcw className="mr-1.5 h-3.5 w-3.5" />重新下单
                </Button>
              </div>
            ) : null}
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
}
