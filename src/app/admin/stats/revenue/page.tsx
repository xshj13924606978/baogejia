'use client';

import { useState, useEffect, useCallback, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import {
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  ResponsiveContainer,
  PieChart,
  Pie,
  Cell,
} from 'recharts';
import {
  DollarSign,
  ShoppingCart,
  TrendingUp,
  TrendingDown,
  Calendar,
  Download,
  RefreshCw,
  MoreHorizontal,
  CheckSquare,
  Square,
  ArrowUpRight,
  ArrowDownRight,
} from 'lucide-react';
import { formatCurrency, formatNumber } from '@/lib/utils';
import { getClientAuthHeaders } from '@/lib/client-utils';

interface RevenueStats {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  byPaymentMethod: Record<string, { count: number; amount: number }>;
  byPlan: Record<string, { count: number; amount: number }>;
  byStatus: Record<string, { count: number; amount: number }>;
  dailyRevenue: Array<{ date: string; amount: number; count: number }>;
  monthlyRevenue: Array<{ month: string; amount: number; count: number }>;
  topUsers: Array<{ userId: string; amount: number; orderCount: number }>;
  summary: {
    successRate: number;
    refundRate: number;
    highestDay: { date: string; amount: number };
    lowestDay: { date: string; amount: number };
    growthRate: number;
  };
}

const COLORS = ['#0ea5e9', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const STATUS_LABELS: Record<string, string> = {
  success: '成功',
  pending: '待支付',
  failed: '失败',
  refunded: '已退款',
  unknown: '未知',
};

const METHOD_LABELS: Record<string, string> = {
  wechat: '微信支付',
  alipay: '支付宝',
  bank: '银行卡',
  unknown: '其他',
};

export default function RevenueStatsPage() {
  const [stats, setStats] = useState<RevenueStats | null>(null);
  const [loading, setLoading] = useState(true);
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');
  const [selectedMonths, setSelectedMonths] = useState<Set<string>>(new Set());

  const fetchStats = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (startDate) params.set('start', startDate);
      if (endDate) params.set('end', endDate);

      const res = await fetch(`/api/admin/stats/revenue?${params.toString()}`, {
        headers: getClientAuthHeaders(),
      });
      if (!res.ok) throw new Error('获取失败');
      const data = await res.json();
      setStats(data);
    } catch (err) {
      console.error('[RevenuePage] 加载失败:', err);
    } finally {
      setLoading(false);
    }
  }, [startDate, endDate]);

  useEffect(() => {
    fetchStats();
  }, [fetchStats]);

  // 月度明细数据（按月份倒序，最近12个月）
  const monthlyData = useMemo(() => {
    if (!stats?.monthlyRevenue?.length) return [];
    const total = stats.monthlyRevenue.reduce((s, m) => s + m.amount, 0);
    return [...stats.monthlyRevenue]
      .sort((a, b) => b.month.localeCompare(a.month))
      .slice(0, 12)
      .map((m) => ({
        ...m,
        percentage: total > 0 ? ((m.amount / total) * 100).toFixed(1) : '0.0',
      }));
  }, [stats?.monthlyRevenue]);

  // 支付方式明细数据
  const methodData = useMemo(() => {
    if (!stats?.byPaymentMethod) return [];
    return Object.entries(stats.byPaymentMethod).map(([method, data]) => ({
      method,
      label: METHOD_LABELS[method] || method,
      count: data.count,
      amount: data.amount,
    }));
  }, [stats?.byPaymentMethod]);

  // 订单状态明细数据
  const statusData = useMemo(() => {
    if (!stats?.byStatus) return [];
    return Object.entries(stats.byStatus).map(([status, data]) => ({
      status,
      label: STATUS_LABELS[status] || status,
      count: data.count,
      amount: data.amount,
    }));
  }, [stats?.byStatus]);

  // 近12个月趋势图数据
  const trendChartData = useMemo(() => {
    if (!stats?.monthlyRevenue?.length) return [];
    return [...stats.monthlyRevenue]
      .sort((a, b) => a.month.localeCompare(b.month))
      .slice(-12)
      .map((m) => ({
        month: m.month.slice(5), // MM
        fullMonth: m.month,
        收入: m.amount,
        订单数: m.count,
      }));
  }, [stats?.monthlyRevenue]);

  // 批量选择操作
  const allMonthKeys = useMemo(() => monthlyData.map((m) => m.month), [monthlyData]);
  const isAllMonthsSelected =
    allMonthKeys.length > 0 && allMonthKeys.every((k) => selectedMonths.has(k));
  const isSomeMonthsSelected =
    allMonthKeys.some((k) => selectedMonths.has(k)) && !isAllMonthsSelected;

  const toggleAllMonths = () => {
    if (isAllMonthsSelected) {
      setSelectedMonths(new Set());
    } else {
      setSelectedMonths(new Set(allMonthKeys));
    }
  };

  const toggleMonth = (month: string) => {
    const next = new Set(selectedMonths);
    if (next.has(month)) next.delete(month);
    else next.add(month);
    setSelectedMonths(next);
  };

  // 导出月度明细CSV
  const exportMonthlyCSV = (months?: string[]) => {
    const target = months?.length
      ? monthlyData.filter((m) => months.includes(m.month))
      : monthlyData;
    if (!target.length) return;

    const headers = ['月份', '订单数', '收入(元)', '占比(%)'];
    const rows = target.map((m) => [m.month, m.count, m.amount, m.percentage]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `月度收入明细_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 导出支付方式CSV
  const exportMethodCSV = () => {
    if (!methodData.length) return;
    const headers = ['支付方式', '订单数', '金额(元)'];
    const rows = methodData.map((m) => [m.label, m.count, m.amount]);
    const csvContent = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `支付方式分布_${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
  };

  // 统计卡片数据
  const cards = useMemo(() => {
    if (!stats) return [];
    const growthPositive = stats.summary.growthRate >= 0;
    return [
      {
        title: '总收入',
        value: formatCurrency(stats.totalRevenue),
        icon: DollarSign,
        color: 'text-emerald-600',
        bg: 'bg-emerald-50',
        trend: `${growthPositive ? '+' : ''}${stats.summary.growthRate}%`,
        trendUp: growthPositive,
      },
      {
        title: '总订单数',
        value: formatNumber(stats.totalOrders),
        icon: ShoppingCart,
        color: 'text-sky-600',
        bg: 'bg-sky-50',
        trend: null,
      },
      {
        title: '平均客单价',
        value: formatCurrency(stats.averageOrderValue),
        icon: TrendingUp,
        color: 'text-amber-600',
        bg: 'bg-amber-50',
        trend: null,
      },
      {
        title: '月增长率',
        value: `${growthPositive ? '+' : ''}${stats.summary.growthRate}%`,
        icon: growthPositive ? ArrowUpRight : ArrowDownRight,
        color: growthPositive ? 'text-emerald-600' : 'text-red-500',
        bg: growthPositive ? 'bg-emerald-50' : 'bg-red-50',
        trend: null,
      },
    ];
  }, [stats]);

  return (
    <div className="-m-6">
      {/* Header */}
      <div className="bg-white border-b sticky top-0 z-10">
        <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-4 flex items-center justify-between">
          <div>
            <h1 className="text-xl font-bold text-gray-900 tracking-tight">收入统计</h1>
            <p className="text-xs text-gray-500 mt-0.5">查看平台收入和订单数据分析</p>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={fetchStats}
              disabled={loading}
              className="h-8 text-xs"
            >
              <RefreshCw className={`w-3.5 h-3.5 mr-1.5 ${loading ? 'animate-spin' : ''}`} />
              刷新
            </Button>
          </div>
        </div>
      </div>

      <div className="max-w-[1440px] mx-auto px-4 sm:px-6 py-5 space-y-5">
        {/* 加载中 */}
        {loading && !stats && (
          <div className="flex items-center justify-center py-12 text-sm text-gray-400">
            <RefreshCw className="w-5 h-5 mr-2 animate-spin" />
            数据加载中...
          </div>
        )}

        {/* 筛选栏 */}
        <Card className="shadow-sm border-0 ring-1 ring-gray-100">
          <CardContent className="p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="flex items-center gap-2">
                <Calendar className="w-4 h-4 text-gray-400" />
                <input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="px-2.5 py-1.5 text-sm border rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none bg-white"
                />
                <span className="text-sm text-gray-400">至</span>
                <input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="px-2.5 py-1.5 text-sm border rounded-md focus:ring-2 focus:ring-sky-500 focus:border-sky-500 outline-none bg-white"
                />
              </div>
              <div className="flex items-center gap-2 ml-auto">
                <Button
                  variant="default"
                  size="sm"
                  onClick={fetchStats}
                  disabled={loading}
                  className="h-8 text-xs bg-gray-900 hover:bg-gray-800"
                >
                  筛选
                </Button>
                {(startDate || endDate) && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={() => {
                      setStartDate('');
                      setEndDate('');
                    }}
                    className="h-8 text-xs text-gray-500"
                  >
                    清除
                  </Button>
                )}
              </div>
            </div>
          </CardContent>
        </Card>

        {/* 统计卡片 */}
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
          {cards.map((card) => (
            <Card
              key={card.title}
              className="border-0 shadow-sm ring-1 ring-gray-100 hover:shadow-md transition-shadow"
            >
              <CardContent className="p-4">
                <div className="flex items-start justify-between">
                  <div className="space-y-1.5">
                    <p className="text-xs font-medium text-gray-500">{card.title}</p>
                    <p className="text-2xl font-bold text-gray-900 tracking-tight">{card.value}</p>
                    {card.trend !== null && (
                      <div className="flex items-center gap-1">
                        {card.trendUp ? (
                          <TrendingUp className="w-3 h-3 text-emerald-500" />
                        ) : (
                          <TrendingDown className="w-3 h-3 text-red-500" />
                        )}
                        <span
                          className={`text-xs font-medium ${card.trendUp ? 'text-emerald-600' : 'text-red-500'}`}
                        >
                          {card.trend}
                        </span>
                      </div>
                    )}
                  </div>
                  <div className={`p-2.5 rounded-xl ${card.bg}`}>
                    <card.icon className={`w-5 h-5 ${card.color}`} />
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>

        {/* 月度收入趋势 */}
        <Card className="border-0 shadow-sm ring-1 ring-gray-100">
          <CardHeader className="px-5 py-4 pb-0">
            <CardTitle className="text-sm font-semibold text-gray-900">
              月度收入趋势（近12个月）
            </CardTitle>
          </CardHeader>
          <CardContent className="p-5">
            {trendChartData.length > 0 ? (
              <div className="w-full overflow-auto">
                <div className="min-w-[600px] h-72">
                  <ResponsiveContainer width="100%" height="100%">
                    <BarChart data={trendChartData} barCategoryGap="20%">
                      <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                      <XAxis
                        dataKey="month"
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        axisLine={{ stroke: '#e2e8f0' }}
                        tickLine={false}
                      />
                      <YAxis
                        tick={{ fontSize: 12, fill: '#64748b' }}
                        axisLine={false}
                        tickLine={false}
                        tickFormatter={(v: number) => `¥${(v / 1000).toFixed(0)}k`}
                      />
                      <Tooltip
                        formatter={(value: number, name: string) => [
                          name === '收入' ? formatCurrency(value) : String(value),
                          name,
                        ]}
                        contentStyle={{
                          borderRadius: 8,
                          border: 'none',
                          boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                          fontSize: 12,
                        }}
                      />
                      <Legend
                        wrapperStyle={{ fontSize: 12, paddingTop: 8 }}
                        iconType="circle"
                        iconSize={8}
                      />
                      <Bar
                        dataKey="收入"
                        fill="#0ea5e9"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                      />
                      <Bar
                        dataKey="订单数"
                        fill="#94a3b8"
                        radius={[4, 4, 0, 0]}
                        maxBarSize={40}
                      />
                    </BarChart>
                  </ResponsiveContainer>
                </div>
              </div>
            ) : (
              <div className="h-56 flex items-center justify-center text-sm text-gray-400">
                暂无月度数据
              </div>
            )}
          </CardContent>
        </Card>

        {/* 订单状态分布 + 支付方式分布 */}
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
          {/* 订单状态分布 */}
          <Card className="border-0 shadow-sm ring-1 ring-gray-100">
            <CardHeader className="px-5 py-4 pb-0 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-900">订单状态分布</CardTitle>
            </CardHeader>
            <CardContent className="p-5">
              {statusData.length > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-40 h-40 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={statusData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          dataKey="count"
                          nameKey="label"
                          strokeWidth={2}
                          stroke="#fff"
                        >
                          {statusData.map((_, idx) => (
                            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number, _name: string, props: any) => [
                            String(value),
                            props?.payload?.label || '',
                          ]}
                          contentStyle={{
                            borderRadius: 8,
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 w-full">
                    <div className="space-y-2.5">
                      {statusData.map((item, idx) => {
                        const total = statusData.reduce((s, d) => s + d.count, 0);
                        const pct = total > 0 ? ((item.count / total) * 100).toFixed(1) : '0.0';
                        return (
                          <div key={item.status} className="flex items-center gap-3">
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-700 truncate">{item.label}</span>
                                <span className="text-gray-500 font-medium ml-2">
                                  {item.count} ({pct}%)
                                </span>
                              </div>
                              <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: COLORS[idx % COLORS.length],
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                    <div className="mt-4 pt-3 border-t border-gray-100 flex items-center justify-between text-xs">
                      <span className="text-gray-500">
                        成功率:
                        <span className="text-emerald-600 font-semibold ml-1">
                          {stats?.summary?.successRate ?? 0}%
                        </span>
                      </span>
                      <span className="text-gray-500">
                        退款率:
                        <span className="text-red-500 font-semibold ml-1">
                          {stats?.summary?.refundRate ?? 0}%
                        </span>
                      </span>
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-sm text-gray-400">
                  暂无数据
                </div>
              )}
            </CardContent>
          </Card>

          {/* 支付方式分布 */}
          <Card className="border-0 shadow-sm ring-1 ring-gray-100">
            <CardHeader className="px-5 py-4 pb-0 flex flex-row items-center justify-between">
              <CardTitle className="text-sm font-semibold text-gray-900">支付方式分布</CardTitle>
              <Button
                variant="ghost"
                size="sm"
                onClick={exportMethodCSV}
                disabled={!methodData.length}
                className="h-7 text-xs text-gray-500 hover:text-gray-900"
              >
                <Download className="w-3.5 h-3.5 mr-1" />
                导出
              </Button>
            </CardHeader>
            <CardContent className="p-5">
              {methodData.length > 0 ? (
                <div className="flex flex-col sm:flex-row items-center gap-6">
                  <div className="w-40 h-40 shrink-0">
                    <ResponsiveContainer width="100%" height="100%">
                      <PieChart>
                        <Pie
                          data={methodData}
                          cx="50%"
                          cy="50%"
                          innerRadius={45}
                          outerRadius={70}
                          dataKey="amount"
                          nameKey="label"
                          strokeWidth={2}
                          stroke="#fff"
                        >
                          {methodData.map((_, idx) => (
                            <Cell key={idx} fill={COLORS[idx % COLORS.length]} />
                          ))}
                        </Pie>
                        <Tooltip
                          formatter={(value: number) => [formatCurrency(value), '金额']}
                          contentStyle={{
                            borderRadius: 8,
                            border: 'none',
                            boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            fontSize: 12,
                          }}
                        />
                      </PieChart>
                    </ResponsiveContainer>
                  </div>
                  <div className="flex-1 w-full">
                    <div className="space-y-2.5">
                      {methodData.map((item, idx) => {
                        const total = methodData.reduce((s, d) => s + d.amount, 0);
                        const pct = total > 0 ? ((item.amount / total) * 100).toFixed(1) : '0.0';
                        return (
                          <div key={item.method} className="flex items-center gap-3">
                            <div
                              className="w-2.5 h-2.5 rounded-full shrink-0"
                              style={{ backgroundColor: COLORS[idx % COLORS.length] }}
                            />
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center justify-between text-xs">
                                <span className="text-gray-700 truncate">{item.label}</span>
                                <span className="text-gray-500 font-medium ml-2">
                                  {formatCurrency(item.amount)} ({pct}%)
                                </span>
                              </div>
                              <div className="mt-1 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full transition-all"
                                  style={{
                                    width: `${pct}%`,
                                    backgroundColor: COLORS[idx % COLORS.length],
                                  }}
                                />
                              </div>
                            </div>
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              ) : (
                <div className="h-48 flex items-center justify-center text-sm text-gray-400">
                  暂无数据
                </div>
              )}
            </CardContent>
          </Card>
        </div>

        {/* 月度收入明细（带批量操作） */}
        <Card className="border-0 shadow-sm ring-1 ring-gray-100">
          <CardHeader className="px-5 py-4 pb-0 flex flex-row items-center justify-between">
            <CardTitle className="text-sm font-semibold text-gray-900">月度收入明细</CardTitle>
            <div className="flex items-center gap-2">
              {selectedMonths.size > 0 && (
                <span className="text-xs text-sky-600 font-medium">
                  已选 {selectedMonths.size} 项
                </span>
              )}
              <DropdownMenu>
                <DropdownMenuTrigger asChild>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={!monthlyData.length}
                    className="h-7 text-xs"
                  >
                    <Download className="w-3.5 h-3.5 mr-1.5" />
                    导出
                    <MoreHorizontal className="w-3 h-3 ml-1.5 text-gray-400" />
                  </Button>
                </DropdownMenuTrigger>
                <DropdownMenuContent align="end" className="text-xs">
                  <DropdownMenuItem
                    onClick={() => exportMonthlyCSV(Array.from(selectedMonths))}
                    disabled={selectedMonths.size === 0}
                  >
                    导出选中月份
                  </DropdownMenuItem>
                  <DropdownMenuItem onClick={() => exportMonthlyCSV()}>
                    导出全部月份
                  </DropdownMenuItem>
                </DropdownMenuContent>
              </DropdownMenu>
            </div>
          </CardHeader>
          <CardContent className="p-5">
            {monthlyData.length > 0 ? (
              <div className="overflow-auto rounded-lg border border-gray-100">
                <table className="w-full text-xs">
                  <thead>
                    <tr className="bg-gray-50 border-b border-gray-100">
                      <th className="px-3 py-2.5 text-left w-10">
                        <button
                          onClick={toggleAllMonths}
                          className="flex items-center justify-center"
                          title={isAllMonthsSelected ? '取消全选' : '全选'}
                        >
                          {isAllMonthsSelected ? (
                            <CheckSquare className="w-4 h-4 text-sky-600" />
                          ) : isSomeMonthsSelected ? (
                            <div className="w-4 h-4 rounded border-2 border-sky-600 bg-sky-600 flex items-center justify-center">
                              <div className="w-2 h-0.5 bg-white rounded" />
                            </div>
                          ) : (
                            <Square className="w-4 h-4 text-gray-300 hover:text-gray-500" />
                          )}
                        </button>
                      </th>
                      <th className="px-3 py-2.5 text-left font-semibold text-gray-700">
                        月份
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-700">
                        订单数
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-700">
                        收入
                      </th>
                      <th className="px-3 py-2.5 text-right font-semibold text-gray-700">
                        占比
                      </th>
                    </tr>
                  </thead>
                  <tbody>
                    {monthlyData.map((m) => {
                      const selected = selectedMonths.has(m.month);
                      return (
                        <tr
                          key={m.month}
                          onClick={() => toggleMonth(m.month)}
                          className={`border-b border-gray-50 last:border-0 cursor-pointer transition-colors ${
                            selected ? 'bg-sky-50/60' : 'hover:bg-gray-50/60'
                          }`}
                        >
                          <td className="px-3 py-2.5">
                            <div className="flex items-center justify-center">
                              {selected ? (
                                <CheckSquare className="w-4 h-4 text-sky-600" />
                              ) : (
                                <Square className="w-4 h-4 text-gray-300" />
                              )}
                            </div>
                          </td>
                          <td className="px-3 py-2.5 font-medium text-gray-900">{m.month}</td>
                          <td className="px-3 py-2.5 text-right text-gray-600">
                            {formatNumber(m.count)}
                          </td>
                          <td className="px-3 py-2.5 text-right font-medium text-gray-900">
                            {formatCurrency(m.amount)}
                          </td>
                          <td className="px-3 py-2.5 text-right">
                            <div className="flex items-center justify-end gap-2">
                              <span className="text-gray-600">{m.percentage}%</span>
                              <div className="w-16 h-1.5 bg-gray-100 rounded-full overflow-hidden">
                                <div
                                  className="h-full rounded-full bg-sky-500"
                                  style={{ width: `${Math.min(Number(m.percentage), 100)}%` }}
                                />
                              </div>
                            </div>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : (
              <div className="h-48 flex items-center justify-center text-sm text-gray-400">
                暂无月度数据
              </div>
            )}
          </CardContent>
        </Card>
      </div>
    </div>
  );
}
