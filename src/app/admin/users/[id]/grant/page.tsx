'use client';

import React, { useState, useEffect } from 'react';
import { useParams, useRouter } from 'next/navigation';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { ArrowLeft, Coins, Gift, Loader2, Minus, Plus, User } from 'lucide-react';
import { toast } from 'sonner';

interface PointsData {
  userId: string;
  pointsBalance: number;
  tokenBalance: number;
  totalConsumedPoints: number;
  totalRechargedPoints: number;
  lastUpdated: string;
}

export default function UserGrantPage() {
  const params = useParams();
  const router = useRouter();
  const userId = params.id;

  const [pointsData, setPointsData] = useState<PointsData | null>(null);
  const [userName, setUserName] = useState('');
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  const [amount, setAmount] = useState('');
  const [reason, setReason] = useState('');

  const loadData = async () => {
    setLoading(true);
    try {
      const [pointsRes, userRes] = await Promise.all([
        fetch(`/api/admin/users/${userId}/points`),
        fetch(`/api/admin/users/${userId}`),
      ]);
      const pointsJson = await pointsRes.json();
      const userJson = await userRes.json();
      if (pointsJson.success) setPointsData(pointsJson.data);
      if (userJson.success) setUserName(userJson.data?.name || userJson.data?.email || '');
      if (!pointsJson.success && !userJson.success) toast.error('加载失败');
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  };

  useEffect(() => { if (userId) loadData(); }, [userId]);

  const handleGrant = async () => {
    const pts = parseInt(amount);
    if (isNaN(pts) || pts === 0) { toast.error('请输入有效的积分数'); return; }
    if (pts > 0 && !reason.trim()) { toast.error('赠送积分请填写原因'); return; }

    setSaving(true);
    try {
      const newBalance = (pointsData?.pointsBalance || 0) + pts;
      if (newBalance < 0) { toast.error('积分余额不能为负'); setSaving(false); return; }

      const res = await fetch(`/api/admin/users/${userId}/points`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: newBalance }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(pts > 0 ? `已赠送 ${pts} 积分` : `已扣除 ${Math.abs(pts)} 积分`);
        setAmount('');
        setReason('');
        loadData();
      } else {
        toast.error(data.error || '操作失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setSaving(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载积分信息...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center gap-3">
        <Button variant="ghost" size="icon" onClick={() => router.back()}>
          <ArrowLeft className="h-4 w-4" />
        </Button>
        <div>
          <h1 className="text-2xl font-bold">积分赠送</h1>
          <p className="text-gray-500">{userName || userId}</p>
        </div>
      </div>

      {/* 当前余额 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Coins className="h-5 w-5 text-amber-500" />
            积分概况
          </CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <div className="p-4 rounded-lg bg-amber-50 text-center">
              <p className="text-sm text-gray-500">当前积分</p>
              <p className="text-2xl font-bold text-amber-600">{pointsData?.pointsBalance ?? 0}</p>
            </div>
            <div className="p-4 rounded-lg bg-green-50 text-center">
              <p className="text-sm text-gray-500">累计充值</p>
              <p className="text-2xl font-bold text-green-600">{pointsData?.totalRechargedPoints ?? 0}</p>
            </div>
            <div className="p-4 rounded-lg bg-red-50 text-center">
              <p className="text-sm text-gray-500">累计消费</p>
              <p className="text-2xl font-bold text-red-600">{pointsData?.totalConsumedPoints ?? 0}</p>
            </div>
            <div className="p-4 rounded-lg bg-gray-50 text-center">
              <p className="text-sm text-gray-500">Token余额</p>
              <p className="text-2xl font-bold">{pointsData?.tokenBalance ?? 0}</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 赠送/扣除 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Gift className="h-5 w-5 text-blue-500" />
            积分操作
          </CardTitle>
          <CardDescription>赠送或扣除用户积分，正数为赠送，负数为扣除</CardDescription>
        </CardHeader>
        <CardContent className="space-y-4">
          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <Label>积分数</Label>
              <Input
                type="number"
                placeholder="正数赠送，负数扣除，如 100 或 -50"
                value={amount}
                onChange={(e) => setAmount(e.target.value)}
              />
              <p className="text-xs text-gray-400 mt-1">
                操作后余额：{pointsData ? (pointsData.pointsBalance + (parseInt(amount) || 0)) : '-'}
              </p>
            </div>
            <div>
              <Label>原因/备注</Label>
              <Input
                placeholder="如：活动奖励、补偿赠送"
                value={reason}
                onChange={(e) => setReason(e.target.value)}
              />
            </div>
          </div>
          <div className="flex gap-2">
            <Button variant="outline" size="sm" onClick={() => { setAmount('100'); setReason(''); }}>
              <Plus className="h-4 w-4 mr-2" />
              赠送100
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setAmount('500'); setReason(''); }}>
              <Plus className="h-4 w-4 mr-2" />
              赠送500
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setAmount('1000'); setReason(''); }}>
              <Plus className="h-4 w-4 mr-2" />
              赠送1000
            </Button>
            <Button variant="outline" size="sm" onClick={() => { setAmount('-100'); setReason(''); }}>
              <Minus className="h-4 w-4 mr-2" />
              扣除100
            </Button>
          </div>
          <Button onClick={handleGrant} disabled={saving || !amount || parseInt(amount) === 0}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Gift className="h-4 w-4 mr-2" />}
            确认操作
          </Button>
        </CardContent>
      </Card>
    </div>
  );
}
