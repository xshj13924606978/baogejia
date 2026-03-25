'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Loader2, Users, TrendingUp, Award, BarChart3 } from 'lucide-react';
import { toast } from 'sonner';
import {
  BarChart, Bar, XAxis, YAxis, CartesianGrid, Tooltip, ResponsiveContainer,
  PieChart, Pie, Cell,
} from 'recharts';

interface LevelData {
  level: number;
  count: number;
  percentage: number;
  cumulativePercentage: number;
}

interface TrendData {
  date: string;
  level: number;
  count: number;
}

interface DistributionData {
  levels: LevelData[];
  trends: TrendData[];
  conversion: Record<string, { rate: number; count: number }>;
  upgradeTime: Record<number, { avgDays: number; minDays: number; maxDays: number }>;
  summary: {
    totalUsers: number;
    averageLevel: number;
    mostCommonLevel: number;
    upgradeRate: number;
  };
}

const LEVEL_NAMES: Record<number, string> = {
  0: '未设定', 1: '免费用户', 2: '普通会员', 3: 'VIP会员', 4: '企业会员', 5: '超级会员',
};

const LEVEL_COLORS = ['#9ca3af', '#3b82f6', '#10b981', '#f59e0b', '#8b5cf6', '#ef4444'];

export default function LevelDistributionPage() {
  const [data, setData] = useState<DistributionData | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    (async () => {
      try {
        const res = await fetch('/api/admin/stats/level-distribution');
        const json = await res.json();
        if (json.error) { toast.error(json.error); return; }
        setData(json);
      } catch { toast.error('网络错误'); }
      finally { setLoading(false); }
    })();
  }, []);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载等级分布...</span>
      </div>
    );
  }

  if (!data) return <p className="text-center py-24 text-muted-foreground">暂无数据</p>;

  const pieData = data.levels.map(l => ({
    name: LEVEL_NAMES[l.level] || `Lv.${l.level}`,
    value: l.count,
    color: LEVEL_COLORS[l.level] || LEVEL_COLORS[0],
  }));

  // 趋势图：按月聚合各等级人数
  const months = [...new Set(data.trends.map(t => t.date))].sort();
  const trendChartData = months.map(m => {
    const row: Record<string, any> = { month: m };
    data.trends.filter(t => t.date === m).forEach(t => {
      row[LEVEL_NAMES[t.level] || `Lv.${t.level}`] = t.count;
    });
    return row;
  });
  const trendLevelNames = [...new Set(data.trends.map(t => LEVEL_NAMES[t.level] || `Lv.${t.level}`))];

  // 转化率数据
  const conversionEntries = Object.entries(data.conversion).sort((a, b) => {
    const aNum = parseInt(a[0]);
    const bNum = parseInt(b[0]);
    return aNum - bNum;
  });

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div>
        <h1 className="text-2xl font-bold">等级分布</h1>
        <p className="text-gray-500">查看会员等级分布和升级转化数据</p>
      </div>

      {/* 概览卡片 */}
      <div className="grid gap-4 md:grid-cols-4">
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-blue-100 p-2.5 rounded-lg">
              <Users className="h-5 w-5 text-blue-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">有等级用户</p>
              <p className="text-xl font-bold">{data.summary.totalUsers.toLocaleString()}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-green-100 p-2.5 rounded-lg">
              <Award className="h-5 w-5 text-green-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">VIP及以上</p>
              <p className="text-xl font-bold">
                {data.levels.filter(l => l.level >= 3).reduce((s, l) => s + l.count, 0)}
              </p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-purple-100 p-2.5 rounded-lg">
              <BarChart3 className="h-5 w-5 text-purple-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">平均等级</p>
              <p className="text-xl font-bold">{data.summary.averageLevel.toFixed(2)}</p>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4 flex items-center gap-3">
            <div className="bg-orange-100 p-2.5 rounded-lg">
              <TrendingUp className="h-5 w-5 text-orange-600" />
            </div>
            <div>
              <p className="text-sm text-gray-500">升级率</p>
              <p className="text-xl font-bold">{data.summary.upgradeRate.toFixed(1)}%</p>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 两列: 分布饼图 + 升级转化 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 等级分布饼图 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">等级分布</CardTitle>
          </CardHeader>
          <CardContent>
            {pieData.length > 0 ? (
              <>
                <ResponsiveContainer width="100%" height={220}>
                  <PieChart>
                    <Pie data={pieData} cx="50%" cy="50%" outerRadius={85} dataKey="value" paddingAngle={2} label={({ name, percent }) => `${name} ${(percent * 100).toFixed(0)}%`}>
                      {pieData.map((entry, i) => <Cell key={i} fill={entry.color} />)}
                    </Pie>
                    <Tooltip />
                  </PieChart>
                </ResponsiveContainer>
              </>
            ) : (
              <p className="text-center py-8 text-muted-foreground">暂无分布数据</p>
            )}
          </CardContent>
        </Card>

        {/* 升级转化率 */}
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">升级转化率</CardTitle>
          </CardHeader>
          <CardContent>
            {conversionEntries.length > 0 ? (
              <div className="space-y-3">
                {conversionEntries.map(([key, val]) => (
                  <div key={key} className="flex items-center gap-3">
                    <div className="flex items-center gap-1.5 text-sm font-medium w-24 shrink-0">
                      <Badge variant="outline">{key.split('->')[0]}</Badge>
                      <span className="text-gray-400">&rarr;</span>
                      <Badge variant="outline">{key.split('->')[1]}</Badge>
                    </div>
                    <div className="flex-1 h-2 bg-gray-100 rounded-full overflow-hidden">
                      <div
                        className="h-full bg-blue-500 rounded-full transition-all"
                        style={{ width: `${Math.min(val.rate, 100)}%` }}
                      />
                    </div>
                    <span className="text-sm font-medium w-14 text-right">{val.rate.toFixed(1)}%</span>
                    <span className="text-xs text-gray-400 w-16 text-right">{val.count}人</span>
                  </div>
                ))}
              </div>
            ) : (
              <p className="text-center py-8 text-muted-foreground">暂无转化数据</p>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 等级人数分布表格 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">等级人数明细</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>等级</TableHead>
                  <TableHead className="text-right">用户数</TableHead>
                  <TableHead>占比</TableHead>
                  <TableHead>累计占比</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {data.levels.map(l => (
                  <TableRow key={l.level}>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <span className="w-3 h-3 rounded-full shrink-0" style={{ backgroundColor: LEVEL_COLORS[l.level] || LEVEL_COLORS[0] }} />
                        <span className="font-medium">{LEVEL_NAMES[l.level] || `Lv.${l.level}`}</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-right font-medium">{l.count.toLocaleString()}</TableCell>
                    <TableCell>
                      <div className="flex items-center gap-2">
                        <div className="w-24 h-2 bg-gray-100 rounded-full overflow-hidden">
                          <div className="h-full bg-blue-500 rounded-full" style={{ width: `${l.percentage}%` }} />
                        </div>
                        <span className="text-sm">{l.percentage.toFixed(1)}%</span>
                      </div>
                    </TableCell>
                    <TableCell className="text-sm text-gray-500">{l.cumulativePercentage.toFixed(1)}%</TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 升级耗时统计 */}
      {Object.keys(data.upgradeTime).length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">升级耗时统计</CardTitle>
            <CardDescription>各等级从注册到升级所需的平均天数</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="overflow-auto">
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>目标等级</TableHead>
                    <TableHead className="text-right">平均天数</TableHead>
                    <TableHead className="text-right">最短</TableHead>
                    <TableHead className="text-right">最长</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {Object.entries(data.upgradeTime)
                    .sort(([a], [b]) => parseInt(a) - parseInt(b))
                    .map(([level, t]) => (
                      <TableRow key={level}>
                        <TableCell className="font-medium">{LEVEL_NAMES[parseInt(level)] || `Lv.${level}`}</TableCell>
                        <TableCell className="text-right">{t.avgDays.toFixed(1)} 天</TableCell>
                        <TableCell className="text-right text-green-600">{t.minDays} 天</TableCell>
                        <TableCell className="text-right text-red-600">{t.maxDays} 天</TableCell>
                      </TableRow>
                    ))}
                </TableBody>
              </Table>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 等级趋势图 */}
      {trendChartData.length > 0 && (
        <Card>
          <CardHeader>
            <CardTitle className="text-lg">等级趋势</CardTitle>
            <CardDescription>各等级用户数月度变化</CardDescription>
          </CardHeader>
          <CardContent>
            <ResponsiveContainer width="100%" height={280}>
              <BarChart data={trendChartData}>
                <CartesianGrid strokeDasharray="3 3" stroke="#e5e7eb" />
                <XAxis dataKey="month" tick={{ fontSize: 12 }} />
                <YAxis tick={{ fontSize: 12 }} />
                <Tooltip />
                {trendLevelNames.map((name, i) => (
                  <Bar key={name} dataKey={name} stackId="a" fill={LEVEL_COLORS[i + 1] || LEVEL_COLORS[0]} />
                ))}
              </BarChart>
            </ResponsiveContainer>
            <div className="flex flex-wrap gap-3 justify-center mt-2">
              {trendLevelNames.map((name, i) => (
                <div key={name} className="flex items-center gap-1.5 text-xs">
                  <span className="w-3 h-3 rounded" style={{ backgroundColor: LEVEL_COLORS[i + 1] || LEVEL_COLORS[0] }} />
                  {name}
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}
    </div>
  );
}
