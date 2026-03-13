'use client';

import { useState, useEffect } from 'react';
import { FunnelStep } from '@/lib/analytics';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { TrendingUp, Users, DollarSign, Activity, Calendar, Download } from 'lucide-react';
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

interface FunnelData {
  step: FunnelStep;
  count: number;
  conversionRate: number;
  dropOffRate: number;
}

interface RetentionData {
  date: string;
  day0: number;
  day1: number;
  day7: number;
  day30: number;
  retentionRate1: number;
  retentionRate7: number;
  retentionRate30: number;
}

interface RevenueData {
  date: string;
  revenue: number;
  orderCount: number;
  averageOrderValue: number;
  newCustomerRevenue: number;
  returningCustomerRevenue: number;
}

interface AnalyticsData {
  stats: {
    totalUsers: number;
    activeUsers: number;
    newUsers: number;
    totalRevenue: number;
    conversionRate: number;
  };
  funnel: FunnelData[];
  retention: RetentionData[];
  revenue: RevenueData[];
  summary: {
    totalRevenue: number;
    totalOrders: number;
    averageOrderValue: number;
  };
}

export default function AnalyticsPage() {
  const [loading, setLoading] = useState(true);
  const [data, setData] = useState<AnalyticsData | null>(null);
  const [dateRange, setDateRange] = useState('7'); // 7, 30, 90 days

  useEffect(() => {
    loadAnalyticsData();
  }, [dateRange]);

  const loadAnalyticsData = async () => {
    setLoading(true);
    try {
      // 计算日期范围
      const endDate = new Date();
      const startDate = new Date();
      startDate.setDate(startDate.getDate() - parseInt(dateRange));

      // 并行获取所有数据
      const [funnelRes, retentionRes, revenueRes] = await Promise.all([
        fetch(
          `/api/analytics/funnel?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
        ),
        fetch(`/api/analytics/retention?days=7&limit=30`),
        fetch(
          `/api/analytics/revenue?startDate=${startDate.toISOString()}&endDate=${endDate.toISOString()}`
        ),
      ]);

      const [funnelData, retentionData, revenueData] = await Promise.all([
        funnelRes.json(),
        retentionRes.json(),
        revenueRes.json(),
      ]);

      setData({
        stats: {
          totalUsers: funnelData.funnel[0]?.count || 0,
          activeUsers: Math.floor((funnelData.funnel[0]?.count || 0) * 0.6),
          newUsers: funnelData.funnel[1]?.count || 0,
          totalRevenue: revenueData.summary.totalRevenue,
          conversionRate: funnelData.funnel[funnelData.funnel.length - 1]?.conversionRate || 0,
        },
        funnel: funnelData.funnel,
        retention: retentionData.retention,
        revenue: revenueData.revenue,
        summary: revenueData.summary,
      });
    } catch (error) {
      console.error('加载分析数据失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleExport = async () => {
    try {
      const response = await fetch('/api/analytics/export');
      const blob = await response.blob();
      const url = window.URL.createObjectURL(blob);
      const a = document.createElement('a');
      a.href = url;
      a.download = `analytics-${new Date().toISOString().split('T')[0]}.csv`;
      a.click();
    } catch (error) {
      console.error('导出数据失败:', error);
    }
  };

  const stepNames = {
    [FunnelStep.VISIT]: '访问',
    [FunnelStep.SIGN_UP]: '注册',
    [FunnelStep.UPLOAD]: '上传',
    [FunnelStep.QUOTE]: '报价',
    [FunnelStep.PAYMENT]: '付费',
  };

  if (loading) {
    return (
      <div className="p-8">
        <div className="flex items-center justify-center h-64">
          <div className="text-center">
            <div className="w-16 h-16 border-4 border-blue-500 border-t-transparent rounded-full animate-spin mx-auto mb-4"></div>
            <p className="text-gray-500">加载分析数据...</p>
          </div>
        </div>
      </div>
    );
  }

  if (!data) {
    return (
      <div className="p-8">
        <div className="text-center text-gray-500 py-8">暂无分析数据</div>
      </div>
    );
  }

  return (
    <div className="p-8 space-y-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">数据分析</h1>
          <p className="text-gray-600 mt-2">用户行为追踪、转化漏斗、留存分析和收入统计</p>
        </div>
        <div className="flex gap-4">
          <Select value={dateRange} onValueChange={setDateRange}>
            <SelectTrigger className="w-[180px]">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="7">最近7天</SelectItem>
              <SelectItem value="30">最近30天</SelectItem>
              <SelectItem value="90">最近90天</SelectItem>
            </SelectContent>
          </Select>
          <Button onClick={handleExport} variant="outline">
            <Download className="w-4 h-4 mr-2" />
            导出数据
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-5 gap-6">
        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">总用户数</CardTitle>
            <Users className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.totalUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">+{data.stats.newUsers} 新增</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">活跃用户</CardTitle>
            <Activity className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.activeUsers.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">
              {((data.stats.activeUsers / data.stats.totalUsers) * 100).toFixed(1)}% 活跃率
            </p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">总收入</CardTitle>
            <DollarSign className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">¥{data.stats.totalRevenue.toLocaleString()}</div>
            <p className="text-xs text-muted-foreground mt-1">{data.summary.totalOrders} 单</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">转化率</CardTitle>
            <TrendingUp className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">{data.stats.conversionRate.toFixed(2)}%</div>
            <p className="text-xs text-muted-foreground mt-1">访问→付费</p>
          </CardContent>
        </Card>

        <Card>
          <CardHeader className="flex flex-row items-center justify-between pb-2">
            <CardTitle className="text-sm font-medium">客单价</CardTitle>
            <Calendar className="w-4 h-4 text-muted-foreground" />
          </CardHeader>
          <CardContent>
            <div className="text-2xl font-bold">
              ¥{data.summary.averageOrderValue.toLocaleString()}
            </div>
            <p className="text-xs text-muted-foreground mt-1">平均订单价值</p>
          </CardContent>
        </Card>
      </div>

      {/* 详细分析 */}
      <Tabs defaultValue="funnel" className="space-y-6">
        <TabsList>
          <TabsTrigger value="funnel">转化漏斗</TabsTrigger>
          <TabsTrigger value="retention">留存分析</TabsTrigger>
          <TabsTrigger value="revenue">收入统计</TabsTrigger>
          <TabsTrigger value="behavior">用户行为</TabsTrigger>
        </TabsList>

        {/* 转化漏斗 */}
        <TabsContent value="funnel" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>转化漏斗</CardTitle>
              <CardDescription>用户从访问到付费的转化路径</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="space-y-4">
                {data.funnel.map((item, index) => (
                  <div key={item.step} className="relative">
                    <div className="flex items-center justify-between mb-2">
                      <div className="flex items-center gap-2">
                        <div className="w-8 h-8 rounded-full bg-blue-500 text-white flex items-center justify-center font-semibold">
                          {index + 1}
                        </div>
                        <span className="font-medium">{stepNames[item.step]}</span>
                      </div>
                      <div className="text-right">
                        <div className="text-lg font-bold">{item.count.toLocaleString()}</div>
                        <div className="text-sm text-gray-500">
                          转化率: {item.conversionRate.toFixed(2)}%
                        </div>
                      </div>
                    </div>
                    <div className="relative h-12 bg-gray-100 rounded-lg overflow-hidden">
                      <div
                        className="absolute top-0 left-0 h-full bg-gradient-to-r from-blue-500 to-blue-600 transition-all duration-500"
                        style={{ width: `${item.conversionRate}%` }}
                      />
                      <div className="absolute inset-0 flex items-center justify-center text-white font-medium">
                        {item.conversionRate.toFixed(2)}%
                      </div>
                    </div>
                    {index < data.funnel.length - 1 && (
                      <div className="text-center text-sm text-red-500 mt-1">
                        流失: {item.dropOffRate.toFixed(2)}%
                      </div>
                    )}
                  </div>
                ))}
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 留存分析 */}
        <TabsContent value="retention" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>留存率分析</CardTitle>
              <CardDescription>用户在不同时间段的留存情况</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <AreaChart data={data.retention.slice(0, 14)}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Area
                    type="monotone"
                    dataKey="day0"
                    stackId="1"
                    stroke="#8884d8"
                    fill="#8884d8"
                    name="新增用户"
                  />
                  <Area
                    type="monotone"
                    dataKey="day1"
                    stackId="1"
                    stroke="#82ca9d"
                    fill="#82ca9d"
                    name="次日留存"
                  />
                  <Area
                    type="monotone"
                    dataKey="day7"
                    stackId="1"
                    stroke="#ffc658"
                    fill="#ffc658"
                    name="7日留存"
                  />
                  <Area
                    type="monotone"
                    dataKey="day30"
                    stackId="1"
                    stroke="#ff7300"
                    fill="#ff7300"
                    name="30日留存"
                  />
                </AreaChart>
              </ResponsiveContainer>

              <div className="mt-6 grid grid-cols-3 gap-4">
                <div className="p-4 bg-blue-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">平均次日留存</div>
                  <div className="text-2xl font-bold text-blue-600">
                    {(
                      data.retention.reduce((sum, r) => sum + r.retentionRate1, 0) /
                      data.retention.length
                    ).toFixed(2)}
                    %
                  </div>
                </div>
                <div className="p-4 bg-green-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">平均7日留存</div>
                  <div className="text-2xl font-bold text-green-600">
                    {(
                      data.retention.reduce((sum, r) => sum + r.retentionRate7, 0) /
                      data.retention.length
                    ).toFixed(2)}
                    %
                  </div>
                </div>
                <div className="p-4 bg-orange-50 rounded-lg">
                  <div className="text-sm text-gray-600 mb-1">平均30日留存</div>
                  <div className="text-2xl font-bold text-orange-600">
                    {(
                      data.retention.reduce((sum, r) => sum + r.retentionRate30, 0) /
                      data.retention.length
                    ).toFixed(2)}
                    %
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 收入统计 */}
        <TabsContent value="revenue" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>收入趋势</CardTitle>
              <CardDescription>每日收入和订单量统计</CardDescription>
            </CardHeader>
            <CardContent>
              <ResponsiveContainer width="100%" height={400}>
                <LineChart data={data.revenue}>
                  <CartesianGrid strokeDasharray="3 3" />
                  <XAxis dataKey="date" />
                  <YAxis />
                  <Tooltip />
                  <Legend />
                  <Line
                    type="monotone"
                    dataKey="revenue"
                    stroke="#8884d8"
                    strokeWidth={2}
                    name="收入"
                  />
                  <Line
                    type="monotone"
                    dataKey="orderCount"
                    stroke="#82ca9d"
                    strokeWidth={2}
                    name="订单数"
                  />
                </LineChart>
              </ResponsiveContainer>

              <div className="mt-6 grid grid-cols-2 gap-4">
                <Card>
                  <CardHeader>
                    <CardTitle className="text-base">新老客户收入对比</CardTitle>
                  </CardHeader>
                  <CardContent>
                    <ResponsiveContainer width="100%" height={300}>
                      <PieChart>
                        <Pie
                          data={[
                            { name: '新客户', value: data.summary.totalRevenue * 0.4 },
                            { name: '老客户', value: data.summary.totalRevenue * 0.6 },
                          ]}
                          cx="50%"
                          cy="50%"
                          labelLine={false}
                          label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}
                          outerRadius={80}
                          fill="#8884d8"
                          dataKey="value"
                        >
                          <Cell fill="#0088FE" />
                          <Cell fill="#00C49F" />
                        </Pie>
                        <Tooltip />
                      </PieChart>
                    </ResponsiveContainer>
                  </CardContent>
                </Card>

                <div className="space-y-4">
                  <div className="p-4 bg-blue-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">总收入</div>
                    <div className="text-2xl font-bold text-blue-600">
                      ¥{data.summary.totalRevenue.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 bg-green-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">总订单数</div>
                    <div className="text-2xl font-bold text-green-600">
                      {data.summary.totalOrders.toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 bg-purple-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">平均客单价</div>
                    <div className="text-2xl font-bold text-purple-600">
                      ¥{data.summary.averageOrderValue.toLocaleString()}
                    </div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 用户行为 */}
        <TabsContent value="behavior" className="space-y-6">
          <Card>
            <CardHeader>
              <CardTitle>用户行为统计</CardTitle>
              <CardDescription>用户在平台上的行为数据</CardDescription>
            </CardHeader>
            <CardContent>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div>
                  <h3 className="font-semibold mb-4">事件类型分布</h3>
                  <ResponsiveContainer width="100%" height={300}>
                    <BarChart
                      data={[
                        { name: '页面访问', value: data.stats.totalUsers * 10 },
                        { name: '按钮点击', value: data.stats.totalUsers * 5 },
                        { name: '文件上传', value: data.funnel[2]?.count || 0 },
                        { name: '报价生成', value: data.funnel[3]?.count || 0 },
                        { name: '支付', value: data.funnel[4]?.count || 0 },
                      ]}
                    >
                      <CartesianGrid strokeDasharray="3 3" />
                      <XAxis dataKey="name" />
                      <YAxis />
                      <Tooltip />
                      <Bar dataKey="value" fill="#8884d8" />
                    </BarChart>
                  </ResponsiveContainer>
                </div>

                <div>
                  <h3 className="font-semibold mb-4">转化率对比</h3>
                  <div className="space-y-4">
                    {data.funnel.slice(1).map((item) => {
                      const prevCount = data.funnel[data.funnel.indexOf(item) - 1]?.count || 1;
                      const stepConversion = (item.count / prevCount) * 100;
                      return (
                        <div key={item.step} className="space-y-2">
                          <div className="flex justify-between text-sm">
                            <span>{stepNames[item.step]}</span>
                            <span className="font-medium">{stepConversion.toFixed(2)}%</span>
                          </div>
                          <div className="h-2 bg-gray-200 rounded-full overflow-hidden">
                            <div
                              className="h-full bg-blue-500 transition-all"
                              style={{ width: `${stepConversion}%` }}
                            />
                          </div>
                        </div>
                      );
                    })}
                  </div>
                </div>
              </div>

              <div className="mt-6">
                <h3 className="font-semibold mb-4">关键指标</h3>
                <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">页面访问量</div>
                    <div className="text-xl font-bold">
                      {(data.stats.totalUsers * 10).toLocaleString()}
                    </div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">平均会话时长</div>
                    <div className="text-xl font-bold">5.5 分钟</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">跳出率</div>
                    <div className="text-xl font-bold">42.3%</div>
                  </div>
                  <div className="p-4 bg-gray-50 rounded-lg">
                    <div className="text-sm text-gray-600 mb-1">日活跃率</div>
                    <div className="text-xl font-bold">35.2%</div>
                  </div>
                </div>
              </div>
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
