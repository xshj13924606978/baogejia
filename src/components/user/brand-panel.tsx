'use client';

// 品牌推广面板（阶段三 #202608292600-厂商付费推广）
// 功能：入驻申请 + 品牌状态/统计 + 付费套餐购买（微信扫码）+ 付费历史
// 数据源：
//   GET  /api/brand/status（品牌状态）
//   POST /api/brand/register（入驻）
//   PUT  /api/brand/update（更新）
//   GET  /api/brand/packages（套餐）
//   POST /api/brand/purchase（下单）
//   GET  /api/brand/orders/[orderNo]（轮询支付结果）

import { useCallback, useEffect, useRef, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { QRCodeSVG } from 'qrcode.react';
import { Loader2, Store, CheckCircle2, History, RefreshCw, CalendarClock, Eye, Target, PackageCheck, Pencil, X } from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { useToast } from '@/components/ui/use-toast';
import { formatDate } from '@/lib/date-utils';

interface BrandVendor {
  id: string;
  brand_name: string;
  brand_logo: string | null;
  brand_desc: string | null;
  category: string | null;
  contact_person: string | null;
  contact_phone: string | null;
  contact_email: string | null;
  website: string | null;
  address: string | null;
  status: 'pending' | 'approved' | 'rejected' | 'suspended';
  priority_level: number;
  priority_expire_at: string | null;
  is_verified: boolean;
  ranking_score: number;
  total_paid: number;
  view_count: number;
  match_count: number;
  order_count: number;
  rating: number;
  created_at: string;
}

interface BrandPackage {
  id: string;
  code: string;
  name: string;
  description: string | null;
  price: number;
  original_price: number | null;
  priority_level: number;
  duration_days: number;
  boost_score: number;
  match_boost: number;
  is_verified: boolean;
  is_popular: boolean;
}

interface BrandPayment {
  id: string;
  order_no: string;
  amount: number;
  status: 'pending' | 'completed' | 'cancelled' | 'refunded';
  start_date: string | null;
  end_date: string | null;
  created_at: string;
  package?: { id: string; name: string } | null;
}

const LEVEL_LABEL: Record<number, string> = { 0: '免费', 1: '白银', 2: '黄金', 3: '铂金' };
const LEVEL_STYLE: Record<number, string> = {
  0: 'bg-gray-100 text-gray-600',
  1: 'bg-slate-200 text-slate-700',
  2: 'bg-amber-100 text-amber-700',
  3: 'bg-gradient-to-r from-amber-400 to-yellow-500 text-white',
};
const STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  approved: '已通过',
  rejected: '已拒绝',
  suspended: '已暂停',
};
const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-orange-100 text-orange-700',
  approved: 'bg-green-100 text-green-700',
  rejected: 'bg-red-100 text-red-700',
  suspended: 'bg-gray-200 text-gray-600',
};
const PAY_STATUS_LABEL: Record<string, string> = {
  pending: '待支付',
  completed: '已完成',
  cancelled: '已取消',
  refunded: '已退款',
};

const POLL_INTERVAL_MS = 3000;
const POLL_MAX_ATTEMPTS = 30;

const EMPTY_FORM = {
  brand_name: '',
  brand_logo: '',
  brand_desc: '',
  category: '',
  contact_person: '',
  contact_phone: '',
  contact_email: '',
  website: '',
  address: '',
};

export default function BrandPanel() {
  const { toast } = useToast();
  const [brand, setBrand] = useState<BrandVendor | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [form, setForm] = useState(EMPTY_FORM);
  const [submitting, setSubmitting] = useState(false);
  const [editing, setEditing] = useState(false);

  const [packages, setPackages] = useState<BrandPackage[]>([]);
  const [history, setHistory] = useState<BrandPayment[]>([]);
  const [showHistory, setShowHistory] = useState(false);

  // 扫码支付状态
  const [payPkg, setPayPkg] = useState<BrandPackage | null>(null);
  const [codeUrl, setCodeUrl] = useState<string | null>(null);
  const [payOrderNo, setPayOrderNo] = useState<string | null>(null);
  const [paying, setPaying] = useState(false);
  const [payError, setPayError] = useState('');
  const [paySuccess, setPaySuccess] = useState(false);
  const pollTimerRef = useRef<ReturnType<typeof setInterval> | null>(null);

  const loadData = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      const [statusRes, pkgRes, historyRes] = await Promise.all([
        fetch('/api/brand/status', { headers: getClientAuthHeaders() }),
        fetch('/api/brand/packages', { headers: getClientAuthHeaders() }),
        fetch('/api/brand/history?limit=20', { headers: getClientAuthHeaders() }),
      ]);
      const statusData = await statusRes.json();
      const pkgData = await pkgRes.json();
      if (!statusData.success) throw new Error(statusData.error || '加载品牌状态失败');
      setBrand(statusData.brand || null);
      setPackages(pkgData.success ? pkgData.packages || [] : []);
      const historyData = await historyRes.json();
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

  /** 轮询品牌订单状态 */
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
        const res = await fetch(`/api/brand/orders/${orderNo}`, { headers: getClientAuthHeaders() });
        const data = await res.json();
        if (!data.success) return;
        const order = data.order;
        if (order.status === 'completed') {
          stopPolling();
          setPaySuccess(true);
          toast({ title: '开通成功', description: '推广权益已生效', duration: 2500 });
          setTimeout(() => {
            setPayPkg(null);
            setCodeUrl(null);
            setPaySuccess(false);
            setPayOrderNo(null);
            loadData();
          }, 1500);
        } else if (order.status === 'cancelled' || order.status === 'refunded') {
          stopPolling();
          setPayError(order.status === 'cancelled' ? '订单已取消' : '订单已退款');
          setCodeUrl(null);
        }
      } catch (e) {
        console.warn('[BrandPanel] 轮询支付状态失败:', e);
      }
    }, POLL_INTERVAL_MS);
  };

  /** 提交入驻申请 */
  const handleRegister = async () => {
    if (!form.brand_name.trim()) {
      toast({ title: '提示', description: '请填写品牌名称', variant: 'destructive' });
      return;
    }
    setSubmitting(true);
    try {
      const res = await fetch('/api/brand/register', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({
          brand_name: form.brand_name,
          brand_logo: form.brand_logo || undefined,
          brand_desc: form.brand_desc || undefined,
          category: form.category || undefined,
          contact_person: form.contact_person || undefined,
          contact_phone: form.contact_phone || undefined,
          contact_email: form.contact_email || undefined,
          website: form.website || undefined,
          address: form.address || undefined,
        }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '提交失败');
      toast({ title: '提交成功', description: '品牌入驻申请已提交，请等待管理员审核' });
      setForm(EMPTY_FORM);
      loadData();
    } catch (e: any) {
      toast({ title: '提交失败', description: e?.message || '请稍后重试', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  /** 更新品牌信息 */
  const handleUpdate = async () => {
    if (!brand) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/brand/update', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ brandId: brand.id, ...form }),
      });
      const data = await res.json();
      if (!data.success) throw new Error(data.error || '更新失败');
      toast({ title: '更新成功', description: '品牌信息已保存' });
      setEditing(false);
      loadData();
    } catch (e: any) {
      toast({ title: '更新失败', description: e?.message || '请稍后重试', variant: 'destructive' });
    } finally {
      setSubmitting(false);
    }
  };

  /** 购买推广套餐 */
  const handleBuy = async (pkg: BrandPackage) => {
    if (!brand) return;
    setPayPkg(pkg);
    setPaying(true);
    setPayError('');
    setCodeUrl(null);
    try {
      const res = await fetch('/api/brand/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ brandId: brand.id, packageId: pkg.id }),
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
    setPayPkg(null);
    setCodeUrl(null);
    setPayError('');
    setPaySuccess(false);
    setPayOrderNo(null);
    setPaying(false);
  };


  const formField = (key: keyof typeof EMPTY_FORM, label: string, placeholder: string, type: 'text' | 'textarea' | 'url' = 'text') => (
    <div>
      <label className="mb-1 block text-xs font-medium text-slate-600">{label}</label>
      {type === 'textarea' ? (
        <textarea
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          rows={2}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      ) : (
        <input
          type={type}
          value={form[key]}
          onChange={(e) => setForm((f) => ({ ...f, [key]: e.target.value }))}
          placeholder={placeholder}
          className="w-full rounded-lg border border-slate-200 px-3 py-2 text-sm focus:outline-none focus:ring-1 focus:ring-blue-400"
        />
      )}
    </div>
  );

  if (loading) {
    return (
      <div className="flex items-center justify-center gap-2 rounded-xl border border-dashed py-10 text-sm text-slate-400">
        <Loader2 className="h-4 w-4 animate-spin" /> 加载中...
      </div>
    );
  }

  if (loadError && !brand) {
    return (
      <div className="flex items-center justify-between gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">
        <span>{loadError}</span>
        <Button variant="outline" size="sm" onClick={loadData}>
          <RefreshCw className="mr-1.5 h-3.5 w-3.5" />重试
        </Button>
      </div>
    );
  }

  // 未入驻 → 入驻申请表单
  if (!brand) {
    return (
      <div className="space-y-4">
        <Card className="bg-gradient-to-r from-blue-500 to-indigo-600 border-blue-400 text-white">
          <CardContent className="p-4">
            <div className="flex items-center gap-2">
              <Store className="h-5 w-5" />
              <div>
                <div className="font-bold">品牌入驻</div>
                <div className="text-xs text-white/80 mt-0.5">入驻后即可获得品牌曝光与询价匹配机会</div>
              </div>
            </div>
          </CardContent>
        </Card>
        <div className="rounded-xl border border-slate-100 p-4 space-y-3">
          <div className="text-sm font-medium text-slate-700">品牌资料</div>
          {formField('brand_name', '品牌名称 *', '请输入品牌名称')}
          {formField('category', '行业分类', '如：五金工具、工业设备')}
          {formField('brand_logo', '品牌 Logo URL', 'https://...（可选）', 'url')}
          {formField('brand_desc', '品牌简介', '一句话介绍品牌（可选）', 'textarea')}
          <div className="grid grid-cols-2 gap-3">
            {formField('contact_person', '联系人', '联系人姓名')}
            {formField('contact_phone', '联系电话', '手机号')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {formField('contact_email', '联系邮箱', '邮箱（可选）')}
            {formField('website', '官网', 'https://...（可选）', 'url')}
          </div>
          {formField('address', '公司地址', '公司地址（可选）')}
          <Button className="w-full bg-blue-500 hover:bg-blue-600" disabled={submitting} onClick={handleRegister}>
            {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            提交入驻申请
          </Button>
          <p className="text-[11px] text-slate-400 text-center">提交后需管理员审核，审核通过后方可购买推广套餐</p>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-4">
      {/* 品牌状态卡 */}
      <Card className={`bg-gradient-to-r ${brand.status === 'approved' ? 'from-blue-500 to-indigo-600' : 'from-slate-500 to-slate-600'} border-transparent text-white`}>
        <CardContent className="p-4">
          <div className="flex items-start justify-between">
            <div className="min-w-0">
              <div className="flex items-center gap-2">
                <Store className="h-5 w-5 shrink-0" />
                <span className="truncate text-lg font-bold">{brand.brand_name}</span>
                {brand.is_verified && (
                  <span className="shrink-0 rounded-full bg-yellow-300 px-1.5 py-0.5 text-[10px] font-bold text-yellow-900">认证</span>
                )}
              </div>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5 text-xs">
                <span className={`rounded-full px-2 py-0.5 font-medium ${STATUS_STYLE[brand.status] || 'bg-white/20 text-white'}`}>
                  {STATUS_LABEL[brand.status] || brand.status}
                </span>
                <span className={`rounded-full px-2 py-0.5 font-medium ${LEVEL_STYLE[brand.priority_level] || 'bg-white/20 text-white'}`}>
                  {LEVEL_LABEL[brand.priority_level] || '免费'}推广
                </span>
                {brand.priority_expire_at && (
                  <span className="flex items-center gap-0.5 text-white/80">
                    <CalendarClock className="h-3 w-3" /> 至 {formatDate(brand.priority_expire_at)}
                  </span>
                )}
              </div>
            </div>
            <Button
              variant="ghost"
              size="icon"
              className="shrink-0 text-white hover:bg-white/20"
              onClick={() => {
                setForm({
                  brand_name: brand.brand_name,
                  brand_logo: brand.brand_logo || '',
                  brand_desc: brand.brand_desc || '',
                  category: brand.category || '',
                  contact_person: brand.contact_person || '',
                  contact_phone: brand.contact_phone || '',
                  contact_email: brand.contact_email || '',
                  website: brand.website || '',
                  address: brand.address || '',
                });
                setEditing((v) => !v);
              }}
            >
              {editing ? <X className="h-4 w-4" /> : <Pencil className="h-4 w-4" />}
            </Button>
          </div>

          {/* 统计 */}
          <div className="mt-3 grid grid-cols-4 gap-2">
            {[
              { icon: <Eye className="h-3.5 w-3.5" />, value: brand.view_count, label: '曝光' },
              { icon: <Target className="h-3.5 w-3.5" />, value: brand.match_count, label: '匹配' },
              { icon: <PackageCheck className="h-3.5 w-3.5" />, value: brand.order_count, label: '成单' },
              { icon: <Store className="h-3.5 w-3.5" />, value: brand.rating.toFixed(1), label: '评分' },
            ].map((s, i) => (
              <div key={i} className="rounded-lg bg-white/10 px-2 py-1.5 text-center">
                <div className="flex items-center justify-center gap-1 text-sm font-bold">{s.icon}{s.value}</div>
                <div className="text-[10px] text-white/70">{s.label}</div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 审核状态提示 */}
      {brand.status === 'pending' && (
        <Alert>
          <AlertDescription className="text-sm text-orange-600">
            入驻申请审核中，审核通过后可购买推广套餐
          </AlertDescription>
        </Alert>
      )}
      {brand.status === 'rejected' && (
        <Alert variant="destructive">
          <AlertDescription className="text-sm">入驻申请未通过，可修改资料后重新提交（联系管理员）</AlertDescription>
        </Alert>
      )}
      {brand.status === 'suspended' && (
        <Alert variant="destructive">
          <AlertDescription className="text-sm">品牌已被暂停，如有疑问请联系管理员</AlertDescription>
        </Alert>
      )}

      {/* 编辑表单 */}
      {editing && (
        <div className="rounded-xl border border-slate-100 p-4 space-y-3">
          <div className="text-sm font-medium text-slate-700">编辑品牌资料</div>
          {formField('brand_name', '品牌名称 *', '请输入品牌名称')}
          {formField('category', '行业分类', '如：五金工具、工业设备')}
          {formField('brand_logo', '品牌 Logo URL', 'https://...（可选）', 'url')}
          {formField('brand_desc', '品牌简介', '一句话介绍品牌（可选）', 'textarea')}
          <div className="grid grid-cols-2 gap-3">
            {formField('contact_person', '联系人', '联系人姓名')}
            {formField('contact_phone', '联系电话', '手机号')}
          </div>
          <div className="grid grid-cols-2 gap-3">
            {formField('contact_email', '联系邮箱', '邮箱（可选）')}
            {formField('website', '官网', 'https://...（可选）', 'url')}
          </div>
          {formField('address', '公司地址', '公司地址（可选）')}
          <Button className="w-full bg-blue-500 hover:bg-blue-600" disabled={submitting} onClick={handleUpdate}>
            {submitting ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : null}
            保存修改
          </Button>
        </div>
      )}

      {/* 付费历史 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-1.5 text-sm font-medium text-slate-700">
          <Store className="h-4 w-4 text-blue-500" />
          推广服务
        </div>
        <Button variant="ghost" size="sm" className="text-xs text-slate-500" onClick={() => setShowHistory((v) => !v)}>
          <History className="mr-1 h-3.5 w-3.5" />
          {showHistory ? '收起记录' : `付费记录${history.length ? `(${history.length})` : ''}`}
        </Button>
      </div>

      {/* 套餐列表（仅审核通过） */}
      {brand.status === 'approved' ? (
        packages.length === 0 ? (
          <div className="rounded-xl border border-dashed py-6 text-center text-sm text-slate-400">暂无在售推广套餐</div>
        ) : (
          <div className="space-y-3">
            {packages.map((pkg) => {
              const discount =
                pkg.original_price && Number(pkg.original_price) > Number(pkg.price)
                  ? Math.round((1 - Number(pkg.price) / Number(pkg.original_price)) * 100)
                  : 0;
              return (
                <Card key={pkg.id} className={`hover:shadow-md transition-all ${pkg.is_popular ? 'border-blue-300' : ''}`}>
                  <CardContent className="p-4">
                    <div className="flex items-start justify-between">
                      <div>
                        <div className="flex items-center gap-2">
                          <span className="font-bold text-base">{pkg.name}</span>
                          {pkg.is_popular && <Badge className="bg-blue-500 text-white">热门</Badge>}
                          <span className={`rounded-full px-2 py-0.5 text-[11px] font-medium ${LEVEL_STYLE[pkg.priority_level] || 'bg-gray-100 text-gray-600'}`}>
                            {LEVEL_LABEL[pkg.priority_level] || `等级${pkg.priority_level}`}
                          </span>
                        </div>
                        <div className="text-xs text-gray-500 mt-1 line-clamp-2">{pkg.description || '提升品牌曝光与优先匹配'}</div>
                        <div className="flex items-center gap-2 text-[11px] text-gray-400 mt-1">
                          <CalendarClock className="h-3 w-3" /> {pkg.duration_days} 天
                          <span>·</span>
                          <span>评分 +{pkg.boost_score}</span>
                          {pkg.is_verified && (
                            <>
                              <span>·</span>
                              <span className="text-yellow-600">含认证标识</span>
                            </>
                          )}
                        </div>
                      </div>
                      <div className="text-right shrink-0">
                        <div className="flex items-baseline gap-1">
                          <span className="text-lg font-bold text-blue-600">¥{Number(pkg.price).toFixed(2)}</span>
                          {pkg.original_price && Number(pkg.original_price) > Number(pkg.price) && (
                            <span className="text-xs text-gray-400 line-through">¥{Number(pkg.original_price).toFixed(2)}</span>
                          )}
                        </div>
                        {discount > 0 && <div className="text-[11px] text-red-500">立省 {discount}%</div>}
                        <Button size="sm" className="mt-2 bg-blue-500 hover:bg-blue-600" onClick={() => handleBuy(pkg)}>
                          立即购买
                        </Button>
                      </div>
                    </div>
                  </CardContent>
                </Card>
              );
            })}
          </div>
        )
      ) : (
        <div className="rounded-xl border border-dashed py-6 text-center text-sm text-slate-400">
          审核通过后即可购买推广套餐
        </div>
      )}

      {/* 付费记录 */}
      {showHistory && (
        <div className="rounded-xl border border-slate-100 p-3">
          <div className="mb-2 text-sm font-medium text-slate-600">我的付费记录</div>
          {history.length === 0 && <p className="py-3 text-center text-sm text-slate-400">暂无付费记录</p>}
          {history.length > 0 && (
            <div className="space-y-1.5">
              {history.map((r) => (
                <div key={r.id} className="flex items-center justify-between rounded-lg bg-slate-50 px-2.5 py-2">
                  <div className="min-w-0">
                    <p className="truncate text-xs font-medium text-slate-700">{r.package?.name || '推广套餐'}</p>
                    <p className="text-[11px] text-slate-400">
                      {new Date(r.created_at).toLocaleString('zh-CN', { month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                    </p>
                  </div>
                  <div className="ml-2 shrink-0 text-right">
                    <span className="text-sm font-bold text-blue-600">¥{Number(r.amount).toFixed(2)}</span>
                    <p className="text-[11px] text-slate-400">{PAY_STATUS_LABEL[r.status] || r.status}</p>
                  </div>
                </div>
              ))}
            </div>
          )}
        </div>
      )}

      {/* 扫码支付弹窗 */}
      <Dialog open={!!payPkg} onOpenChange={(v) => { if (!v) closePayDialog(); }}>
        <DialogContent className="sm:max-w-sm">
          <DialogHeader>
            <DialogTitle>{paySuccess ? '开通成功' : '微信扫码支付'}</DialogTitle>
            <DialogDescription>
              {paySuccess ? '推广权益已生效' : `${payPkg?.name} · ¥${Number(payPkg?.price || 0).toFixed(2)}`}
            </DialogDescription>
          </DialogHeader>
          {paySuccess ? (
            <div className="flex flex-col items-center py-6 text-center">
              <CheckCircle2 className="h-14 w-14 text-green-500 mb-2" />
              <div className="text-sm font-medium text-slate-700">推广权益开通成功！</div>
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
                  <p className="mt-1 text-xs text-slate-400">支付成功后推广权益将自动生效</p>
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
