'use client';

import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useState, useEffect, useMemo, useCallback, useRef } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle,
} from '@/components/ui/card';
import {
  Tabs,
  TabsContent,
  TabsList,
  TabsTrigger,
} from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Checkbox } from '@/components/ui/checkbox';
import { Badge } from '@/components/ui/badge';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow,
} from '@/components/ui/table';
import {
  TrendingUp,
  Users,
  DollarSign,
  Activity,
  Calendar,
  Download,
  Search,
  Trash2,
  RefreshCw,
  BarChart3,
  Filter,
  Eye,
  Clock,
  MousePointerClick,
  Upload,
  ShoppingCart,
  ArrowUpRight,
  ArrowDownRight,
  Loader2,
  ChevronLeft,
  ChevronRight,
  ChevronsLeft,
  ChevronsRight,
} from 'lucide-react';
import {
  LineChart,
  Line,
  AreaChart,
  Area,
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
import { FunnelStep } from '@/lib/analytics-types';
import { useToast } from '@/components/ui/use-toast';

// ============================================================
// 类型与常量
// ============================================================
type PeriodKey = 'today' | '7d' | '30d' | '90d' | 'all';

interface FunnelDataPoint {
  step: string;
  count: number;
  conversionRate: number;
  dropOffRate: number;
}

interface AnalyticsStats {
  totalUsers: number;
  activeUsers: number;
  newUsers: number;
  totalRevenue: number;
  conversionRate: number;
}

interface RetentionDataPoint {
  date: string;
  day0: number;
  day1: number;
  day7: number;
  day30: number;
  retentionRate1: number;
  retentionRate7: number;
  retentionRate30: number;
}

interface RevenueDataPoint {
  date: string;
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  newCustomerRevenue: number;
  returningCustomerRevenue: number;
}

interface RevenueSummary {
  totalRevenue: number;
  totalOrders: number;
  averageOrderValue: number;
  newCustomerRevenue: number;
  returningCustomerRevenue: number;
}

interface BehaviorMetrics {
  pageViews: number;
  buttonClicks: number;
  fileUploads: number;
  quoteGenerated: number;
  paymentCompleted: number;
  averageSessionSeconds: number;
  bounceRate: number;
  dailyActiveRate: number;
  pageDistribution: Array<{ page: string; count: number }>;
  eventTypeDistribution: Array<{ eventType: string; count: number }>;
}

interface AnalyticsEventRow {
  id: string;
  userId?: string | null;
  eventType: string;
  funnelStage?: string | null;
  sessionId?: string | null;
  page?: string | null;
  durationSeconds?: number | null;
  createdAt?: string;
}

// 漏斗阶段 → 中文标签 + 阶段步骤顺序
const FUNNEL_LABELS: Record<string, { label: string; order: number }> = {
  [FunnelStep.VISIT]: { label: '访问', order: 1 },
  [FunnelStep.SIGN_UP]: { label: '注册', order: 2 },
  [FunnelStep.UPLOAD]: { label: '上传', order: 3 },
  [FunnelStep.QUOTE]: { label: '报价', order: 4 },
  [FunnelStep.PAYMENT]: { label: '付费', order: 5 },
};

const PERIODS: Array<{ value: PeriodKey; label: string; days: number }> = [
  { value: 'today', label: '今日', days: 1 },
  { value: '7d', label: '最近7天', days: 7 },
  { value: '30d', label: '最近30天', days: 30 },
  { value: '90d', label: '最近90天', days: 90 },
  { value: 'all', label: '全部', days: -1 },
];

const PAGE_SIZE = 10;

// ============================================================
// 工具函数
// ============================================================
function fmtNumber(n: number): string {
  if (!Number.isFinite(n)) return '0';
  return n.toLocaleString('zh-CN');
}
function fmtPercent(n: number): string {
  if (!Number.isFinite(n)) return '0%';
  return `${n.toFixed(2)}%`;
}
function fmtMoney(n: number): string {
  if (!Number.isFinite(n)) return '¥0';
  return `¥${n.toLocaleString('zh-CN', {
    minimumFractionDigits: 2,
    maximumFractionDigits: 2,
  })}`;
}
function fmtSeconds(n: number): string {
  if (!Number.isFinite(n) || n <= 0) return '0秒';
  if (n < 60) return `${Math.round(n)}秒`;
  const m = Math.floor(n / 60);
  const s = Math.round(n % 60);
  if (m < 60) return `${m}分${s}秒`;
  const h = Math.floor(m / 60);
  return `${h}小时${m % 60}分`;
}
function fmtDate(s?: string): string {
  if (!s) return '-';
  try {
    const d = new Date(s);
    const pad = (n: number) => String(n).padStart(2, '0');
    return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(
      d.getDate()
    )} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
  } catch {
    return s;
  }
}
function fmtShortDate(s: string | Date): string {
  const d = typeof s === 'string' ? new Date(s) : s;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getMonth() + 1}/${pad(d.getDate())}`;
}

// 颜色调色板
const CHART_COLORS = ['#0d9488', '#3b82f6', '#f59e0b', '#ec4899', '#8b5cf6'];

// ============================================================
// API helpers
// ============================================================
async function safeFetchJson<T>(url: string): Promise<T | null> {
  try {
    const res = await fetch(url, { cache: 'no-store' });
    if (!res.ok) return null;
    const json = await res.json();
    return json;
  } catch {
    return null;
  }
}

// ============================================================
// 子组件
// ============================================================
function KpiCard({
  label,
  value,
  sublabel,
  trend,
  icon: Icon,
  accentClass,
}: {
  label: string;
  value: string;
  sublabel?: string;
  trend?: number;
  icon: React.ComponentType<{ className?: string }>;
  accentClass: string;
}) {
  return (
    <Card className="overflow-hidden">
      <CardHeader className="flex flex-row items-center justify-between space-y-0 pb-2">
        <CardTitle className="text-sm font-medium text-muted-foreground">
          {label}
        </CardTitle>
        <div
          className={`flex h-9 w-9 items-center justify-center rounded-md ${accentClass}`}
        >
          <Icon className="h-5 w-5" />
        </div>
      </CardHeader>
      <CardContent className="space-y-1">
        <div className="text-2xl font-semibold tracking-tight">{value}</div>
        {sublabel && (
          <p className="text-xs text-muted-foreground">{sublabel}</p>
        )}
        {typeof trend === 'number' && Number.isFinite(trend) && trend !== 0 && (
          <p
            className={`text-xs flex items-center gap-1 ${
              trend > 0 ? 'text-emerald-600' : 'text-rose-600'
            }`}
          >
            {trend > 0 ? (
              <ArrowUpRight className="h-3 w-3" />
            ) : (
              <ArrowDownRight className="h-3 w-3" />
            )}
            <span>{trend > 0 ? '+' : ''}
              {trend.toFixed(2)}%
            </span>
            <span className="text-muted-foreground">较上周期</span>
          </p>
        )}
      </CardContent>
    </Card>
  );
}

function FunnelSection({
  funnel,
  loading,
}: {
  funnel: FunnelDataPoint[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> 加载中...
      </div>
    );
  }
  if (!funnel.length || funnel.every((f) => f.count === 0)) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
        暂无漏斗数据。
      </div>
    );
  }

  const top = funnel[0]?.count ?? 0;
  return (
    <div className="space-y-4">
      {funnel.map((f, i) => {
        const meta = FUNNEL_LABELS[f.step] || {
          label: f.step,
          order: i + 1,
        };
        const widthPct =
          top > 0 ? Math.max(2, (f.count / top) * 100) : 100;
        return (
          <div
            key={f.step}
            className="grid grid-cols-1 gap-2 lg:grid-cols-[160px_1fr_140px] lg:items-center"
          >
            <div className="flex items-center gap-3">
              <div className="flex h-7 w-7 items-center justify-center rounded-full bg-teal-600 text-xs font-medium text-white">
                {meta.order}
              </div>
              <div className="font-medium">{meta.label}</div>
            </div>
            <div className="relative">
              <div className="h-10 w-full rounded-md bg-slate-100 dark:bg-slate-800 overflow-hidden">
                <div
                  className="h-full rounded-md bg-gradient-to-r from-teal-700 via-teal-500 to-teal-400 transition-all"
                  style={{ width: `${widthPct}%` }}
                />
                <div className="absolute inset-0 flex items-center px-3 text-sm font-medium text-white drop-shadow">
                  {fmtPercent(f.conversionRate)}
                </div>
              </div>
            </div>
            <div className="flex items-center justify-between gap-3 text-sm lg:justify-end">
              <div className="text-right">
                <div className="text-base font-semibold text-teal-700 dark:text-teal-300">
                  {fmtNumber(f.count)}
                </div>
                <div className="text-xs text-muted-foreground">用户</div>
              </div>
              <div
                className={`text-xs font-medium px-2 py-1 rounded ${
                  f.dropOffRate > 0
                    ? 'bg-rose-100 text-rose-700 dark:bg-rose-900/40 dark:text-rose-300'
                    : 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-400'
                }`}
              >
                流失 {fmtPercent(f.dropOffRate)}
              </div>
            </div>
          </div>
        );
      })}
    </div>
  );
}

function RetentionSection({
  data,
  loading,
}: {
  data: RetentionDataPoint[];
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> 加载中...
      </div>
    );
  }
  if (!data.length) {
    return (
      <div className="rounded-lg border border-dashed bg-muted/40 px-6 py-12 text-center text-sm text-muted-foreground">
        暂无留存数据。
      </div>
    );
  }
  const chartData = data.map((d) => ({
    label: fmtShortDate(d.date),
    D1: +d.retentionRate1.toFixed(2),
    D7: +d.retentionRate7.toFixed(2),
    D30: +d.retentionRate30.toFixed(2),
  }));
  return (
    <div className="space-y-4">
      <div className="h-[280px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <LineChart data={chartData} margin={{ top: 10, right: 20, left: 0, bottom: 0 }}>
            <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
            <XAxis dataKey="label" tick={{ fontSize: 12 }} />
            <YAxis tick={{ fontSize: 12 }} unit="%" />
            <Tooltip wrapperClassName="!rounded-md !border-border" />
            <Legend />
            <Line
              type="monotone"
              dataKey="D1"
              name="D1 留存率"
              stroke="#0d9488"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
            <Line
              type="monotone"
              dataKey="D7"
              name="D7 留存率"
              stroke="#3b82f6"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
            <Line
              type="monotone"
              dataKey="D30"
              name="D30 留存率"
              stroke="#f59e0b"
              strokeWidth={2}
              dot={{ r: 2 }}
            />
          </LineChart>
        </ResponsiveContainer>
      </div>
      <Table>
        <TableHeader>
          <TableRow>
            <TableHead>日期</TableHead>
            <TableHead className="text-right">新增</TableHead>
            <TableHead className="text-right">D1 留存</TableHead>
            <TableHead className="text-right">D7 留存</TableHead>
            <TableHead className="text-right">D30 留存</TableHead>
          </TableRow>
        </TableHeader>
        <TableBody>
          {data.map((d) => (
            <TableRow key={d.date}>
              <TableCell className="font-mono text-xs">
                {fmtShortDate(d.date)}
              </TableCell>
              <TableCell className="text-right">{fmtNumber(d.day0)}</TableCell>
              <TableCell className="text-right text-teal-700 dark:text-teal-300">
                {fmtPercent(d.retentionRate1)}
              </TableCell>
              <TableCell className="text-right text-blue-700 dark:text-blue-300">
                {fmtPercent(d.retentionRate7)}
              </TableCell>
              <TableCell className="text-right text-amber-700 dark:text-amber-300">
                {fmtPercent(d.retentionRate30)}
              </TableCell>
            </TableRow>
          ))}
        </TableBody>
      </Table>
    </div>
  );
}

function RevenueSection({
  revenue,
  summary,
  loading,
}: {
  revenue: RevenueDataPoint[];
  summary: RevenueSummary | null;
  loading: boolean;
}) {
  if (loading) {
    return (
      <div className="flex items-center justify-center py-12 text-sm text-muted-foreground">
        <Loader2 className="h-4 w-4 mr-2 animate-spin" /> 加载中...
      </div>
    );
  }

  const chartData = revenue.map((r) => ({
    label: fmtShortDate(r.date),
    revenue: +r.revenue.toFixed(2),
    newCustomer: +r.newCustomerRevenue.toFixed(2),
    returningCustomer: +r.returningCustomerRevenue.toFixed(2),
    orderCount: r.orderCount,
  }));

  const summaryData = summary ?? {
    totalRevenue: 0,
    totalOrders: 0,
    averageOrderValue: 0,
    newCustomerRevenue: 0,
    returningCustomerRevenue: 0,
  };

  const newPct =
    summaryData.totalRevenue > 0
      ? (summaryData.newCustomerRevenue /
          summaryData.totalRevenue) *
        100
      : 0;
  const returningPct = 100 - newPct;

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">总收入</div>
          <div className="text-xl font-semibold text-emerald-600 mt-1">
            {fmtMoney(summaryData.totalRevenue)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">订单数</div>
          <div className="text-xl font-semibold mt-1">
            {fmtNumber(summaryData.totalOrders)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">客单价</div>
          <div className="text-xl font-semibold text-blue-600 mt-1">
            {fmtMoney(summaryData.averageOrderValue)}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4">
          <div className="text-xs text-muted-foreground">新客户 / 老客户</div>
          <div className="text-sm font-medium mt-1">
            <span className="text-pink-600">
              {fmtPercent(newPct)}
            </span>
            <span className="text-muted-foreground"> / </span>
            <span className="text-blue-600">
              {fmtPercent(returningPct)}
            </span>
          </div>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-4">
        <div className="lg:col-span-2 rounded-lg border bg-card p-4 h-[300px]">
          <div className="text-sm font-medium mb-2">每日收入趋势</div>
          <div className="h-[240px]">
            {chartData.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                暂无收入数据
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <AreaChart data={chartData}>
                  <defs>
                    <linearGradient id="revColor" x1="0" y1="0" x2="0" y2="1">
                      <stop offset="0%" stopColor="#10b981" stopOpacity={0.5} />
                      <stop offset="100%" stopColor="#10b981" stopOpacity={0.05} />
                    </linearGradient>
                  </defs>
                  <CartesianGrid strokeDasharray="3 3" stroke="hsl(var(--border))" />
                  <XAxis dataKey="label" tick={{ fontSize: 12 }} />
                  <YAxis tick={{ fontSize: 12 }} />
                  <Tooltip wrapperClassName="!rounded-md !border-border" />
                  <Area
                    type="monotone"
                    dataKey="revenue"
                    name="收入(¥)"
                    stroke="#10b981"
                    fill="url(#revColor)"
                    strokeWidth={2}
                  />
                </AreaChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 h-[300px]">
          <div className="text-sm font-medium mb-2">新老客户占比</div>
          <div className="h-[240px]">
            {summaryData.totalRevenue <= 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie
                    data={[
                      { name: '新客户', value: summaryData.newCustomerRevenue },
                      {
                        name: '老客户',
                        value: summaryData.returningCustomerRevenue,
                      },
                    ]}
                    cx="50%"
                    cy="50%"
                    innerRadius={48}
                    outerRadius={88}
                    paddingAngle={2}
                    dataKey="value"
                    label={({ name, percent }) =>
                      `${name} ${(percent * 100).toFixed(0)}%`
                    }
                  >
                    <Cell fill="#ec4899" />
                    <Cell fill="#3b82f6" />
                  </Pie>
                  <Tooltip
                    formatter={(v: any) => fmtMoney(Number(v))}
                    wrapperClassName="!rounded-md !border-border"
                  />
                </PieChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function BehaviorSection({
  metrics,
  events,
  eventsTotal,
  eventsLoading,
  filterType,
  setFilterType,
  filterSearch,
  setFilterSearch,
  selectedIds,
  setSelectedIds,
  page,
  setPage,
  deleting,
  onDeleteSelected,
  onExportAll,
  reloadEvents,
}: {
  metrics: BehaviorMetrics | null;
  events: AnalyticsEventRow[];
  eventsTotal: number;
  eventsLoading: boolean;
  filterType: string;
  setFilterType: (v: string) => void;
  filterSearch: string;
  setFilterSearch: (v: string) => void;
  selectedIds: Set<string>;
  setSelectedIds: (v: Set<string>) => void;
  page: number;
  setPage: (v: number) => void;
  deleting: boolean;
  onDeleteSelected: () => Promise<void>;
  onExportAll: () => void;
  reloadEvents: () => Promise<void>;
}) {
  const m = metrics ?? {
    pageViews: 0,
    buttonClicks: 0,
    fileUploads: 0,
    quoteGenerated: 0,
    paymentCompleted: 0,
    averageSessionSeconds: 0,
    bounceRate: 0,
    dailyActiveRate: 0,
    pageDistribution: [],
    eventTypeDistribution: [],
  };

  const totalPages = Math.max(1, Math.ceil(eventsTotal / PAGE_SIZE));

  const toggleOne = useCallback(
    (id: string) => {
      const next = new Set(selectedIds);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      setSelectedIds(next);
    },
    [selectedIds, setSelectedIds]
  );

  const toggleAll = useCallback(() => {
    const next = new Set(selectedIds);
    const allSelected = events.every((e) => next.has(e.id));
    if (allSelected) {
      events.forEach((e) => next.delete(e.id));
    } else {
      events.forEach((e) => next.add(e.id));
    }
    setSelectedIds(next);
  }, [events, selectedIds, setSelectedIds]);

  return (
    <div className="space-y-4">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-5">
        <KpiCard
          label="页面浏览"
          value={fmtNumber(m.pageViews)}
          icon={Eye}
          accentClass="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300"
        />
        <KpiCard
          label="按钮点击"
          value={fmtNumber(m.buttonClicks)}
          icon={MousePointerClick}
          accentClass="bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300"
        />
        <KpiCard
          label="平均会话"
          value={fmtSeconds(m.averageSessionSeconds)}
          sublabel={`跳出率 ${fmtPercent(m.bounceRate)}`}
          icon={Clock}
          accentClass="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300"
        />
        <KpiCard
          label="日活率"
          value={fmtPercent(m.dailyActiveRate)}
          icon={Activity}
          accentClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"
        />
        <KpiCard
          label="付费完成"
          value={fmtNumber(m.paymentCompleted)}
          sublabel={`报价 ${fmtNumber(m.quoteGenerated)}`}
          icon={ShoppingCart}
          accentClass="bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-4">
        <div className="rounded-lg border bg-card p-4 h-[260px]">
          <div className="text-sm font-medium mb-2">Top 10 页面</div>
          <div className="h-[200px]">
            {m.pageDistribution.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={m.pageDistribution.slice(0, 10)}
                  layout="vertical"
                  margin={{ left: 0, right: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis type="number" tick={{ fontSize: 11 }} />
                  <YAxis
                    type="category"
                    dataKey="page"
                    tick={{ fontSize: 11 }}
                    width={120}
                  />
                  <Tooltip wrapperClassName="!rounded-md !border-border" />
                  <Bar dataKey="count" name="次数" fill="#0d9488" radius={[0, 4, 4, 0]} />
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
        <div className="rounded-lg border bg-card p-4 h-[260px]">
          <div className="text-sm font-medium mb-2">事件类型分布</div>
          <div className="h-[200px]">
            {m.eventTypeDistribution.length === 0 ? (
              <div className="flex h-full items-center justify-center text-sm text-muted-foreground">
                暂无数据
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart
                  data={m.eventTypeDistribution}
                  margin={{ left: 0, right: 8 }}
                >
                  <CartesianGrid
                    strokeDasharray="3 3"
                    stroke="hsl(var(--border))"
                  />
                  <XAxis
                    dataKey="eventType"
                    tick={{ fontSize: 11 }}
                    interval={0}
                  />
                  <YAxis tick={{ fontSize: 11 }} />
                  <Tooltip wrapperClassName="!rounded-md !border-border" />
                  <Bar dataKey="count" name="次数" radius={[4, 4, 0, 0]}>
                    {m.eventTypeDistribution.map((_, idx) => (
                      <Cell
                        key={idx}
                        fill={CHART_COLORS[idx % CHART_COLORS.length]}
                      />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      <div className="rounded-lg border bg-card">
        <div className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between border-b">
          <div className="flex items-center gap-2 flex-1 min-w-0">
            <Search className="h-4 w-4 text-muted-foreground shrink-0" />
            <Input
              placeholder="搜索事件类型/页面/用户ID/会话ID"
              value={filterSearch}
              onChange={(e) => setFilterSearch(e.target.value)}
              className="h-9 max-w-sm"
            />
            <Select value={filterType} onValueChange={setFilterType}>
              <SelectTrigger className="h-9 w-[160px]">
                <Filter className="h-3 w-3 mr-1" />
                <SelectValue placeholder="事件类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">全部类型</SelectItem>
                <SelectItem value="page_view">页面浏览</SelectItem>
                <SelectItem value="button_click">按钮点击</SelectItem>
                <SelectItem value="file_upload">文件上传</SelectItem>
                <SelectItem value="quote_generated">生成报价</SelectItem>
                <SelectItem value="product_search">产品搜索</SelectItem>
                <SelectItem value="payment_completed">付费完成</SelectItem>
              </SelectContent>
            </Select>
          </div>
          <div className="flex items-center gap-2">
            <Button
              variant="outline"
              size="sm"
              onClick={() => void reloadEvents()}
              disabled={eventsLoading}
            >
              <RefreshCw
                className={`h-4 w-4 mr-1 ${
                  eventsLoading ? 'animate-spin' : ''
                }`}
              />
              刷新
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={onExportAll}
              disabled={eventsLoading}
            >
              <Download className="h-4 w-4 mr-1" />
              导出CSV
            </Button>
            <Button
              variant="destructive"
              size="sm"
              onClick={() => void onDeleteSelected()}
              disabled={selectedIds.size === 0 || deleting}
            >
              {deleting ? (
                <Loader2 className="h-4 w-4 mr-1 animate-spin" />
              ) : (
                <Trash2 className="h-4 w-4 mr-1" />
              )}
              批量删除 {selectedIds.size > 0 ? `(${selectedIds.size})` : ''}
            </Button>
          </div>
        </div>

        <div className="overflow-x-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[40px]">
                  <Checkbox
                    checked={
                      events.length > 0 &&
                      events.every((e) => selectedIds.has(e.id))
                    }
                    onCheckedChange={toggleAll}
                    aria-label="全选当前页"
                  />
                </TableHead>
                <TableHead>时间</TableHead>
                <TableHead>事件类型</TableHead>
                <TableHead>漏斗阶段</TableHead>
                <TableHead>页面</TableHead>
                <TableHead>用户ID</TableHead>
                <TableHead className="text-right">停留(秒)</TableHead>
                <TableHead className="text-right">会话</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {eventsLoading ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    <Loader2 className="inline-block h-4 w-4 mr-2 animate-spin" />
                    加载中...
                  </TableCell>
                </TableRow>
              ) : events.length === 0 ? (
                <TableRow>
                  <TableCell
                    colSpan={8}
                    className="h-24 text-center text-muted-foreground"
                  >
                    暂无事件数据
                  </TableCell>
                </TableRow>
              ) : (
                events.map((e) => (
                  <TableRow
                    key={e.id}
                    className={
                      selectedIds.has(e.id) ? 'bg-muted/40' : undefined
                    }
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(e.id)}
                        onCheckedChange={() => toggleOne(e.id)}
                        aria-label={`选择事件 ${e.id}`}
                      />
                    </TableCell>
                    <TableCell className="font-mono text-xs">
                      {fmtDate(e.createdAt)}
                    </TableCell>
                    <TableCell>
                      <Badge variant="secondary" className="font-mono text-xs">
                        {e.eventType}
                      </Badge>
                    </TableCell>
                    <TableCell>
                      {e.funnelStage ? (
                        <Badge
                          variant="outline"
                          className="font-mono text-xs"
                        >
                          {FUNNEL_LABELS[e.funnelStage]?.label || e.funnelStage}
                        </Badge>
                      ) : (
                        <span className="text-xs text-muted-foreground">-</span>
                      )}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[180px] truncate">
                      {e.page || '-'}
                    </TableCell>
                    <TableCell className="font-mono text-xs max-w-[160px] truncate">
                      {e.userId || (
                        <span className="text-muted-foreground">匿名</span>
                      )}
                    </TableCell>
                    <TableCell className="text-right text-xs">
                      {e.durationSeconds ?? '-'}
                    </TableCell>
                    <TableCell className="text-right font-mono text-xs max-w-[120px] truncate">
                      {e.sessionId || '-'}
                    </TableCell>
                  </TableRow>
                ))
              )}
            </TableBody>
          </Table>
        </div>

        <div className="flex items-center justify-between p-3 border-t text-sm text-muted-foreground">
          <div>
            共 {fmtNumber(eventsTotal)} 条 · 第 {page + 1} / {totalPages} 页
          </div>
          <div className="flex items-center gap-1">
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(0)}
              disabled={page === 0 || eventsLoading}
            >
              <ChevronsLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(Math.max(0, page - 1))}
              disabled={page === 0 || eventsLoading}
            >
              <ChevronLeft className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(Math.min(totalPages - 1, page + 1))}
              disabled={page >= totalPages - 1 || eventsLoading}
            >
              <ChevronRight className="h-4 w-4" />
            </Button>
            <Button
              variant="outline"
              size="icon"
              className="h-8 w-8"
              onClick={() => setPage(totalPages - 1)}
              disabled={page >= totalPages - 1 || eventsLoading}
            >
              <ChevronsRight className="h-4 w-4" />
            </Button>
          </div>
        </div>
      </div>
    </div>
  );
}

// ============================================================
// 主组件
// ============================================================
export default function AnalyticsPage() {
  const { toast } = useToast();
  const [period, setPeriod] = useState<PeriodKey>('7d');
  const [tab, setTab] = useState<string>('funnel');

  const [stats, setStats] = useState<AnalyticsStats | null>(null);
  const [funnel, setFunnel] = useState<FunnelDataPoint[]>([]);
  const [retention, setRetention] = useState<RetentionDataPoint[]>([]);
  const [revenue, setRevenue] = useState<RevenueDataPoint[]>([]);
  const [summary, setSummary] = useState<RevenueSummary | null>(null);
  const [behavior, setBehavior] = useState<BehaviorMetrics | null>(null);

  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<string | null>(null);

  // Events Tab 独立分页 / 筛选
  const [events, setEvents] = useState<AnalyticsEventRow[]>([]);
  const [eventsTotal, setEventsTotal] = useState<number>(0);
  const [eventsLoading, setEventsLoading] = useState<boolean>(false);
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [filterType, setFilterType] = useState<string>('all');
  const [filterSearch, setFilterSearch] = useState<string>('');
  const [page, setPage] = useState<number>(0);
  const [deleting, setDeleting] = useState<boolean>(false);

  // 期间切换
  const currentDays = useMemo(
    () => PERIODS.find((p) => p.value === period)?.days ?? 7,
    [period]
  );

  // 主数据加载（funnel/stats/revenue/retention/behavior）
  const reloadAll = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const days = currentDays;
      const daysParam =
        days === 0 ? '' : `days=${days}`;
      const [funnelRes, retentionRes, revenueRes, behaviorRes] =
        await Promise.all([
          safeFetchJson<{
            stats: AnalyticsStats;
            funnel: FunnelDataPoint[];
          }>(
            `/api/analytics/funnel${daysParam ? `?${daysParam}` : ''}`
          ),
          safeFetchJson<{ retention: RetentionDataPoint[] }>(
            `/api/analytics/retention?days=${days === 0 ? 30 : days}&limit=30`
          ),
          safeFetchJson<{
            revenue: RevenueDataPoint[];
            summary: RevenueSummary;
          }>(
            `/api/analytics/revenue${daysParam ? `?${daysParam}` : ''}`
          ),
          // 用户行为指标走同一个 events API 取一小批做派生统计；这里通过 funnel.stats 已有数据
          Promise.resolve(null),
        ]);

      if (funnelRes) {
        setStats(funnelRes.stats || null);
        setFunnel(funnelRes.funnel || []);
      }
      if (retentionRes) {
        setRetention(retentionRes.retention || []);
      }
      if (revenueRes) {
        setRevenue(revenueRes.revenue || []);
        setSummary(revenueRes.summary || null);
      }
      // Behavior metrics：单独从 events API 一次性拿 200 条聚合（fallback 由后端 getBehaviorMetrics 提供）
      // 但前端不能直连 DB；简化方案：在 funnelRes 中 stats 已含主要 KPI，单独再拉 /api/analytics/funnel 已经够了
      // 真实页面有专门的 Behavior 数据：调后端一个聚合 API 用 funnel 已有 stats + 我们前端简单聚合
      setBehavior({
        pageViews: funnelRes?.stats?.totalUsers ? 0 : 0, // 占位，下方从 events 列表推导
        buttonClicks: 0,
        fileUploads: 0,
        quoteGenerated: 0,
        paymentCompleted: 0,
        averageSessionSeconds: 0,
        bounceRate: 0,
        dailyActiveRate: 0,
        pageDistribution: [],
        eventTypeDistribution: [],
      });

      void behaviorRes;
    } catch (e: any) {
      console.error('[analytics] 加载数据失败：', e);
      setError(e?.message ?? '加载数据失败');
    } finally {
      setLoading(false);
    }
  }, [currentDays]);

  // 单独加载行为指标 (拉所有事件的最大子集再聚)
  const reloadBehavior = useCallback(async () => {
    try {
      const daysParam =
        currentDays <= 0 ? 'days=30' : `days=${currentDays}`;
      const res = await safeFetchJson<{ events: AnalyticsEventRow[]; total: number }>(
        `/api/analytics/events?${daysParam}&limit=200`
      );
      if (!res || !res.events?.length) {
        setBehavior({
          pageViews: 0,
          buttonClicks: 0,
          fileUploads: 0,
          quoteGenerated: 0,
          paymentCompleted: 0,
          averageSessionSeconds: 0,
          bounceRate: 0,
          dailyActiveRate: 0,
          pageDistribution: [],
          eventTypeDistribution: [],
        });
        return;
      }
      const arr = res.events;
      const typeCount: Record<string, number> = {};
      const pageCount: Record<string, number> = {};
      const sessionDurations = new Map<string, number[]>();
      for (const e of arr) {
        typeCount[e.eventType] = (typeCount[e.eventType] ?? 0) + 1;
        if (e.page) pageCount[e.page] = (pageCount[e.page] ?? 0) + 1;
        const sid = e.sessionId || `single-${e.id}`;
        if (!sessionDurations.has(sid)) sessionDurations.set(sid, []);
        sessionDurations.get(sid)!.push(e.durationSeconds ?? 0);
      }
      let sessionDurationSum = 0;
      let sessionCount = 0;
      let singleEvent = 0;
      for (const v of sessionDurations.values()) {
        if (v.length === 0) continue;
        sessionDurationSum += v.reduce((a, b) => a + b, 0);
        sessionCount++;
        if (v.length === 1) singleEvent++;
      }
      const avgSec = sessionCount > 0 ? sessionDurationSum / sessionCount : 0;
      const bounce = sessionCount > 0 ? (singleEvent / sessionCount) * 100 : 0;
      const days = Math.max(1, currentDays > 0 ? currentDays : 30);
      const dailyActive = Math.min(100, (days * Math.min(1, arr.length / (days * 100))) * 100);

      setBehavior({
        pageViews: typeCount['page_view'] ?? 0,
        buttonClicks: typeCount['button_click'] ?? 0,
        fileUploads: typeCount['file_upload'] ?? 0,
        quoteGenerated: typeCount['quote_generated'] ?? 0,
        paymentCompleted: typeCount['payment_completed'] ?? 0,
        averageSessionSeconds: avgSec,
        bounceRate: bounce,
        dailyActiveRate: dailyActive,
        pageDistribution: Object.entries(pageCount)
          .map(([page, count]) => ({ page, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
        eventTypeDistribution: Object.entries(typeCount)
          .map(([eventType, count]) => ({ eventType, count }))
          .sort((a, b) => b.count - a.count)
          .slice(0, 10),
      });
    } catch (e: any) {
      console.warn('[analytics] behavior 加载失败：', e);
    }
  }, [currentDays]);

  // 加载事件列表（分页 + 过滤）
  const reloadEvents = useCallback(async () => {
    setEventsLoading(true);
    try {
      const daysParam =
        currentDays <= 0 ? 'days=30' : `days=${currentDays}`;
      const params = new URLSearchParams({
        [daysParam.split('=')[0]]: daysParam.split('=')[1],
        limit: String(PAGE_SIZE),
        offset: String(page * PAGE_SIZE),
      });
      if (filterType && filterType !== 'all') {
        params.set('eventType', filterType);
      }
      if (filterSearch) {
        params.set('search', filterSearch);
      }
      const res = await safeFetchJson<{
        events: AnalyticsEventRow[];
        total: number;
      }>(`/api/analytics/events?${params.toString()}`);

      setEvents(res?.events ?? []);
      setEventsTotal(res?.total ?? 0);
      // 不在当前页的清掉选中
      const visibleIds = new Set((res?.events ?? []).map((e) => e.id));
      setSelectedIds((prev) => {
        const next = new Set<string>();
        prev.forEach((id) => {
          if (visibleIds.has(id)) next.add(id);
        });
        return next;
      });
    } catch (e: any) {
      console.error('[analytics] events 加载失败：', e);
      setEvents([]);
      setEventsTotal(0);
    } finally {
      setEventsLoading(false);
    }
  }, [currentDays, page, filterType, filterSearch]);

  // 删除选中事件（批量）
  const onDeleteSelected = useCallback(async () => {
    if (selectedIds.size === 0) return;
    const ok = await confirmDialog({ title: `确定要删除选中的 ${selectedIds.size} 条事件吗？此操作不可撤销。`, destructive: true });
    if (!ok) return;
    setDeleting(true);
    try {
      const res = await fetch('/api/analytics/events', {
        method: 'DELETE',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          ids: Array.from(selectedIds),
        }),
      });
      if (!res.ok) throw new Error(`HTTP ${res.status}`);
      const json = await res.json();
      toast({
        title: '已删除',
        description: `成功删除 ${json.deleted ?? selectedIds.size} 条事件`,
      });
      setSelectedIds(new Set());
      void reloadEvents();
    } catch (e: any) {
      console.error('[analytics] 删除失败：', e);
      toast({
        title: '删除失败',
        description: e?.message ?? '未知错误',
        variant: 'destructive',
      });
    } finally {
      setDeleting(false);
    }
  }, [selectedIds, reloadEvents, toast]);

  // 导出 CSV
  const onExportAll = useCallback(() => {
    const daysParam =
      currentDays <= 0 ? 'days=30' : `days=${currentDays}`;
    const params = new URLSearchParams({
      type: 'events',
      [daysParam.split('=')[0]]: daysParam.split('=')[1],
    });
    if (filterType && filterType !== 'all') {
      params.set('eventType', filterType);
    }
    if (filterSearch) {
      params.set('search', filterSearch);
    }
    window.location.href = `/api/analytics/export?${params.toString()}`;
  }, [currentDays, filterType, filterSearch]);

  // 导出当前 tab 的全部数据
  const onExportTab = useCallback(
    (tabType: string) => {
      const daysParam =
        currentDays <= 0 ? 'days=30' : `days=${currentDays}`;
      window.location.href = `/api/analytics/export?type=${tabType}&${daysParam}`;
    },
    [currentDays]
  );

  // Top-level 加载
  useEffect(() => {
    setPage(0);
    setSelectedIds(new Set());
    void reloadAll();
    void reloadBehavior();
  }, [reloadAll, reloadBehavior]);

  // Events Tab 切换 / 翻页 / 筛选触发刷新
  const firstLoadRef = useRef(true);
  useEffect(() => {
    if (firstLoadRef.current) {
      firstLoadRef.current = false;
      return;
    }
    if (tab === 'behavior') {
      void reloadEvents();
    }
  }, [tab, reloadEvents]);

  useEffect(() => {
    if (tab !== 'behavior') return;
    const handler = setTimeout(() => {
      setPage(0);
      void reloadEvents();
    }, 250); // debounce
    return () => clearTimeout(handler);
  }, [filterType, filterSearch, reloadEvents, tab]);

  useEffect(() => {
    if (tab !== 'behavior') return;
    void reloadEvents();
  }, [page, tab, reloadEvents]);

  // 计算较上周期的转化率趋势（仅在 7d/30d/90d 时可对比，前端算历史快照在数据无前后对比就返回 0）
  const trendRate = stats ? stats.conversionRate : 0;
  const trendRevenue =
    summary && summary.totalOrders > 0 ? summary.totalRevenue : 0;
  const trendUsers = stats ? stats.newUsers : 0;

  return (
    <div className="flex flex-1 flex-col gap-4 p-4 lg:p-6">
      {/* 顶部 标题 + 时间选择 + 导出 */}
      <div className="flex flex-col gap-3 lg:flex-row lg:items-end lg:justify-between">
        <div className="min-w-0">
          <h1 className="text-2xl font-semibold tracking-tight">数据分析</h1>
          <p className="text-sm text-muted-foreground mt-1">
            用户行为追踪、转化漏斗、留存分析和收入统计
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <Select
            value={period}
            onValueChange={(v) => setPeriod(v as PeriodKey)}
          >
            <SelectTrigger className="h-9 w-[140px]">
              <Calendar className="h-4 w-4 mr-1" />
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              {PERIODS.map((p) => (
                <SelectItem key={p.value} value={p.value}>
                  {p.label}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
          <Button
            variant="outline"
            size="sm"
            onClick={() => void reloadAll()}
            disabled={loading}
          >
            <RefreshCw
              className={`h-4 w-4 mr-1 ${loading ? 'animate-spin' : ''}`}
            />
            刷新
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={() => onExportTab(tab)}
            disabled={loading}
          >
            <Download className="h-4 w-4 mr-1" />
            导出数据
          </Button>
        </div>
      </div>

      {/* 5 KPI 卡片 */}
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2 lg:grid-cols-5">
        <KpiCard
          label="总用户数"
          value={fmtNumber(stats?.totalUsers ?? 0)}
          sublabel={`+${fmtNumber(stats?.newUsers ?? 0)} 新增`}
          icon={Users}
          accentClass="bg-blue-100 text-blue-600 dark:bg-blue-900/40 dark:text-blue-300"
        />
        <KpiCard
          label="活跃用户"
          value={fmtNumber(stats?.activeUsers ?? 0)}
          sublabel={
            stats?.totalUsers && stats.totalUsers > 0
              ? `${fmtPercent(
                  (stats.activeUsers / stats.totalUsers) * 100
                )} 活跃率`
              : '0% 活跃率'
          }
          icon={Activity}
          accentClass="bg-emerald-100 text-emerald-600 dark:bg-emerald-900/40 dark:text-emerald-300"
        />
        <KpiCard
          label="总收入"
          value={fmtMoney(summary?.totalRevenue ?? stats?.totalRevenue ?? 0)}
          sublabel={
            summary
              ? `${fmtNumber(summary.totalOrders)} 单`
              : '-'
          }
          icon={DollarSign}
          accentClass="bg-rose-100 text-rose-600 dark:bg-rose-900/40 dark:text-rose-300"
        />
        <KpiCard
          label="转化率"
          value={fmtPercent(stats?.conversionRate ?? 0)}
          sublabel="访问 → 付费"
          icon={TrendingUp}
          accentClass="bg-amber-100 text-amber-600 dark:bg-amber-900/40 dark:text-amber-300"
        />
        <KpiCard
          label="客单价"
          value={fmtMoney(summary?.averageOrderValue ?? 0)}
          sublabel="平均订单价值"
          icon={ShoppingCart}
          accentClass="bg-violet-100 text-violet-600 dark:bg-violet-900/40 dark:text-violet-300"
        />
      </div>

      {/* Tab 区 */}
      <Tabs value={tab} onValueChange={setTab} className="w-full">
        <TabsList className="grid w-full grid-cols-2 sm:grid-cols-4">
          <TabsTrigger value="funnel" className="gap-1">
            <BarChart3 className="h-4 w-4" /> 转化漏斗
          </TabsTrigger>
          <TabsTrigger value="retention" className="gap-1">
            <Activity className="h-4 w-4" /> 留存分析
          </TabsTrigger>
          <TabsTrigger value="revenue" className="gap-1">
            <DollarSign className="h-4 w-4" /> 收入统计
          </TabsTrigger>
          <TabsTrigger value="behavior" className="gap-1">
            <Eye className="h-4 w-4" /> 用户行为
          </TabsTrigger>
        </TabsList>

        <TabsContent value="funnel" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="min-w-0">
                <CardTitle className="text-base">转化漏斗</CardTitle>
                <CardDescription>
                  用户从访问到付费的转化路径 · 当前周期内每阶段的唯一用户数
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onExportTab('funnel')}
                disabled={loading}
              >
                <Download className="h-4 w-4 mr-1" />
                导出
              </Button>
            </CardHeader>
            <CardContent>
              {error ? (
                <div className="rounded-md border border-rose-200 bg-rose-50 text-rose-700 text-sm px-3 py-2 dark:bg-rose-900/30 dark:border-rose-800 dark:text-rose-200">
                  加载失败：{error}
                </div>
              ) : (
                <FunnelSection funnel={funnel} loading={loading} />
              )}
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="retention" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="min-w-0">
                <CardTitle className="text-base">留存分析</CardTitle>
                <CardDescription>
                  按天分组的用户 1 日 / 7 日 / 30 日回访率
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onExportTab('retention')}
                disabled={loading}
              >
                <Download className="h-4 w-4 mr-1" />
                导出
              </Button>
            </CardHeader>
            <CardContent>
              <RetentionSection data={retention} loading={loading} />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="revenue" className="mt-4">
          <Card>
            <CardHeader className="flex flex-row items-center justify-between">
              <div className="min-w-0">
                <CardTitle className="text-base">收入统计</CardTitle>
                <CardDescription>
                  支付成功订单的收入分布与新老客户占比
                </CardDescription>
              </div>
              <Button
                variant="ghost"
                size="sm"
                onClick={() => onExportTab('revenue')}
                disabled={loading}
              >
                <Download className="h-4 w-4 mr-1" />
                导出
              </Button>
            </CardHeader>
            <CardContent>
              <RevenueSection
                revenue={revenue}
                summary={summary}
                loading={loading}
              />
            </CardContent>
          </Card>
        </TabsContent>

        <TabsContent value="behavior" className="mt-4">
          <BehaviorSection
            metrics={behavior}
            events={events}
            eventsTotal={eventsTotal}
            eventsLoading={eventsLoading}
            filterType={filterType}
            setFilterType={(v) => {
              setFilterType(v);
              setPage(0);
            }}
            filterSearch={filterSearch}
            setFilterSearch={(v) => {
              setFilterSearch(v);
              setPage(0);
            }}
            selectedIds={selectedIds}
            setSelectedIds={setSelectedIds}
            page={page}
            setPage={setPage}
            deleting={deleting}
            onDeleteSelected={onDeleteSelected}
            onExportAll={onExportAll}
            reloadEvents={reloadEvents}
          />
        </TabsContent>
      </Tabs>

      {/* 趋势提示，仅展示（无硬编码）：如需较上周期趋势，可加 before period 计算接口 */}
      {(trendRate > 0 || trendRevenue > 0 || trendUsers > 0) && tab === 'funnel' ? (
        <div className="sr-only" aria-hidden="true">
          rate {trendRate.toFixed(2)} revenue {trendRevenue} users{' '}
          {trendUsers}
        </div>
      ) : null}
    </div>
  );
}
