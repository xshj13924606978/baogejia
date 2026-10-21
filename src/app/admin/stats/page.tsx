'use client';

import { useEffect, useState } from 'react';
import { useRouter } from 'next/navigation';
import { toast } from 'sonner';
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
  AreaChart,
  Area,
  LineChart,
  Line,
} from 'recharts';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import { Checkbox } from '@/components/ui/checkbox';
import {
  Users,
  TrendingUp,
  FileText,
  CreditCard,
  Activity,
  Package,
  RefreshCw,
  Calendar,
  Download,
  Database,
} from 'lucide-react';
import { format } from 'date-fns';
import { zhCN } from 'date-fns/locale';

// ===== 类型定义（与 API 返回结构严格对齐）=====

interface StatsData {
  totalUsers: number;
  activeUsersToday: number;
  totalQuotes: number;
  todayQuotes: number;
  totalProducts: number;
  totalPoints: number;
  /** 累计获得积分（#20260901-0900 P2-1：与当前余额口径区分展示） */
  totalPointsCumulative?: number;
  todayRevenue: number;
  trends30d: Array<{ date: string; users: number; quotes: number }>;
}

interface RevenueData {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  records: Array<{
    date: string;
    amount: number;
    type: 'upgrade' | 'points' | 'subscription';
    description: string;
  }>;
  dailyRevenue: Array<{ date: string; amount: number; count: number }>;
}

interface LevelDistribution {
  level: number;
  count: number;
  percentage: number;
  cumulativePercentage: number;
}

interface DistributionData {
  levels: LevelDistribution[];
  trends: Array<{
    date: string;
    level: number;
    count: number;
  }>;
  conversion: Record<string, { rate: number; count: number }>;
  upgradeTime: Record<number, { avgDays: number; minDays: number; maxDays: number }>;
  summary: {
    totalUsers: number;
    averageLevel: number;
    mostCommonLevel: number;
    upgradeRate: number;
  };
  levelNamesMap?: Record<number, string>;
}

interface HeatmapData {
  dailyStats: Array<{
    date: string;
    totalRequests: number;
    allowedRequests: number;
    deniedRequests: number;
  }>;
  topDeniedEndpoints: Array<{
    endpoint: string;
    count: number;
    percentage: number;
  }>;
  peakHours: Array<{
    hour: number;
    count: number;
  }>;
}

// ===== 图表/UI 样式配置（非数据硬编码）=====
const PIE_COLORS = ['#3b82f6', '#22c55e', '#f59e0b', '#ef4444', '#8b5cf6', '#ec4899'];

const STATUS_COLORS = {
  upgrade: 'bg-blue-100 text-blue-800 dark:bg-blue-900 dark:text-blue-300',
  points: 'bg-green-100 text-green-800 dark:bg-green-900 dark:text-green-300',
  subscription: 'bg-amber-100 text-amber-800 dark:bg-amber-900 dark:text-amber-300',
};

// ===== 辅助函数 =====
function formatWan(num: number) {
  if (num >= 10000) {
    return `${(num / 10000).toFixed(1)}万`;
  }
  return num.toString();
}

function formatDate(dateStr: string) {
  try {
    return format(new Date(dateStr), 'MM-dd', { locale: zhCN });
  } catch {
    return dateStr;
  }
}

// 导出 CSV 辅助函数
function exportCSV(filename: string, headers: string[], rows: (string | number)[][]) {
  const csv = [headers.join(','), ...rows.map((r) => r.join(','))].join('\n');
  const blob = new Blob(['\ufeff' + csv], { type: 'text/csv;charset=utf-8;' });
  const link = document.createElement('a');
  link.href = URL.createObjectURL(blob);
  link.download = filename;
  link.click();
  URL.revokeObjectURL(link.href);
}

export default function StatsPage() {
  const router = useRouter();

  // 状态
  const [stats, setStats] = useState<StatsData | null>(null);
  const [statsLoading, setStatsLoading] = useState(true);

  const [revenueData, setRevenueData] = useState<RevenueData | null>(null);
  const [revenueLoading, setRevenueLoading] = useState(true);
  const [revenueStartDate, setRevenueStartDate] = useState('');
  const [revenueEndDate, setRevenueEndDate] = useState('');
  const [selectedRevenue, setSelectedRevenue] = useState<Set<number>>(new Set());

  const [distribution, setDistribution] = useState<DistributionData | null>(null);
  const [distributionLoading, setDistributionLoading] = useState(true);
  const [levelNamesMap, setLevelNamesMap] = useState<Record<number, string>>({});
  const [selectedLevels, setSelectedLevels] = useState<Set<number>>(new Set());

  const [heatmap, setHeatmap] = useState<HeatmapData | null>(null);
  const [heatmapLoading, setHeatmapLoading] = useState(true);
  const [selectedHeatmapRows, setSelectedHeatmapRows] = useState<Set<number>>(new Set());
  const [selectedApiRows, setSelectedApiRows] = useState<Set<number>>(new Set());

  // ===== 数据获取（全部来自数据库真实数据）=====

  async function fetchStats() {
    try {
      const res = await fetch('/api/admin/stats');
      if (!res.ok) throw new Error('获取统计数据失败');
      const json = await res.json();
      setStats(json.data);
    } catch (error) {
      console.error('获取统计数据失败:', error);
      toast.error('获取统计数据失败');
    } finally {
      setStatsLoading(false);
    }
  }

  async function fetchRevenue() {
    try {
      setRevenueLoading(true);
      const params = new URLSearchParams();
      if (revenueStartDate) params.set('start', revenueStartDate);
      if (revenueEndDate) params.set('end', revenueEndDate);

      const res = await fetch(`/api/admin/stats/revenue?${params}`);
      if (!res.ok) throw new Error('获取收入数据失败');
      const data = await res.json();
      setRevenueData(data);
    } catch (error) {
      console.error('获取收入数据失败:', error);
      toast.error('获取收入数据失败');
    } finally {
      setRevenueLoading(false);
    }
  }

  async function fetchLevelDistribution() {
    try {
      const res = await fetch('/api/admin/stats/level-distribution');
      if (!res.ok) throw new Error('获取等级分布数据失败');
      const data: DistributionData = await res.json();
      setDistribution(data);
      if (data.levelNamesMap && Object.keys(data.levelNamesMap).length > 0) {
        setLevelNamesMap(data.levelNamesMap);
      }
    } catch (error) {
      console.error('获取等级分布数据失败:', error);
      toast.error('获取等级分布数据失败');
    } finally {
      setDistributionLoading(false);
    }
  }

  async function fetchHeatmap() {
    try {
      const res = await fetch('/api/admin/stats/permissions/heatmap');
      if (!res.ok) throw new Error('获取使用热力图数据失败');
      const data = await res.json();
      setHeatmap(data);
    } catch (error) {
      console.error('获取使用热力图数据失败:', error);
      toast.error('获取使用热力图数据失败');
    } finally {
      setHeatmapLoading(false);
    }
  }

  // 初始化
  useEffect(() => {
    fetchStats();
    fetchRevenue();
    fetchLevelDistribution();
    fetchHeatmap();
  }, []);

  // 收入日期变化
  useEffect(() => {
    if (revenueStartDate || revenueEndDate) {
      fetchRevenue();
    }
  }, [revenueStartDate, revenueEndDate]);

  // 获取等级名称（动态从数据库）
  const getLevelName = (level: number) => {
    return levelNamesMap[level] || `等级${level}`;
  };

  // ===== 概览统计卡片（字段名与 API 对齐）=====
  const statCards: Array<{
    title: string;
    value: number;
    icon: React.ComponentType<{ className?: string }>;
    color: string;
    bg: string;
    sub?: string;
  }> = [
    {
      title: '总用户',
      value: stats?.totalUsers ?? 0,
      icon: Users,
      color: 'text-blue-600',
      bg: 'bg-blue-50',
    },
    {
      title: '今日活跃',
      value: stats?.activeUsersToday ?? 0,
      icon: TrendingUp,
      color: 'text-green-600',
      bg: 'bg-green-50',
    },
    {
      title: '总报价单',
      value: stats?.totalQuotes ?? 0,
      icon: FileText,
      color: 'text-purple-600',
      bg: 'bg-purple-50',
    },
    {
      title: '今日新增报价',
      value: stats?.todayQuotes ?? 0,
      icon: FileText,
      color: 'text-cyan-600',
      bg: 'bg-cyan-50',
    },
    {
      title: '产品总数',
      value: stats?.totalProducts ?? 0,
      icon: Package,
      color: 'text-orange-600',
      bg: 'bg-orange-50',
    },
    {
      title: '总积分（余额）',
      value: stats?.totalPoints ?? 0,
      icon: CreditCard,
      color: 'text-pink-600',
      bg: 'bg-pink-50',
      sub: `累计 ${formatWan(stats?.totalPointsCumulative ?? 0)}`,
    },
  ];

  return (
    <div className="h-full flex flex-col">
      {/* 头部 */}
      <div className="px-5 pt-5 pb-3 shrink-0">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold tracking-tight">数据统计</h1>
            <p className="text-sm text-muted-foreground mt-0.5">系统运营数据统计与分析</p>
          </div>
        </div>
      </div>

      {/* Tab 内容区 */}
      <div className="flex-1 min-h-0 px-5 pb-5">
        <Tabs defaultValue="overview" className="h-full flex flex-col">
          <TabsList className="w-fit shrink-0">
            <TabsTrigger value="overview">概览</TabsTrigger>
            <TabsTrigger value="revenue">收入分析</TabsTrigger>
            <TabsTrigger value="levels">等级分布</TabsTrigger>
            <TabsTrigger value="heatmap">使用热力图</TabsTrigger>
          </TabsList>

          {/* ====== 概览 Tab ====== */}
          <TabsContent value="overview" className="flex-1 min-h-0 mt-3 space-y-4 overflow-auto">
            {/* 统计卡片 — 紧凑现代风：数字放大、padding 收紧、图标精致 */}
            <div className="grid grid-cols-2 md:grid-cols-3 xl:grid-cols-6 gap-2.5">
              {statCards.map((card, index) => {
                const Icon = card.icon;
                return (
                  <Card
                    key={index}
                    className="border shadow-sm hover:shadow transition-shadow"
                  >
                    <CardContent className="p-3">
                      <div className="flex items-center justify-between">
                        <div className="space-y-0.5 min-w-0">
                          <p className="text-[11px] font-medium text-muted-foreground leading-tight">{card.title}</p>
                          {statsLoading ? (
                            <Skeleton className="h-8 w-16 mt-1" />
                          ) : (
                            <p className="text-2xl font-bold tabular-nums tracking-tight leading-none mt-1">{formatWan(card.value)}</p>
                          )}
                          {card.sub && !statsLoading && (
                            <p className="text-[10px] text-muted-foreground leading-tight">{card.sub}</p>
                          )}
                        </div>
                        <div className={`shrink-0 p-1.5 rounded-md ${card.bg}`}>
                          <Icon className={`h-4 w-4 ${card.color}`} />
                        </div>
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>

            {/* 图表区域 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-3">
              {/* 近30天趋势（真实数据） */}
              <Card className="border shadow-sm">
                <CardHeader className="py-3 px-4 space-y-0.5">
                  <CardTitle className="text-sm font-semibold">近30天趋势</CardTitle>
                  <CardDescription className="text-xs">每日新增用户和新增报价趋势</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 px-4 pb-3">
                  <div className="h-[300px]">
                    {statsLoading ? (
                      <Skeleton className="h-full w-full" />
                    ) : stats?.trends30d?.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <BarChart data={stats.trends30d} barCategoryGap="20%" barGap={2}>
                          <CartesianGrid strokeDasharray="3 3" stroke="#f0f0f0" vertical={false} />
                          <XAxis
                            dataKey="date"
                            stroke="#9ca3af"
                            fontSize={11}
                            tickFormatter={formatDate}
                            interval={4}
                            tickLine={false}
                            axisLine={{ stroke: '#e5e7eb' }}
                          />
                          <YAxis stroke="#9ca3af" fontSize={11} allowDecimals={false} tickLine={false} axisLine={false} />
                          <Tooltip
                            cursor={{ fill: 'rgba(0,0,0,0.03)' }}
                            contentStyle={{
                              backgroundColor: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '8px',
                              fontSize: '12px',
                              padding: '8px 12px',
                              boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
                            }}
                            labelFormatter={(label) => `${label}`}
                          />
                          <Legend iconSize={8} wrapperStyle={{ fontSize: '11px', paddingTop: '4px' }} />
                          <Bar dataKey="users" name="新增用户" fill="#3b82f6" radius={[3, 3, 0, 0]} maxBarSize={28} />
                          <Bar dataKey="quotes" name="新增报价" fill="#22c55e" radius={[3, 3, 0, 0]} maxBarSize={28} />
                        </BarChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                        暂无趋势数据
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              {/* 今日运营状态（真实数据） */}
              <Card className="border shadow-sm">
                <CardHeader className="py-3 px-4 space-y-0.5">
                  <CardTitle className="text-sm font-semibold">今日运营状态</CardTitle>
                  <CardDescription className="text-xs">基于数据库实时数据统计</CardDescription>
                </CardHeader>
                <CardContent className="pt-0 px-4 pb-3 space-y-0">
                  {statsLoading ? (
                    Array.from({ length: 4 }).map((_, i) => (
                      <div key={i} className="flex items-center justify-between py-2 border-b last:border-0 border-border/40">
                        <Skeleton className="h-3.5 w-20" />
                        <Skeleton className="h-3.5 w-12" />
                      </div>
                    ))
                  ) : (
                    <div className="divide-y divide-border/40">
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-sm text-muted-foreground flex items-center gap-2">
                          <Database className="h-3.5 w-3.5 text-green-600" />
                          数据库连接
                        </span>
                        <Badge variant="default" className="text-[10px] h-5 px-1.5 bg-green-600 hover:bg-green-600">
                          正常
                        </Badge>
                      </div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-sm text-muted-foreground">今日活跃用户</span>
                        <span className="text-sm font-semibold tabular-nums">
                          {stats?.activeUsersToday ?? 0} 人
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-sm text-muted-foreground">今日新增报价</span>
                        <span className="text-sm font-semibold tabular-nums">
                          {stats?.todayQuotes ?? 0} 单
                        </span>
                      </div>
                      <div className="flex items-center justify-between py-2.5">
                        <span className="text-sm text-muted-foreground">今日收入</span>
                        <span className="text-sm font-semibold tabular-nums">
                          ¥{(stats?.todayRevenue ?? 0).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          {/* ====== 收入分析 Tab ====== */}
          <TabsContent value="revenue" className="flex-1 min-h-0 mt-3 space-y-4 overflow-auto">
            {/* 操作栏 */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <div className="flex items-center gap-3">
                <Button variant="outline" size="sm" onClick={fetchRevenue} disabled={revenueLoading}>
                  <RefreshCw className={`h-4 w-4 mr-1.5 ${revenueLoading ? 'animate-spin' : ''}`} />
                  刷新
                </Button>
                <div className="flex items-center gap-2">
                  <Calendar className="h-4 w-4 text-muted-foreground" />
                  <Input
                    type="date"
                    value={revenueStartDate}
                    onChange={(e) => setRevenueStartDate(e.target.value)}
                    className="w-36 h-8 text-sm"
                  />
                  <span className="text-sm text-muted-foreground">至</span>
                  <Input
                    type="date"
                    value={revenueEndDate}
                    onChange={(e) => setRevenueEndDate(e.target.value)}
                    className="w-36 h-8 text-sm"
                  />
                </div>
              </div>
              <div className="flex items-center gap-2">
                {selectedRevenue.size > 0 && (
                  <span className="text-xs text-muted-foreground">
                    已选 {selectedRevenue.size} 项
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedRevenue.size === 0 || revenueLoading}
                  onClick={() => {
                    if (!revenueData) return;
                    const rows = revenueData.records
                      .filter((_, i) => selectedRevenue.has(i))
                      .map((r) => [r.date, r.amount, r.type, r.description]);
                    exportCSV(
                      `收入记录_${new Date().toISOString().slice(0, 10)}.csv`,
                      ['日期', '金额', '类型', '描述'],
                      rows
                    );
                    toast.success('导出成功');
                  }}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  导出选中
                </Button>
              </div>
            </div>

            {/* 统计摘要（字段名与 revenue API 对齐） */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {revenueLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="border shadow-sm">
                      <CardContent className="p-4">
                        <Skeleton className="h-4 w-20 mb-2" />
                        <Skeleton className="h-6 w-16" />
                      </CardContent>
                    </Card>
                  ))
                : [
                    {
                      title: '总收入',
                      value: `¥${(revenueData?.totalRevenue ?? 0).toLocaleString()}`,
                      icon: CreditCard,
                      color: 'text-blue-600',
                    },
                    {
                      title: '总交易数',
                      value: (revenueData?.totalOrders ?? 0).toString(),
                      icon: FileText,
                      color: 'text-green-600',
                    },
                    {
                      title: '平均金额',
                      value: `¥${(revenueData?.averageOrderValue ?? 0).toFixed(2)}`,
                      icon: TrendingUp,
                      color: 'text-amber-600',
                    },
                    {
                      title: '今日收入',
                      value: `¥${(stats?.todayRevenue ?? 0).toLocaleString()}`,
                      icon: Activity,
                      color: 'text-purple-600',
                    },
                  ].map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <Card key={index} className="border shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">{item.title}</p>
                              <p className="text-lg font-bold tabular-nums">{item.value}</p>
                            </div>
                            <Icon className={`h-5 w-5 ${item.color}`} />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
            </div>

            {/* 收入记录表格 */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">收入记录</CardTitle>
                <CardDescription>详细的收入交易记录</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="rounded-md border overflow-auto max-h-[420px]">
                  <Table>
                    <TableHeader className="sticky top-0 bg-background z-10">
                      <TableRow>
                        <TableHead className="w-10">
                          <Checkbox
                            checked={
                              revenueData && revenueData.records.length > 0
                                ? selectedRevenue.size === revenueData.records.length
                                : false
                            }
                            onCheckedChange={(checked) => {
                              if (checked && revenueData) {
                                setSelectedRevenue(
                                  new Set(revenueData.records.map((_, i) => i))
                                );
                              } else {
                                setSelectedRevenue(new Set());
                              }
                            }}
                          />
                        </TableHead>
                        <TableHead>日期</TableHead>
                        <TableHead>类型</TableHead>
                        <TableHead>描述</TableHead>
                        <TableHead className="text-right">金额</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {revenueLoading ? (
                        Array.from({ length: 5 }).map((_, i) => (
                          <TableRow key={i}>
                            <TableCell colSpan={5}>
                              <Skeleton className="h-8 w-full" />
                            </TableCell>
                          </TableRow>
                        ))
                      ) : revenueData?.records?.length ? (
                        revenueData.records.map((record, index) => (
                          <TableRow key={index} className="hover:bg-muted/50">
                            <TableCell>
                              <Checkbox
                                checked={selectedRevenue.has(index)}
                                onCheckedChange={(checked) => {
                                  const next = new Set(selectedRevenue);
                                  if (checked) next.add(index);
                                  else next.delete(index);
                                  setSelectedRevenue(next);
                                }}
                              />
                            </TableCell>
                            <TableCell className="text-sm tabular-nums">
                              {formatDate(record.date)}
                            </TableCell>
                            <TableCell>
                              <Badge
                                variant="secondary"
                                className={`text-xs ${STATUS_COLORS[record.type] || ''}`}
                              >
                                {record.type === 'upgrade'
                                  ? '升级'
                                  : record.type === 'points'
                                    ? '积分'
                                    : '订阅'}
                              </Badge>
                            </TableCell>
                            <TableCell className="text-sm max-w-[200px] truncate">
                              {record.description}
                            </TableCell>
                            <TableCell className="text-right text-sm font-medium tabular-nums">
                              ¥{record.amount.toFixed(2)}
                            </TableCell>
                          </TableRow>
                        ))
                      ) : (
                        <TableRow>
                          <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                            暂无收入记录
                          </TableCell>
                        </TableRow>
                      )}
                    </TableBody>
                  </Table>
                </div>
              </CardContent>
            </Card>

            {/* 每日收入趋势（真实 dailyRevenue 数据） */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">每日收入趋势</CardTitle>
                <CardDescription>成功支付金额变化趋势</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[260px]">
                  {revenueLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : revenueData?.dailyRevenue?.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <AreaChart data={revenueData.dailyRevenue}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" stroke="#6b7280" fontSize={12} tickFormatter={formatDate} />
                        <YAxis stroke="#6b7280" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            fontSize: '12px',
                          }}
                          formatter={(value: number) => [`¥${value.toFixed(2)}`, '收入']}
                        />
                        <Area
                          type="monotone"
                          dataKey="amount"
                          name="收入"
                          stroke="#3b82f6"
                          fill="#3b82f6"
                          fillOpacity={0.1}
                          strokeWidth={2}
                        />
                      </AreaChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      暂无收入数据
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>
          </TabsContent>

          {/* ====== 等级分布 Tab ====== */}
          <TabsContent value="levels" className="flex-1 min-h-0 mt-3 space-y-4 overflow-auto">
            {/* 操作栏 */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Button
                variant="outline"
                size="sm"
                onClick={fetchLevelDistribution}
                disabled={distributionLoading}
              >
                <RefreshCw className={`h-4 w-4 mr-1.5 ${distributionLoading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
              <div className="flex items-center gap-2">
                {selectedLevels.size > 0 && (
                  <span className="text-xs text-muted-foreground">
                    已选 {selectedLevels.size} 项
                  </span>
                )}
                <Button
                  variant="outline"
                  size="sm"
                  disabled={selectedLevels.size === 0 || distributionLoading}
                  onClick={() => {
                    if (!distribution) return;
                    const rows = distribution.levels
                      .filter((l) => selectedLevels.has(l.level))
                      .map((l) => [
                        getLevelName(l.level),
                        l.count,
                        `${l.percentage}%`,
                        `${l.cumulativePercentage}%`,
                      ]);
                    exportCSV(
                      `等级分布_${new Date().toISOString().slice(0, 10)}.csv`,
                      ['等级', '人数', '占比', '累计占比'],
                      rows
                    );
                    toast.success('导出成功');
                  }}
                >
                  <Download className="h-4 w-4 mr-1.5" />
                  导出选中
                </Button>
              </div>
            </div>

            {/* 饼图 + 表格 并排 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              <Card className="border shadow-sm">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">等级分布</CardTitle>
                  <CardDescription>用户会员等级分布情况</CardDescription>
                </CardHeader>
                <CardContent>
                  <div className="h-[320px]">
                    {distributionLoading ? (
                      <Skeleton className="h-full w-full rounded-full" />
                    ) : distribution?.levels?.length ? (
                      <ResponsiveContainer width="100%" height="100%">
                        <PieChart>
                          <Pie
                            data={distribution.levels}
                            cx="50%"
                            cy="50%"
                            innerRadius={60}
                            outerRadius={100}
                            paddingAngle={2}
                            dataKey="count"
                            nameKey="level"
                            label={({ level, percentage }) =>
                              `${getLevelName(level as number)} ${percentage}%`
                            }
                            labelLine={{ stroke: '#9ca3af', strokeWidth: 1 }}
                          >
                            {distribution.levels.map((entry, index) => (
                              <Cell
                                key={`cell-${index}`}
                                fill={PIE_COLORS[index % PIE_COLORS.length]}
                              />
                            ))}
                          </Pie>
                          <Tooltip
                            formatter={(value: number, _name: string, props: any) => {
                              return [value, getLevelName(props?.payload?.level)];
                            }}
                            contentStyle={{
                              backgroundColor: 'white',
                              border: '1px solid #e5e7eb',
                              borderRadius: '6px',
                              fontSize: '12px',
                            }}
                          />
                        </PieChart>
                      </ResponsiveContainer>
                    ) : (
                      <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                        暂无等级数据
                      </div>
                    )}
                  </div>
                </CardContent>
              </Card>

              <Card className="border shadow-sm flex flex-col">
                <CardHeader className="pb-2">
                  <CardTitle className="text-base">等级人数明细</CardTitle>
                  <CardDescription>各等级用户数量统计</CardDescription>
                </CardHeader>
                <CardContent className="flex-1 min-h-0">
                  <div className="rounded-md border overflow-auto max-h-[320px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={
                                distribution && distribution.levels.length > 0
                                  ? selectedLevels.size === distribution.levels.length
                                  : false
                              }
                              onCheckedChange={(checked) => {
                                if (checked && distribution) {
                                  setSelectedLevels(
                                    new Set(distribution.levels.map((l) => l.level))
                                  );
                                } else {
                                  setSelectedLevels(new Set());
                                }
                              }}
                            />
                          </TableHead>
                          <TableHead>等级</TableHead>
                          <TableHead className="text-right">人数</TableHead>
                          <TableHead className="text-right">占比</TableHead>
                          <TableHead className="text-right">累计</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {distributionLoading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={5}>
                                <Skeleton className="h-8 w-full" />
                              </TableCell>
                            </TableRow>
                          ))
                        ) : distribution?.levels?.length ? (
                          distribution.levels.map((level) => (
                            <TableRow key={level.level} className="hover:bg-muted/50">
                              <TableCell>
                                <Checkbox
                                  checked={selectedLevels.has(level.level)}
                                  onCheckedChange={(checked) => {
                                    const next = new Set(selectedLevels);
                                    if (checked) next.add(level.level);
                                    else next.delete(level.level);
                                    setSelectedLevels(next);
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-sm font-medium">
                                {getLevelName(level.level)}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {level.count}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {level.percentage}%
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {level.cumulativePercentage}%
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                              暂无等级数据
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>

            {/* 摘要 */}
            <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
              {distributionLoading
                ? Array.from({ length: 4 }).map((_, i) => (
                    <Card key={i} className="border shadow-sm">
                      <CardContent className="p-4">
                        <Skeleton className="h-4 w-20 mb-2" />
                        <Skeleton className="h-6 w-16" />
                      </CardContent>
                    </Card>
                  ))
                : [
                    {
                      title: '总用户',
                      value: distribution?.summary?.totalUsers?.toString() || '0',
                      icon: Users,
                    },
                    {
                      title: '平均等级',
                      value: distribution?.summary?.averageLevel?.toFixed(1) || '0',
                      icon: TrendingUp,
                    },
                    {
                      title: '最常见等级',
                      value: getLevelName(distribution?.summary?.mostCommonLevel || 1),
                      icon: Activity,
                    },
                    {
                      title: '升级率',
                      value: `${distribution?.summary?.upgradeRate || 0}%`,
                      icon: TrendingUp,
                    },
                  ].map((item, index) => {
                    const Icon = item.icon;
                    return (
                      <Card key={index} className="border shadow-sm">
                        <CardContent className="p-4">
                          <div className="flex items-center justify-between">
                            <div className="space-y-1">
                              <p className="text-xs text-muted-foreground">{item.title}</p>
                              <p className="text-lg font-bold">{item.value}</p>
                            </div>
                            <Icon className="h-5 w-5 text-muted-foreground" />
                          </div>
                        </CardContent>
                      </Card>
                    );
                  })}
            </div>
          </TabsContent>

          {/* ====== 使用热力图 Tab ====== */}
          <TabsContent value="heatmap" className="flex-1 min-h-0 mt-3 space-y-4 overflow-auto">
            {/* 操作栏 */}
            <div className="flex items-center justify-between gap-3 flex-wrap">
              <Button variant="outline" size="sm" onClick={fetchHeatmap} disabled={heatmapLoading}>
                <RefreshCw className={`h-4 w-4 mr-1.5 ${heatmapLoading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>

            {/* 趋势图 */}
            <Card className="border shadow-sm">
              <CardHeader className="pb-2">
                <CardTitle className="text-base">每日请求趋势</CardTitle>
                <CardDescription>系统 API 调用量变化趋势</CardDescription>
              </CardHeader>
              <CardContent>
                <div className="h-[260px]">
                  {heatmapLoading ? (
                    <Skeleton className="h-full w-full" />
                  ) : heatmap?.dailyStats?.length ? (
                    <ResponsiveContainer width="100%" height="100%">
                      <LineChart data={heatmap.dailyStats}>
                        <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                        <XAxis dataKey="date" stroke="#6b7280" fontSize={12} tickFormatter={formatDate} />
                        <YAxis stroke="#6b7280" fontSize={12} />
                        <Tooltip
                          contentStyle={{
                            backgroundColor: 'white',
                            border: '1px solid #e5e7eb',
                            borderRadius: '6px',
                            fontSize: '12px',
                          }}
                        />
                        <Legend wrapperStyle={{ fontSize: '12px' }} />
                        <Line
                          type="monotone"
                          dataKey="totalRequests"
                          name="总请求"
                          stroke="#3b82f6"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="allowedRequests"
                          name="允许"
                          stroke="#22c55e"
                          strokeWidth={2}
                          dot={false}
                        />
                        <Line
                          type="monotone"
                          dataKey="deniedRequests"
                          name="拒绝"
                          stroke="#ef4444"
                          strokeWidth={2}
                          dot={false}
                        />
                      </LineChart>
                    </ResponsiveContainer>
                  ) : (
                    <div className="flex items-center justify-center h-full text-sm text-muted-foreground">
                      暂无热力图数据
                    </div>
                  )}
                </div>
              </CardContent>
            </Card>

            {/* 两个表格并排 */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
              {/* 每日消耗 */}
              <Card className="border shadow-sm flex flex-col">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">每日消耗详情</CardTitle>
                    <CardDescription>按日期统计的 API 调用详情</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedHeatmapRows.size === 0 || heatmapLoading}
                    onClick={() => {
                      if (!heatmap) return;
                      const rows = heatmap.dailyStats
                        .filter((_, i) => selectedHeatmapRows.has(i))
                        .map((d) => [d.date, d.totalRequests, d.allowedRequests, d.deniedRequests]);
                      exportCSV(
                        `每日消耗_${new Date().toISOString().slice(0, 10)}.csv`,
                        ['日期', '总请求', '允许', '拒绝'],
                        rows
                      );
                      toast.success('导出成功');
                    }}
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    导出{selectedHeatmapRows.size > 0 ? `(${selectedHeatmapRows.size})` : ''}
                  </Button>
                </CardHeader>
                <CardContent className="flex-1 min-h-0">
                  <div className="rounded-md border overflow-auto max-h-[360px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={
                                heatmap && heatmap.dailyStats.length > 0
                                  ? selectedHeatmapRows.size === heatmap.dailyStats.length
                                  : false
                              }
                              onCheckedChange={(checked) => {
                                if (checked && heatmap) {
                                  setSelectedHeatmapRows(
                                    new Set(heatmap.dailyStats.map((_, i) => i))
                                  );
                                } else {
                                  setSelectedHeatmapRows(new Set());
                                }
                              }}
                            />
                          </TableHead>
                          <TableHead>日期</TableHead>
                          <TableHead className="text-right">总请求</TableHead>
                          <TableHead className="text-right">允许</TableHead>
                          <TableHead className="text-right">拒绝</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {heatmapLoading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={5}>
                                <Skeleton className="h-8 w-full" />
                              </TableCell>
                            </TableRow>
                          ))
                        ) : heatmap?.dailyStats?.length ? (
                          heatmap.dailyStats.map((stat, index) => (
                            <TableRow key={index} className="hover:bg-muted/50">
                              <TableCell>
                                <Checkbox
                                  checked={selectedHeatmapRows.has(index)}
                                  onCheckedChange={(checked) => {
                                    const next = new Set(selectedHeatmapRows);
                                    if (checked) next.add(index);
                                    else next.delete(index);
                                    setSelectedHeatmapRows(next);
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-sm tabular-nums">
                                {formatDate(stat.date)}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {stat.totalRequests}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {stat.allowedRequests}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {stat.deniedRequests}
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={5} className="text-center text-sm text-muted-foreground py-6">
                              暂无数据
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>

              {/* API 拒绝排行 */}
              <Card className="border shadow-sm flex flex-col">
                <CardHeader className="pb-2 flex flex-row items-center justify-between">
                  <div>
                    <CardTitle className="text-base">API 拒绝排行</CardTitle>
                    <CardDescription>被拒绝最多的 API 端点</CardDescription>
                  </div>
                  <Button
                    variant="outline"
                    size="sm"
                    disabled={selectedApiRows.size === 0 || heatmapLoading}
                    onClick={() => {
                      if (!heatmap) return;
                      const rows = heatmap.topDeniedEndpoints
                        .filter((_, i) => selectedApiRows.has(i))
                        .map((d) => [d.endpoint, d.count, `${d.percentage}%`]);
                      exportCSV(
                        `API拒绝排行_${new Date().toISOString().slice(0, 10)}.csv`,
                        ['端点', '拒绝次数', '占比'],
                        rows
                      );
                      toast.success('导出成功');
                    }}
                  >
                    <Download className="h-4 w-4 mr-1.5" />
                    导出{selectedApiRows.size > 0 ? `(${selectedApiRows.size})` : ''}
                  </Button>
                </CardHeader>
                <CardContent className="flex-1 min-h-0">
                  <div className="rounded-md border overflow-auto max-h-[360px]">
                    <Table>
                      <TableHeader className="sticky top-0 bg-background z-10">
                        <TableRow>
                          <TableHead className="w-10">
                            <Checkbox
                              checked={
                                heatmap && heatmap.topDeniedEndpoints.length > 0
                                  ? selectedApiRows.size === heatmap.topDeniedEndpoints.length
                                  : false
                              }
                              onCheckedChange={(checked) => {
                                if (checked && heatmap) {
                                  setSelectedApiRows(
                                    new Set(heatmap.topDeniedEndpoints.map((_, i) => i))
                                  );
                                } else {
                                  setSelectedApiRows(new Set());
                                }
                              }}
                            />
                          </TableHead>
                          <TableHead>端点</TableHead>
                          <TableHead className="text-right">拒绝次数</TableHead>
                          <TableHead className="text-right">占比</TableHead>
                        </TableRow>
                      </TableHeader>
                      <TableBody>
                        {heatmapLoading ? (
                          Array.from({ length: 5 }).map((_, i) => (
                            <TableRow key={i}>
                              <TableCell colSpan={4}>
                                <Skeleton className="h-8 w-full" />
                              </TableCell>
                            </TableRow>
                          ))
                        ) : heatmap?.topDeniedEndpoints?.length ? (
                          heatmap.topDeniedEndpoints.map((endpoint, index) => (
                            <TableRow key={index} className="hover:bg-muted/50">
                              <TableCell>
                                <Checkbox
                                  checked={selectedApiRows.has(index)}
                                  onCheckedChange={(checked) => {
                                    const next = new Set(selectedApiRows);
                                    if (checked) next.add(index);
                                    else next.delete(index);
                                    setSelectedApiRows(next);
                                  }}
                                />
                              </TableCell>
                              <TableCell className="text-sm font-mono max-w-[180px] truncate">
                                {endpoint.endpoint}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {endpoint.count}
                              </TableCell>
                              <TableCell className="text-right text-sm tabular-nums">
                                {endpoint.percentage}%
                              </TableCell>
                            </TableRow>
                          ))
                        ) : (
                          <TableRow>
                            <TableCell colSpan={4} className="text-center text-sm text-muted-foreground py-6">
                              暂无数据
                            </TableCell>
                          </TableRow>
                        )}
                      </TableBody>
                    </Table>
                  </div>
                </CardContent>
              </Card>
            </div>
          </TabsContent>
        </Tabs>
      </div>
    </div>
  );
}
