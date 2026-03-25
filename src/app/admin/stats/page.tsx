'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import {
  Users, FileText, Package, Gift, TrendingUp, DollarSign,
  Shield, BarChart3, Loader2, RefreshCw,
} from 'lucide-react';
import { toast } from 'sonner';

// ===== 基础统计 =====
interface BasicStats {
  totalUsers: number;
  activeUsersToday: number;
  totalQuotes: number;
  todayQuotes: number;
  totalProducts: number;
  totalPoints: number;
}

// ===== 收入统计 =====
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

// ===== 等级分布 =====
interface LevelStats {
  levels: Array<{ level: number; count: number; percentage: number; cumulativePercentage: number }>;
  trends: Array<{ date: string; level: number; count: number }>;
  conversion: Record<string, { rate: number; count: number }>;
  upgradeTime: Record<number, { avgDays: number; minDays: number; maxDays: number }>;
  summary: {
    totalUsers: number;
    averageLevel: number;
    mostCommonLevel: number;
    upgradeRate: number;
  };
}

// ===== 热力图 =====
interface HeatmapStats {
  daily: Array<{ date: string; value: number; tokenUsage: number }>;
  deniedApis: Record<string, number>;
  deniedUsers: Record<number, number>;
  summary: {
    totalUsage: number;
    totalTokens: number;
    totalDenied: number;
    averageDailyUsage: number;
  };
}

const LEVEL_NAMES: Record<number, string> = {
  1: '免费用户', 2: '普通会员', 3: 'VIP会员', 4: '企业会员', 5: '超级会员',
};

export default function StatsPage() {
  const [activeTab, setActiveTab] = useState('overview');

  // 数据状态
  const [basicStats, setBasicStats] = useState<BasicStats | null>(null);
  const [revenueStats, setRevenueStats] = useState<RevenueStats | null>(null);
  const [levelStats, setLevelStats] = useState<LevelStats | null>(null);
  const [heatmapStats, setHeatmapStats] = useState<HeatmapStats | null>(null);

  const [basicLoading, setBasicLoading] = useState(false);
  const [revenueLoading, setRevenueLoading] = useState(false);
  const [levelLoading, setLevelLoading] = useState(false);
  const [heatmapLoading, setHeatmapLoading] = useState(false);

  // 加载基础统计
  const loadBasic = async () => {
    setBasicLoading(true);
    try {
      const res = await fetch('/api/admin/stats');
      const data = await res.json();
      if (data.success) {
        setBasicStats(data.data);
      } else {
        toast.error(data.error || '获取基础统计失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setBasicLoading(false); }
  };

  // 加载收入统计
  const loadRevenue = async () => {
    setRevenueLoading(true);
    try {
      const res = await fetch('/api/admin/stats/revenue');
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setRevenueStats(data);
      }
    } catch { toast.error('网络错误'); }
    finally { setRevenueLoading(false); }
  };

  // 加载等级分布
  const loadLevels = async () => {
    setLevelLoading(true);
    try {
      const res = await fetch('/api/admin/stats/level-distribution');
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setLevelStats(data);
      }
    } catch { toast.error('网络错误'); }
    finally { setLevelLoading(false); }
  };

  // 加载热力图
  const loadHeatmap = async () => {
    setHeatmapLoading(true);
    try {
      const res = await fetch('/api/admin/stats/permissions/heatmap?days=30');
      const data = await res.json();
      if (data.error) {
        toast.error(data.error);
      } else {
        setHeatmapStats(data);
      }
    } catch { toast.error('网络错误'); }
    finally { setHeatmapLoading(false); }
  };

  // Tab切换时自动加载
  useEffect(() => {
    if (activeTab === 'overview') loadBasic();
    else if (activeTab === 'revenue') loadRevenue();
    else if (activeTab === 'levels') loadLevels();
    else if (activeTab === 'heatmap') loadHeatmap();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeTab]);

  // 初始加载概览
  useEffect(() => { loadBasic(); }, []); // eslint-disable-next-line react-hooks/exhaustive-deps

  const LoadingSkeleton = () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="ml-2 text-muted-foreground">加载中...</span>
    </div>
  );

  // ===== 概览Tab =====
  const OverviewTab = () => {
    if (basicLoading && !basicStats) return <LoadingSkeleton />;
    if (!basicStats) return <p className="text-muted-foreground text-center py-16">无法加载数据</p>;

    const cards = [
      { label: '总用户', value: basicStats.totalUsers, icon: Users, color: 'bg-blue-100 text-blue-600' },
      { label: '今日活跃', value: basicStats.activeUsersToday, icon: TrendingUp, color: 'bg-green-100 text-green-600' },
      { label: '总报价单', value: basicStats.totalQuotes, icon: FileText, color: 'bg-indigo-100 text-indigo-600' },
      { label: '今日新增报价', value: basicStats.todayQuotes, icon: FileText, color: 'bg-cyan-100 text-cyan-600' },
      { label: '产品总数', value: basicStats.totalProducts, icon: Package, color: 'bg-orange-100 text-orange-600' },
      { label: '总积分', value: basicStats.totalPoints, icon: Gift, color: 'bg-purple-100 text-purple-600' },
    ];

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">系统核心数据概览</p>
          <Button variant="outline" size="sm" onClick={loadBasic} disabled={basicLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${basicLoading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
        </div>
        <div className="grid gap-4 md:grid-cols-3 lg:grid-cols-6">
          {cards.map((card) => (
            <Card key={card.label}>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className={`p-2 rounded-lg ${card.color}`}>
                    <card.icon className="h-5 w-5" />
                  </div>
                  <div>
                    <p className="text-xs text-gray-500">{card.label}</p>
                    <p className="text-xl font-bold">{card.value.toLocaleString()}</p>
                  </div>
                </div>
              </CardContent>
            </Card>
          ))}
        </div>
      </div>
    );
  };

  // ===== 收入Tab =====
  const RevenueTab = () => {
    if (revenueLoading && !revenueStats) return <LoadingSkeleton />;
    if (!revenueStats) return <p className="text-muted-foreground text-center py-16">无法加载数据</p>;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">收入和订单数据统计</p>
          <Button variant="outline" size="sm" onClick={loadRevenue} disabled={revenueLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${revenueLoading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
        </div>

        {/* 收入概览 */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg"><DollarSign className="h-5 w-5 text-green-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">总收入</p>
                  <p className="text-xl font-bold text-green-600">¥{revenueStats.totalRevenue.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg"><BarChart3 className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">订单数</p>
                  <p className="text-xl font-bold">{revenueStats.totalOrders}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2 rounded-lg"><TrendingUp className="h-5 w-5 text-purple-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">平均客单价</p>
                  <p className="text-xl font-bold">¥{revenueStats.averageOrderValue}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${revenueStats.summary.growthRate >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  <TrendingUp className={`h-5 w-5 ${revenueStats.summary.growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <div>
                  <p className="text-xs text-gray-500">月增长率</p>
                  <p className={`text-xl font-bold ${revenueStats.summary.growthRate >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {revenueStats.summary.growthRate >= 0 ? '+' : ''}{revenueStats.summary.growthRate}%
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* 按支付方式 */}
          <Card>
            <CardHeader><CardTitle className="text-base">按支付方式</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>方式</TableHead><TableHead className="text-right">订单数</TableHead><TableHead className="text-right">金额</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(revenueStats.byPaymentMethod).map(([method, data]) => (
                    <TableRow key={method}>
                      <TableCell><Badge variant="outline">{method}</Badge></TableCell>
                      <TableCell className="text-right">{data.count}</TableCell>
                      <TableCell className="text-right font-medium">¥{data.amount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                  {Object.keys(revenueStats.byPaymentMethod).length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">暂无数据</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
            </CardContent>
          </Card>

          {/* 按状态 */}
          <Card>
            <CardHeader><CardTitle className="text-base">订单状态分布</CardTitle></CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow><TableHead>状态</TableHead><TableHead className="text-right">订单数</TableHead><TableHead className="text-right">金额</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(revenueStats.byStatus).map(([status, data]) => {
                    const statusColor: Record<string, string> = {
                      success: 'bg-green-100 text-green-800',
                      pending: 'bg-yellow-100 text-yellow-800',
                      refunded: 'bg-red-100 text-red-800',
                      failed: 'bg-gray-100 text-gray-800',
                    };
                    return (
                      <TableRow key={status}>
                        <TableCell><Badge variant="outline" className={statusColor[status] || ''}>{status}</Badge></TableCell>
                        <TableCell className="text-right">{data.count}</TableCell>
                        <TableCell className="text-right font-medium">¥{data.amount.toLocaleString()}</TableCell>
                      </TableRow>
                    );
                  })}
                  {Object.keys(revenueStats.byStatus).length === 0 && (
                    <TableRow><TableCell colSpan={3} className="text-center text-muted-foreground">暂无数据</TableCell></TableRow>
                  )}
                </TableBody>
              </Table>
              <div className="mt-3 flex gap-4 text-sm text-muted-foreground">
                <span>成功率: <strong className="text-green-600">{revenueStats.summary.successRate}%</strong></span>
                <span>退款率: <strong className="text-red-600">{revenueStats.summary.refundRate}%</strong></span>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* 月度收入趋势 */}
        <Card>
          <CardHeader><CardTitle className="text-base">月度收入趋势</CardTitle></CardHeader>
          <CardContent>
            {revenueStats.monthlyRevenue.length === 0 ? (
              <p className="text-center text-muted-foreground py-8">暂无月度数据</p>
            ) : (
              <Table>
                <TableHeader>
                  <TableRow><TableHead>月份</TableHead><TableHead className="text-right">订单数</TableHead><TableHead className="text-right">收入</TableHead></TableRow>
                </TableHeader>
                <TableBody>
                  {revenueStats.monthlyRevenue.map((m) => (
                    <TableRow key={m.month}>
                      <TableCell>{m.month}</TableCell>
                      <TableCell className="text-right">{m.count}</TableCell>
                      <TableCell className="text-right font-medium">¥{m.amount.toLocaleString()}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            )}
          </CardContent>
        </Card>
      </div>
    );
  };

  // ===== 等级分布Tab =====
  const LevelsTab = () => {
    if (levelLoading && !levelStats) return <LoadingSkeleton />;
    if (!levelStats) return <p className="text-muted-foreground text-center py-16">无法加载数据</p>;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">用户等级分布与转化分析</p>
          <Button variant="outline" size="sm" onClick={loadLevels} disabled={levelLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${levelLoading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
        </div>

        {/* 概览卡片 */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">有等级用户</p>
              <p className="text-xl font-bold">{levelStats.summary.totalUsers}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">平均等级</p>
              <p className="text-xl font-bold">{levelStats.summary.averageLevel}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">最多等级</p>
              <p className="text-xl font-bold">{LEVEL_NAMES[levelStats.summary.mostCommonLevel] || levelStats.summary.mostCommonLevel}</p>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <p className="text-xs text-gray-500">升级率</p>
              <p className="text-xl font-bold text-green-600">{levelStats.summary.upgradeRate}%</p>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* 等级分布 */}
          <Card>
            <CardHeader><CardTitle className="text-base">等级分布</CardTitle></CardHeader>
            <CardContent>
              {levelStats.levels.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">暂无数据</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>等级</TableHead><TableHead className="text-right">人数</TableHead><TableHead className="text-right">占比</TableHead><TableHead>分布条</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {levelStats.levels.map((l) => (
                      <TableRow key={l.level}>
                        <TableCell><Badge variant="outline">{LEVEL_NAMES[l.level] || `Lv.${l.level}`}</Badge></TableCell>
                        <TableCell className="text-right">{l.count}</TableCell>
                        <TableCell className="text-right">{l.percentage}%</TableCell>
                        <TableCell>
                          <div className="w-full bg-gray-100 rounded-full h-2">
                            <div className="bg-blue-500 h-2 rounded-full" style={{ width: `${l.percentage}%` }} />
                          </div>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>

          {/* 等级转化率 + 升级时间 */}
          <Card>
            <CardHeader><CardTitle className="text-base">转化率 & 升级时间</CardTitle></CardHeader>
            <CardContent className="space-y-6">
              <div>
                <h4 className="text-sm font-medium mb-2">等级转化率</h4>
                {Object.keys(levelStats.conversion).length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无转化数据</p>
                ) : (
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>转化路径</TableHead><TableHead className="text-right">目标人数</TableHead><TableHead className="text-right">转化率</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {Object.entries(levelStats.conversion).map(([path, data]) => (
                        <TableRow key={path}>
                          <TableCell>{path}</TableCell>
                          <TableCell className="text-right">{data.count}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className={data.rate > 0 ? 'bg-green-100 text-green-800' : 'bg-gray-100 text-gray-800'}>
                              {data.rate}%
                            </Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                )}
              </div>
              <div>
                <h4 className="text-sm font-medium mb-2">平均升级时间</h4>
                {Object.keys(levelStats.upgradeTime).length === 0 ? (
                  <p className="text-sm text-muted-foreground">暂无数据</p>
                ) : (
                  <div className="space-y-2">
                    {Object.entries(levelStats.upgradeTime).map(([level, data]) => (
                      <div key={level} className="flex items-center justify-between text-sm border rounded-lg p-3">
                        <span>{LEVEL_NAMES[Number(level)] || `Lv.${level}`}</span>
                        <span className="text-muted-foreground">平均 {data.avgDays} 天（{data.minDays}~{data.maxDays}天）</span>
                      </div>
                    ))}
                  </div>
                )}
              </div>
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  // ===== 热力图Tab =====
  const HeatmapTab = () => {
    if (heatmapLoading && !heatmapStats) return <LoadingSkeleton />;
    if (!heatmapStats) return <p className="text-muted-foreground text-center py-16">无法加载数据</p>;

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">Token 消耗和权限拒绝统计（近30天）</p>
          <Button variant="outline" size="sm" onClick={loadHeatmap} disabled={heatmapLoading}>
            <RefreshCw className={`h-4 w-4 mr-1 ${heatmapLoading ? 'animate-spin' : ''}`} /> 刷新
          </Button>
        </div>

        {/* 概览 */}
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg"><Shield className="h-5 w-5 text-blue-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">总积分消耗</p>
                  <p className="text-xl font-bold">{heatmapStats.summary.totalUsage.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-cyan-100 p-2 rounded-lg"><BarChart3 className="h-5 w-5 text-cyan-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">总Token</p>
                  <p className="text-xl font-bold">{heatmapStats.summary.totalTokens.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-orange-100 p-2 rounded-lg"><Shield className="h-5 w-5 text-orange-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">API拒绝次数</p>
                  <p className="text-xl font-bold text-orange-600">{heatmapStats.summary.totalDenied}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-purple-100 p-2 rounded-lg"><TrendingUp className="h-5 w-5 text-purple-600" /></div>
                <div>
                  <p className="text-xs text-gray-500">日均消耗</p>
                  <p className="text-xl font-bold">{heatmapStats.summary.averageDailyUsage.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        <div className="grid gap-4 md:grid-cols-2">
          {/* 每日消耗 */}
          <Card>
            <CardHeader><CardTitle className="text-base">每日消耗（近30天）</CardTitle></CardHeader>
            <CardContent>
              {heatmapStats.daily.length === 0 ? (
                <p className="text-center text-muted-foreground py-8">暂无数据</p>
              ) : (
                <div className="max-h-[400px] overflow-y-auto">
                  <Table>
                    <TableHeader>
                      <TableRow><TableHead>日期</TableHead><TableHead className="text-right">积分消耗</TableHead><TableHead className="text-right">Token</TableHead></TableRow>
                    </TableHeader>
                    <TableBody>
                      {heatmapStats.daily.map((d) => (
                        <TableRow key={d.date}>
                          <TableCell className="text-sm">{d.date}</TableCell>
                          <TableCell className="text-right">{d.value.toLocaleString()}</TableCell>
                          <TableCell className="text-right text-muted-foreground">{d.tokenUsage.toLocaleString()}</TableCell>
                        </TableRow>
                      ))}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>

          {/* API拒绝排行 */}
          <Card>
            <CardHeader><CardTitle className="text-base">API 拒绝排行</CardTitle></CardHeader>
            <CardContent>
              {Object.keys(heatmapStats.deniedApis).length === 0 ? (
                <p className="text-center text-muted-foreground py-8">暂无拒绝记录</p>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow><TableHead>资源</TableHead><TableHead className="text-right">拒绝次数</TableHead></TableRow>
                  </TableHeader>
                  <TableBody>
                    {Object.entries(heatmapStats.deniedApis)
                      .sort((a, b) => b[1] - a[1])
                      .map(([api, count]) => (
                        <TableRow key={api}>
                          <TableCell className="text-sm font-mono">{api}</TableCell>
                          <TableCell className="text-right">
                            <Badge variant="outline" className="bg-orange-100 text-orange-800">{count}</Badge>
                          </TableCell>
                        </TableRow>
                      ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </div>
      </div>
    );
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold">数据统计</h1>
        <p className="text-gray-500">系统运营数据统计与分析</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">概览</TabsTrigger>
          <TabsTrigger value="revenue">收入分析</TabsTrigger>
          <TabsTrigger value="levels">等级分布</TabsTrigger>
          <TabsTrigger value="heatmap">使用热力图</TabsTrigger>
        </TabsList>
        <TabsContent value="overview" className="mt-6"><OverviewTab /></TabsContent>
        <TabsContent value="revenue" className="mt-6"><RevenueTab /></TabsContent>
        <TabsContent value="levels" className="mt-6"><LevelsTab /></TabsContent>
        <TabsContent value="heatmap" className="mt-6"><HeatmapTab /></TabsContent>
      </Tabs>
    </div>
  );
}
