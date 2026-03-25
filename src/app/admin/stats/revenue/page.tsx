'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Input } from '@/components/ui/input';
import {
  DollarSign, BarChart3, TrendingUp, ArrowLeft, Loader2,
  Calendar,
} from 'lucide-react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  LineChart, Line, PieChart, Pie, Cell,
} from 'recharts';

interface RevenueStats {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  byPaymentMethod: Record<string, { count: number; amount: number }>;
  byPlan: Record<string, { count: number; amount: number }>;
  byStatus: Record<string, { count: number; amount: number }>;
  dailyRevenue: Array<{ date: string; amount: number; count: number }>;
  monthlyRevenue: Array<{ month: string; amount: number; count: number }>;
  topUsers: Array<{ userId: number; amount: number; orderCount: number }>;
  summary: {
    successRate: number;
    refundRate: number;
    growthRate: number;
    highestDay: { date: string; amount: number };
    lowestDay: { date: string; amount: number };
  };
}

const STATUS_COLORS: Record<string, string> = {
  success: 'bg-green-100 text-green-800',
  pending: 'bg-yellow-100 text-yellow-800',
  failed: 'bg-red-100 text-red-800',
  refunded: 'bg-gray-100 text-gray-800',
};

const PIE_COLORS = ['#3b82f6', '#10b981', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899', '#06b6d4'];

function formatMoney(amount: number): string {
  return `¥${amount.toLocaleString(undefined, { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`;
}

function formatShortMoney(amount: number): string {
  if (amount >= 10000) return `¥${(amount / 10000).toFixed(1)}万`;
  return `¥${amount.toLocaleString()}`;
}

export default function RevenueStatsPage() {
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [dateStart, setDateStart] = useState('');
  const [dateEnd, setDateEnd] = useState('');

  const loadStats = async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (dateStart) params.set('start', dateStart);
      if (dateEnd) params.set('end', dateEnd);
      const res = await fetch(`/api/admin/stats/revenue?${params}`);
      const data = await res.json();
      if (!data.error) {
        setStats(data);
      } else {
        toast.error(data.error);
      }
    } catch {
      toast.error('加载收入统计失败');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadStats(); }, []);

  const handleFilter = () => { loadStats(); };
  const handleReset = () => {
    setDateStart('');
    setDateEnd('');
    setTimeout(loadStats, 0);
  };

  // 图表数据
  const monthlyChartData = (stats?.monthlyRevenue || []).slice(-12).map(d => ({
    ...d,
    label: d.month,
    收入: d.amount,
    订单数: d.count,
  }));

  const statusPieData = Object.entries(stats?.byStatus || {}).map(([key, val]) => ({
    name: key === 'success' ? '成功' : key === 'pending' ? '待处理' : key === 'failed' ? '失败' : key === 'refunded' ? '已退款' : key,
    value: val.amount,
    count: val.count,
  }));

  const paymentData = Object.entries(stats?.byPaymentMethod || {}).map(([key, val]) => ({
    method: key || '未知',
    ...val,
  }));

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载收入统计...</span>
      </div>
    );
  }

  if (!stats) {
    return (
      <div className="text-center py-24">
        <BarChart3 className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
        <p className="text-muted-foreground">暂无收入数据</p>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">收入统计</h1>
          <p className="text-gray-500">查看平台收入和订单数据分析</p>
        </div>
      </div>

      {/* 日期筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-center gap-3">
            <Calendar className="h-4 w-4 text-gray-400" />
            <Input
              type="date"
              className="w-44"
              value={dateStart}
              onChange={(e) => setDateStart(e.target.value)}
            />
            <span className="text-gray-400">至</span>
            <Input
              type="date"
              className="w-44"
              value={dateEnd}
              onChange={(e) => setDateEnd(e.target.value)}
            />
            <Button size="sm" onClick={handleFilter}>筛选</Button>
            {(dateStart || dateEnd) && (
              <Button variant="ghost" size="sm" onClick={handleReset}>清除</Button>
            )}
          </div>
        </CardContent>
      </Card>

      {/* 概览卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-green-100 p-2.5 rounded-lg">
              <DollarSign className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">总收入</p>
              <p className="text-xl font-bold text-green-600">{formatShortMoney(stats.totalRevenue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-blue-100 p-2.5 rounded-lg">
              <BarChart3 className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">总订单数</p>
              <p className="text-xl font-bold">{stats.totalOrders.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-purple-100 p-2.5 rounded-lg">
              <TrendingUp className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">平均客单价</p>
              <p className="text-xl font-bold">{formatShortMoney(stats.averageOrderValue)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className={`${stats.summary.growthRate >= 0 ? 'bg-green-100' : 'bg-red-100'} p-2.5 rounded-lg`}>
              <TrendingUp className={`h-5 w-5 ${stats.summary.growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`} />
            </div>
            <div>
              <p className="text-sm text-gray-500">月增长率</p>
              <p className={`text-xl font-bold ${stats.summary.growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                {stats.summary.growthRate >= 0 ? '+' : ''}{stats.summary.growthRate.toFixed(1)}%
              </p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 月度收入趋势图 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">月度收入趋势（近12个月）</CardTitle>
        </CardHeader>
        <CardContent>
          {monthlyChartData.length > 0 ? (
            <ResponsiveContainer width="100%" height={300}>
              <BarChart data={monthlyChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} tickFormatter={(v) => formatShortMoney(v)} />
                <Tooltip formatter={(value: number) => formatMoney(value)} />
                <Bar dataKey="收入" fill="#3b82f6" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          ) : (
            <p className="text-center py-12 text-muted-foreground">暂无月度数据</p>
          )}
        </CardContent>
      </Card>

      {/* 两列: 状态分布 + 支付方式 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 订单状态分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">订单状态分布</CardTitle>
          </CardHeader>
          <CardContent>
            {statusPieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={200}>
                  <PieChart>
                    <Pie
                      data={statusPieData}
                      cx="50%"
                      cy="50%"
                      innerRadius={50}
                      outerRadius={80}
                      dataKey="value"
                      paddingAngle={2}
                    >
                      {statusPieData.map((_, i) => (
                        <Cell key={i} fill={PIE_COLORS[i % PIE_COLORS.length]} />
                      ))}
                    </Pie>
                    <Tooltip formatter={(value: number) => formatMoney(value)} />
                  </PieChart>
                </ResponsiveContainer>
                <div className="flex flex-wrap gap-2 justify-center mt-2">
                  {statusPieData.map((item, i) => (
                    <div key={i} className="flex items-center gap-1.5 text-xs">
                      <span className="w-2.5 h-2.5 rounded-full" style={{ backgroundColor: PIE_COLORS[i % PIE_COLORS.length] }} />
                      {item.name} ({item.count}单)
                    </div>
                  ))}
                </div>
              </>
            ) : (
              <p className="text-center py-8 text-muted-foreground">暂无数据</p>
            )}
            <div className="mt-4 pt-4 border-t grid grid-cols-2 gap-4 text-sm">
              <div>
                <span className="text-gray-500">成功率：</span>
                <span className="font-medium text-green-600">{stats.summary.successRate.toFixed(1)}%</span>
              </div>
              <div>
                <span className="text-gray-500">退款率：</span>
                <span className="font-medium text-red-600">{stats.summary.refundRate.toFixed(1)}%</span>
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 支付方式分布 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">支付方式分布</CardTitle>
          </CardHeader>
          <CardContent>
            {paymentData.length > 0 ? (
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>方式</TableHead>
                      <TableHead className="text-right">订单数</TableHead>
                      <TableHead className="text-right">金额</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paymentData.map((item, i) => (
                      <TableRow key={i}>
                        <TableCell className="font-medium">{item.method}</TableCell>
                        <TableCell className="text-right">{item.count}</TableCell>
                        <TableCell className="text-right">{formatMoney(item.amount)}</TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">暂无数据</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 月度收入明细表格 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">月度收入明细</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>月份</TableHead>
                  <TableHead className="text-right">订单数</TableHead>
                  <TableHead className="text-right">收入</TableHead>
                  <TableHead className="text-right">占比</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {(stats.monthlyRevenue || []).slice().reverse().slice(0, 12).map((d, i) => (
                  <TableRow key={i}>
                    <TableCell className="font-medium">{d.month}</TableCell>
                    <TableCell className="text-right">{d.count}</TableCell>
                    <TableCell className="text-right font-medium">{formatMoney(d.amount)}</TableCell>
                    <TableCell className="text-right text-gray-500">
                      {stats.totalRevenue > 0 ? ((d.amount / stats.totalRevenue) * 100).toFixed(1) : 0}%
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
