'use client';

// 积分提现面板（用户端）
// - 提现账户绑定（微信/支付宝/银行卡）
// - 申请提现（配置从 site_config 读取）
// - 提现记录列表

import { useCallback, useEffect, useState } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Loader2, RotateCcw, Banknote, Wallet, History } from 'lucide-react';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { useToast } from '@/components/ui/use-toast';

interface WithdrawConfig {
  enabled: boolean;
  minPoints: number;
  minAmount: number;
  rate: number;
  feeRate: number;
}

interface WithdrawAccount {
  id?: string;
  wechat_openid?: string | null;
  alipay_account?: string | null;
  bank_name?: string | null;
  bank_card?: string | null;
  bank_holder?: string | null;
}

interface WithdrawRecord {
  id: string;
  points: number;
  amount: number;
  status: 'pending' | 'approved' | 'rejected' | 'paid' | 'failed';
  account_type: 'wechat' | 'alipay' | 'bank';
  remark: string | null;
  reject_reason: string | null;
  created_at: string;
  paid_at: string | null;
}

const STATUS_LABEL: Record<string, string> = {
  pending: '待审核',
  approved: '审核通过',
  rejected: '已拒绝',
  paid: '已打款',
  failed: '打款失败',
};

const STATUS_STYLE: Record<string, string> = {
  pending: 'bg-amber-100 text-amber-700',
  approved: 'bg-blue-100 text-blue-700',
  rejected: 'bg-red-100 text-red-700',
  paid: 'bg-green-100 text-green-700',
  failed: 'bg-red-100 text-red-700',
};

const ACCOUNT_TYPE_LABEL: Record<string, string> = {
  wechat: '微信',
  alipay: '支付宝',
  bank: '银行卡',
};

interface WithdrawPanelProps {
  user: any;
}

export default function WithdrawPanel({ user }: WithdrawPanelProps) {
  const { toast } = useToast();
  const [config, setConfig] = useState<WithdrawConfig | null>(null);
  const [account, setAccount] = useState<WithdrawAccount | null>(null);
  const [records, setRecords] = useState<WithdrawRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');

  // 申请表单
  const [pointsInput, setPointsInput] = useState('');
  const [accountType, setAccountType] = useState<'wechat' | 'alipay' | 'bank'>('wechat');
  const [wechatOpenid, setWechatOpenid] = useState('');
  const [alipayAccount, setAlipayAccount] = useState('');
  const [bankName, setBankName] = useState('');
  const [bankCard, setBankCard] = useState('');
  const [bankHolder, setBankHolder] = useState('');
  const [remark, setRemark] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  // 计算可提现金额预览
  const previewAmount = config ? (Number(pointsInput || 0) / config.rate).toFixed(2) : '0.00';
  const previewFee = config ? (Number(pointsInput || 0) / config.rate * config.feeRate).toFixed(2) : '0.00';
  const previewActual = config
    ? (Number(pointsInput || 0) / config.rate * (1 - config.feeRate)).toFixed(2)
    : '0.00';

  const loadAll = useCallback(async () => {
    setLoading(true);
    setLoadError('');
    try {
      // 提现配置
      const configData = await fetch('/api/user/withdraw/config', { headers: getClientAuthHeaders() }).then((r) => r.json()).catch(() => null);
      if (configData?.success) {
        setConfig(configData.config);
      } else {
        setConfig({ enabled: true, minPoints: 100, minAmount: 1, rate: 100, feeRate: 0 });
      }
      // 提现账户
      const cfgRes = await fetch('/api/user/withdraw/accounts', { headers: getClientAuthHeaders() }).then((r) => r.json()).catch(() => ({ success: false }));
      setAccount(cfgRes.success ? cfgRes.account : null);
      // 预填绑定账户
      if (cfgRes.success && cfgRes.account) {
        setWechatOpenid(cfgRes.account.wechat_openid || '');
        setAlipayAccount(cfgRes.account.alipay_account || '');
        setBankName(cfgRes.account.bank_name || '');
        setBankCard(cfgRes.account.bank_card || '');
        setBankHolder(cfgRes.account.bank_holder || '');
      }
      // 记录
      const recRes = await fetch('/api/user/withdraw/records', { headers: getClientAuthHeaders() }).then((r) => r.json());
      if (recRes.success) setRecords(recRes.records || []);
    } catch (e) {
      setLoadError('加载失败，请稍后重试');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    loadAll();
  }, [loadAll]);

  /** 保存提现账户 */
  const handleSaveAccount = async () => {
    if (!wechatOpenid && !alipayAccount && !bankCard) {
      setMessage({ type: 'error', text: '请至少填写一种提现方式' });
      return;
    }
    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/user/withdraw/accounts', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({
          wechat_openid: wechatOpenid || null,
          alipay_account: alipayAccount || null,
          bank_name: bankName || null,
          bank_card: bankCard || null,
          bank_holder: bankHolder || null,
        }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: '提现账户已保存' });
        toast({ title: '保存成功', description: '提现账户已更新', duration: 2000 });
      } else {
        setMessage({ type: 'error', text: data.error || '保存失败' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '网络错误，请重试' });
    } finally {
      setSubmitting(false);
    }
  };

  /** 提交提现申请 */
  const handleApply = async () => {
    const points = Number(pointsInput);
    if (!Number.isInteger(points) || points <= 0) {
      setMessage({ type: 'error', text: '请输入有效的提现积分' });
      return;
    }
    if (config && points < config.minPoints) {
      setMessage({ type: 'error', text: `最低提现积分为 ${config.minPoints}` });
      return;
    }
    if (user.points < points) {
      setMessage({ type: 'error', text: '积分余额不足' });
      return;
    }

    // 账户信息
    let accountInfo: Record<string, string> = {};
    if (accountType === 'wechat') {
      if (!wechatOpenid) { setMessage({ type: 'error', text: '请填写微信收款 openid' }); return; }
      accountInfo = { wechat_openid: wechatOpenid };
    } else if (accountType === 'alipay') {
      if (!alipayAccount) { setMessage({ type: 'error', text: '请填写支付宝账号' }); return; }
      accountInfo = { alipay_account: alipayAccount };
    } else {
      if (!bankCard || !bankHolder) { setMessage({ type: 'error', text: '请填写银行卡号与持卡人姓名' }); return; }
      accountInfo = { bank_name: bankName, bank_card: bankCard, bank_holder: bankHolder };
    }

    setSubmitting(true);
    setMessage(null);
    try {
      const res = await fetch('/api/user/withdraw/apply', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ points, account_type: accountType, account_info: accountInfo, remark: remark || null }),
      });
      const data = await res.json();
      if (data.success) {
        setMessage({ type: 'success', text: data.message || '提现申请已提交' });
        setPointsInput('');
        try {
          window.dispatchEvent(new CustomEvent('points-updated'));
        } catch (e) { console.error(e); }
        loadAll();
      } else {
        setMessage({ type: 'error', text: data.error || '申请失败' });
      }
    } catch (e) {
      setMessage({ type: 'error', text: '网络错误，请重试' });
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-4">
      {/* 当前积分 + 开关提示 */}
      <Card className="bg-gradient-to-r from-violet-50 to-purple-50 border-violet-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-sm text-violet-600">可用积分</div>
              <div className="text-3xl font-bold text-violet-700">{user.points || 0}</div>
            </div>
            <div className="text-right">
              <div className="text-sm text-purple-600">提现功能</div>
              <Badge className={config?.enabled ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'}>
                {config?.enabled ? '开放中' : '暂未开放'}
              </Badge>
              {config && config.enabled && (
                <p className="mt-1 text-[11px] text-slate-400">
                  比例 {config.rate}:1 · 最低 {config.minPoints} 积分
                  {config.feeRate > 0 ? ` · 手续费 ${(config.feeRate * 100).toFixed(0)}%` : ''}
                </p>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {message && (
        <Alert variant={message.type === 'error' ? 'destructive' : 'default'}>
          <AlertDescription>{message.text}</AlertDescription>
        </Alert>
      )}

      {loading && (
        <div className="flex items-center justify-center gap-2 py-8 text-sm text-slate-400">
          <Loader2 className="h-4 w-4 animate-spin" />加载中...
        </div>
      )}

      {!loading && loadError && (
        <div className="space-y-2">
          <div className="flex items-center gap-2 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{loadError}</div>
          <Button variant="outline" size="sm" onClick={loadAll}>
            <RotateCcw className="mr-1.5 h-3.5 w-3.5" />重新加载
          </Button>
        </div>
      )}

      {!loading && !loadError && (
        <Tabs defaultValue="apply" className="w-full">
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="apply" className="flex items-center gap-1">
              <Banknote className="h-3.5 w-3.5" />申请提现
            </TabsTrigger>
            <TabsTrigger value="account" className="flex items-center gap-1">
              <Wallet className="h-3.5 w-3.5" />提现账户
            </TabsTrigger>
            <TabsTrigger value="records" className="flex items-center gap-1">
              <History className="h-3.5 w-3.5" />提现记录
            </TabsTrigger>
          </TabsList>

          {/* 申请提现 */}
          <TabsContent value="apply" className="space-y-3 pt-3">
            {!config?.enabled ? (
              <Alert variant="destructive">
                <AlertDescription>提现功能暂未开放，敬请期待</AlertDescription>
              </Alert>
            ) : (
              <>
                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">提现积分</label>
                  <input
                    type="number"
                    min={config.minPoints}
                    value={pointsInput}
                    onChange={(e) => setPointsInput(e.target.value)}
                    placeholder={`最低 ${config.minPoints} 积分`}
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <div className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/40">
                  <div className="flex justify-between"><span>可提现（积分 / 比例）</span><span>{pointsInput || 0} / {config.rate}</span></div>
                  <div className="flex justify-between"><span>提现金额</span><span className="font-semibold text-violet-600">¥{previewAmount}</span></div>
                  {config.feeRate > 0 && (
                    <div className="flex justify-between"><span>手续费（{(config.feeRate * 100).toFixed(0)}%）</span><span>¥{previewFee}</span></div>
                  )}
                  <div className="flex justify-between"><span>实际到账</span><span className="font-semibold text-green-600">¥{previewActual}</span></div>
                </div>

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">提现方式</label>
                  <div className="flex gap-2">
                    {(['wechat', 'alipay', 'bank'] as const).map((t) => (
                      <button
                        key={t}
                        type="button"
                        onClick={() => setAccountType(t)}
                        className={`flex-1 rounded-lg border px-2 py-1.5 text-xs transition-all ${
                          accountType === t
                            ? 'border-violet-500 bg-violet-50 text-violet-700'
                            : 'border-slate-200 text-slate-500 hover:border-slate-300'
                        }`}
                      >
                        {ACCOUNT_TYPE_LABEL[t]}
                      </button>
                    ))}
                  </div>
                </div>

                {accountType === 'wechat' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">微信收款 openid</label>
                    <input
                      value={wechatOpenid}
                      onChange={(e) => setWechatOpenid(e.target.value)}
                      placeholder="微信支付收款 openid（需已绑定账户）"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                )}
                {accountType === 'alipay' && (
                  <div>
                    <label className="mb-1 block text-xs font-medium text-slate-600">支付宝账号</label>
                    <input
                      value={alipayAccount}
                      onChange={(e) => setAlipayAccount(e.target.value)}
                      placeholder="支付宝账号（手机号/邮箱）"
                      className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                    />
                  </div>
                )}
                {accountType === 'bank' && (
                  <div className="space-y-2">
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">银行名称</label>
                      <input
                        value={bankName}
                        onChange={(e) => setBankName(e.target.value)}
                        placeholder="如：工商银行"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">银行卡号</label>
                      <input
                        value={bankCard}
                        onChange={(e) => setBankCard(e.target.value)}
                        placeholder="银行卡号"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                    <div>
                      <label className="mb-1 block text-xs font-medium text-slate-600">持卡人姓名</label>
                      <input
                        value={bankHolder}
                        onChange={(e) => setBankHolder(e.target.value)}
                        placeholder="持卡人姓名"
                        className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                      />
                    </div>
                  </div>
                )}

                <div>
                  <label className="mb-1 block text-xs font-medium text-slate-600">备注</label>
                  <input
                    value={remark}
                    onChange={(e) => setRemark(e.target.value)}
                    placeholder="备注（可选）"
                    className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm focus:outline-none focus:ring-2 focus:ring-violet-500"
                  />
                </div>

                <Button
                  onClick={handleApply}
                  disabled={submitting}
                  className="w-full bg-violet-600 hover:bg-violet-700"
                >
                  {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />提交中...</> : '提交提现申请'}
                </Button>
              </>
            )}
          </TabsContent>

          {/* 提现账户 */}
          <TabsContent value="account" className="space-y-3 pt-3">
            <div className="space-y-2">
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">微信收款 openid</label>
                <input value={wechatOpenid} onChange={(e) => setWechatOpenid(e.target.value)} placeholder="微信支付收款 openid" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">支付宝账号</label>
                <input value={alipayAccount} onChange={(e) => setAlipayAccount(e.target.value)} placeholder="支付宝账号" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">银行名称</label>
                <input value={bankName} onChange={(e) => setBankName(e.target.value)} placeholder="银行名称" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">银行卡号</label>
                <input value={bankCard} onChange={(e) => setBankCard(e.target.value)} placeholder="银行卡号" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <div>
                <label className="mb-1 block text-xs font-medium text-slate-600">持卡人姓名</label>
                <input value={bankHolder} onChange={(e) => setBankHolder(e.target.value)} placeholder="持卡人姓名" className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm" />
              </div>
              <Button onClick={handleSaveAccount} disabled={submitting} className="w-full bg-violet-600 hover:bg-violet-700">
                {submitting ? <><Loader2 className="mr-2 h-4 w-4 animate-spin" />保存中...</> : '保存提现账户'}
              </Button>
              <p className="text-[11px] text-slate-400">提示：提现时将使用绑定的账户信息，请确保信息真实有效。</p>
            </div>
          </TabsContent>

          {/* 提现记录 */}
          <TabsContent value="records" className="space-y-2 pt-3">
            {records.length === 0 && (
              <p className="py-6 text-center text-sm text-slate-400">暂无提现记录</p>
            )}
            {records.map((r) => (
              <div key={r.id} className="rounded-lg border border-slate-100 p-3">
                <div className="flex items-center justify-between">
                  <div>
                    <span className="text-sm font-bold text-violet-700">{r.points} 积分</span>
                    <span className="ml-2 text-xs text-slate-400">→ ¥{r.amount}（{ACCOUNT_TYPE_LABEL[r.account_type]}）</span>
                  </div>
                  <Badge className={STATUS_STYLE[r.status]}>{STATUS_LABEL[r.status]}</Badge>
                </div>
                <div className="mt-1 text-[11px] text-slate-400">
                  {new Date(r.created_at).toLocaleString('zh-CN', { year: 'numeric', month: 'numeric', day: 'numeric', hour: '2-digit', minute: '2-digit' })}
                  {r.reject_reason && <span className="ml-2 text-red-500">原因：{r.reject_reason}</span>}
                  {r.remark && <span className="ml-2">{r.remark}</span>}
                </div>
              </div>
            ))}
          </TabsContent>
        </Tabs>
      )}
    </div>
  );
}
