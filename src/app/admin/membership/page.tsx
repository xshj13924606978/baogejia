'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Star, Users, Crown, Shield, Loader2, RefreshCw, CheckCircle, XCircle } from 'lucide-react';
import { toast } from 'sonner';

interface LevelConfig {
  level: number;
  name: string;
  requiredPoints: number;
  role: string;
  fieldPermissions: Record<string, boolean>;
  modulePermissions: string[];
  quotas: Record<string, number>;
}

interface LevelDistribution {
  levels: Array<{ level: number; count: number; percentage: number }>;
  summary: { totalUsers: number; averageLevel: number; upgradeRate: number };
}

const FIELD_LABELS: Record<string, string> = {
  can_view_cost_price: '查看成本价',
  can_view_min_price: '查看最低价',
  can_view_manufacturer: '查看制造商',
  can_view_contact: '查看联系方式',
  can_view_phone: '查看手机号',
};

const QUOTA_LABELS: Record<string, string> = {
  daily_quota: '每日配额',
  max_files: '最大文件数',
  max_chat_messages: '每日消息数',
};

const LEVEL_COLORS: Record<number, string> = {
  1: 'bg-gray-100 text-gray-700',
  2: 'bg-blue-100 text-blue-700',
  3: 'bg-purple-100 text-purple-700',
  4: 'bg-orange-100 text-orange-700',
  5: 'bg-yellow-100 text-yellow-700',
};

const LEVEL_ICONS: Record<number, string> = {
  1: 'gray', 2: 'blue', 3: 'purple', 4: 'orange', 5: 'yellow',
};

export default function MembershipPage() {
  const [levels, setLevels] = useState<LevelConfig[]>([]);
  const [distribution, setDistribution] = useState<LevelDistribution | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState('overview');

  const loadLevels = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/levels');
      const data = await res.json();
      if (data.success) setLevels(data.data || data.levels || []);
    } catch { /* 静默 */ }
  }, []);

  const loadDistribution = useCallback(async () => {
    try {
      const res = await fetch('/api/admin/stats/level-distribution');
      const data = await res.json();
      setDistribution(data);
    } catch { /* 静默 */ }
  }, []);

  const loadAll = useCallback(() => {
    setLoading(true);
    Promise.all([loadLevels(), loadDistribution()]).finally(() => setLoading(false));
  }, [loadLevels, loadDistribution]);

  useEffect(() => { loadAll(); }, [loadAll]);

  // 找到每个等级的用户数
  const getLevelCount = (level: number): number => {
    if (!distribution?.levels) return 0;
    const found = distribution.levels.find((l) => l.level === level);
    return found?.count || 0;
  };

  const getFieldDiff = (level: number, field: string): 'up' | 'same' | 'down' | 'none' => {
    const current = levels.find((l) => l.level === level);
    const prev = levels.find((l) => l.level === level - 1);
    if (!current || !prev) return 'none';
    if (current.fieldPermissions[field] && !prev.fieldPermissions[field]) return 'up';
    if (!current.fieldPermissions[field] && prev.fieldPermissions[field]) return 'down';
    return 'same';
  };

  const getQuotaValue = (level: number, quota: string): string => {
    const item = levels.find((l) => l.level === level);
    if (!item?.quotas) return '-';
    return String(item.quotas[quota] || '-');
  };

  const overviewStats = distribution?.summary || { totalUsers: 0, averageLevel: 0, upgradeRate: 0 };

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">会员管理</h1>
          <p className="text-gray-500">查看等级体系、会员分布和权益对比</p>
        </div>
        <Button variant="outline" size="sm" onClick={loadAll}>
          <RefreshCw className="h-4 w-4 mr-1" />刷新
        </Button>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="overview">会员概览</TabsTrigger>
          <TabsTrigger value="levels">等级配置</TabsTrigger>
          <TabsTrigger value="compare">权益对比</TabsTrigger>
        </TabsList>

        {/* 概览 */}
        <TabsContent value="overview" className="mt-6 space-y-6">
          <div className="grid gap-4 md:grid-cols-4">
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-blue-100 p-2 rounded-lg"><Users className="h-5 w-5 text-blue-600" /></div>
                  <div><p className="text-sm text-gray-500">有等级用户</p><p className="text-xl font-bold">{overviewStats.totalUsers}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-green-100 p-2 rounded-lg"><Crown className="h-5 w-5 text-green-600" /></div>
                  <div><p className="text-sm text-gray-500">VIP及以上</p>
                  <p className="text-xl font-bold">
                    {(distribution?.levels || []).filter((l) => l.level >= 3).reduce((s, l) => s + l.count, 0)}
                  </p></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-purple-100 p-2 rounded-lg"><Star className="h-5 w-5 text-purple-600" /></div>
                  <div><p className="text-sm text-gray-500">平均等级</p><p className="text-xl font-bold">{overviewStats.averageLevel}</p></div>
                </div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="p-4">
                <div className="flex items-center gap-3">
                  <div className="bg-orange-100 p-2 rounded-lg"><Shield className="h-5 w-5 text-orange-600" /></div>
                  <div><p className="text-sm text-gray-500">升级率</p><p className="text-xl font-bold">{overviewStats.upgradeRate}%</p></div>
                </div>
              </CardContent>
            </Card>
          </div>

          {/* 等级分布表 */}
          <Card>
            <CardHeader><CardTitle className="text-lg">等级分布</CardTitle></CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead>等级</TableHead>
                        <TableHead>名称</TableHead>
                        <TableHead>用户数</TableHead>
                        <TableHead>占比</TableHead>
                        <TableHead>分布</TableHead>
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {levels.map((lv) => {
                        const count = getLevelCount(lv.level);
                        const pct = overviewStats.totalUsers > 0 ? ((count / overviewStats.totalUsers) * 100).toFixed(1) : '0';
                        return (
                          <TableRow key={lv.level}>
                            <TableCell><Badge variant="outline" className={LEVEL_COLORS[lv.level]}>Lv.{lv.level}</Badge></TableCell>
                            <TableCell className="font-medium">{lv.name}</TableCell>
                            <TableCell>{count}</TableCell>
                            <TableCell>{pct}%</TableCell>
                            <TableCell className="w-[200px]">
                              <div className="h-2 bg-gray-100 rounded-full overflow-hidden">
                                <div className="h-full bg-blue-500 transition-all" style={{ width: `${pct}%` }} />
                              </div>
                            </TableCell>
                          </TableRow>
                        );
                      })}
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>

        {/* 等级配置 */}
        <TabsContent value="levels" className="mt-6 space-y-4">
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            levels.map((lv) => (
              <Card key={lv.level}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-3">
                      <Badge variant="outline" className={LEVEL_COLORS[lv.level]}>Lv.{lv.level}</Badge>
                      <CardTitle className="text-lg">{lv.name}</CardTitle>
                    </div>
                    <div className="flex items-center gap-4 text-sm text-muted-foreground">
                      <span>用户: {getLevelCount(lv.level)}</span>
                      <span>所需积分: {lv.requiredPoints}</span>
                    </div>
                  </div>
                </CardHeader>
                <CardContent>
                  <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
                    {/* 权限 */}
                    <div>
                      <h4 className="text-sm font-medium mb-3">字段权限</h4>
                      <div className="space-y-2">
                        {Object.entries(FIELD_LABELS).map(([key, label]) => (
                          <div key={key} className="flex items-center gap-2 text-sm">
                            {lv.fieldPermissions[key] !== false ? (
                              <CheckCircle className="h-4 w-4 text-green-500" />
                            ) : (
                              <XCircle className="h-4 w-4 text-gray-300" />
                            )}
                            <span>{label}</span>
                          </div>
                        ))}
                      </div>
                    </div>

                    {/* 模块权限 */}
                    <div>
                      <h4 className="text-sm font-medium mb-3">模块权限</h4>
                      <div className="flex flex-wrap gap-1">
                        {(lv.modulePermissions || []).map((mod) => (
                          <Badge key={mod} variant="outline" className="text-xs">{mod}</Badge>
                        ))}
                        {(!lv.modulePermissions || lv.modulePermissions.length === 0) && (
                          <span className="text-xs text-muted-foreground">无</span>
                        )}
                      </div>
                    </div>

                    {/* 配额 */}
                    <div>
                      <h4 className="text-sm font-medium mb-3">使用配额</h4>
                      <div className="space-y-2">
                        {Object.entries(QUOTA_LABELS).map(([key, label]) => (
                          <div key={key} className="flex justify-between text-sm">
                            <span className="text-muted-foreground">{label}</span>
                            <span className="font-medium">{getQuotaValue(lv.level, key)}</span>
                          </div>
                        ))}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))
          )}
        </TabsContent>

        {/* 权益对比 */}
        <TabsContent value="compare" className="mt-6 space-y-6">
          <Card>
            <CardHeader>
              <CardTitle className="text-lg">等级权益对比</CardTitle>
              <CardDescription>各等级的字段权限和配额差异</CardDescription>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /></div>
              ) : (
                <div className="overflow-auto">
                  <Table>
                    <TableHeader>
                      <TableRow>
                        <TableHead className="min-w-[150px]">权益项</TableHead>
                        {levels.map((lv) => (
                          <TableHead key={lv.level} className="text-center min-w-[120px]">
                            <Badge variant="outline" className={LEVEL_COLORS[lv.level]}>Lv.{lv.level}</Badge>
                            <div className="text-xs font-normal text-muted-foreground mt-1">{lv.name}</div>
                          </TableHead>
                        ))}
                      </TableRow>
                    </TableHeader>
                    <TableBody>
                      {/* 字段权限行 */}
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={levels.length + 1} className="font-medium">字段权限</TableCell>
                      </TableRow>
                      {Object.entries(FIELD_LABELS).map(([key, label]) => (
                        <TableRow key={key}>
                          <TableCell className="text-sm">{label}</TableCell>
                          {levels.map((lv) => (
                            <TableCell key={lv.level} className="text-center">
                              {lv.fieldPermissions[key] !== false ? (
                                <CheckCircle className="h-4 w-4 text-green-500 mx-auto" />
                              ) : (
                                <XCircle className="h-4 w-4 text-gray-300 mx-auto" />
                              )}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}

                      {/* 配额行 */}
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={levels.length + 1} className="font-medium">使用配额</TableCell>
                      </TableRow>
                      {Object.entries(QUOTA_LABELS).map(([key, label]) => (
                        <TableRow key={key}>
                          <TableCell className="text-sm">{label}</TableCell>
                          {levels.map((lv) => (
                            <TableCell key={lv.level} className="text-center font-medium">
                              {getQuotaValue(lv.level, key)}
                            </TableCell>
                          ))}
                        </TableRow>
                      ))}

                      {/* 所需积分行 */}
                      <TableRow className="bg-muted/30">
                        <TableCell colSpan={levels.length + 1} className="font-medium">升级要求</TableCell>
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-sm">所需积分</TableCell>
                        {levels.map((lv) => (
                          <TableCell key={lv.level} className="text-center font-medium">{lv.requiredPoints}</TableCell>
                        ))}
                      </TableRow>
                      <TableRow>
                        <TableCell className="text-sm">用户数</TableCell>
                        {levels.map((lv) => (
                          <TableCell key={lv.level} className="text-center font-medium">{getLevelCount(lv.level)}</TableCell>
                        ))}
                      </TableRow>
                    </TableBody>
                  </Table>
                </div>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
