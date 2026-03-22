'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select, SelectContent, SelectItem, SelectTrigger, SelectValue,
} from '@/components/ui/select';
import {
  Search, TrendingUp, TrendingDown, Activity, Calendar, Loader2,
} from 'lucide-react';
import { toast } from 'sonner';

interface PointLog {
  id: string;
  userId: string;
  username: string;
  points: number;
  balance?: number;
  type: string;
  description: string;
  createdAt: string;
}

interface FlowStats {
  totalCount: number;
  totalIn: number;
  totalOut: number;
  netFlow: number;
  typeStats: Record<string, number>;
}

export const PointsLog: React.FC = () => {
  const [logs, setLogs] = useState<PointLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const pageSize = 20;

  // 搜索和筛选
  const [keyword, setKeyword] = useState('');
  const [searchInput, setSearchInput] = useState('');
  const [typeFilter, setTypeFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState('');
  const [endDate, setEndDate] = useState('');

  // 统计
  const [stats, setStats] = useState<FlowStats | null>(null);

  const loadLogs = useCallback(async () => {
    setLoading(true);
    try {
      const params = new URLSearchParams({
        page: String(page),
        limit: String(pageSize),
      });
      if (keyword) params.set('keyword', keyword);
      if (typeFilter !== 'all') params.set('type', typeFilter);
      if (startDate) params.set('startDate', startDate);
      if (endDate) params.set('endDate', endDate);

      const res = await fetch(`/api/admin/points/logs?${params}`);
      const data = await res.json();

      if (data.success) {
        setLogs(data.data || []);
        setTotal(data.total || 0);
        if (data.stats) setStats(data.stats);
      } else {
        toast.error(data.error || '获取积分流水失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  }, [keyword, typeFilter, startDate, endDate, page]);

  useEffect(() => {
    loadLogs();
  }, [loadLogs]);

  const handleSearch = () => {
    setKeyword(searchInput);
    setPage(1);
  };

  const handleKeyDown = (e: React.KeyboardEvent) => {
    if (e.key === 'Enter') handleSearch();
  };

  const handleReset = () => {
    setKeyword('');
    setSearchInput('');
    setTypeFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const getTypeBadge = (type: string) => {
    const colorMap: Record<string, string> = {
      earn: 'bg-green-100 text-green-800',
      consume: 'bg-red-100 text-red-800',
      reward: 'bg-blue-100 text-blue-800',
      deduct: 'bg-orange-100 text-orange-800',
      admin_adjust: 'bg-purple-100 text-purple-800',
      register: 'bg-green-100 text-green-800',
      daily_sign: 'bg-cyan-100 text-cyan-800',
      chat: 'bg-red-100 text-red-800',
      quote: 'bg-blue-100 text-blue-800',
    };
    const labelMap: Record<string, string> = {
      earn: '获取',
      consume: '消费',
      reward: '奖励',
      deduct: '扣除',
      admin_adjust: '管理员调整',
      register: '注册奖励',
      daily_sign: '每日签到',
      chat: '对话消耗',
      quote: '报价生成',
    };
    return (
      <Badge variant="outline" className={colorMap[type] || ''}>
        {labelMap[type] || type}
      </Badge>
    );
  };

  const totalPages = Math.ceil(total / pageSize);

  // 常见积分类型
  const commonTypes = ['all', 'earn', 'consume', 'reward', 'deduct', 'admin_adjust', 'register', 'daily_sign'];
  const typeLabels: Record<string, string> = {
    all: '全部类型',
    earn: '获取',
    consume: '消费',
    reward: '奖励',
    deduct: '扣除',
    admin_adjust: '管理员调整',
    register: '注册奖励',
    daily_sign: '每日签到',
  };

  return (
    <div className="space-y-6">
      {/* 统计卡片 */}
      {stats && (
        <div className="grid gap-4 md:grid-cols-4">
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-blue-100 p-2 rounded-lg">
                  <Activity className="h-5 w-5 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">总记录</p>
                  <p className="text-xl font-bold">{stats.totalCount.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-green-100 p-2 rounded-lg">
                  <TrendingUp className="h-5 w-5 text-green-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">总获取</p>
                  <p className="text-xl font-bold text-green-600">+{stats.totalIn.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className="bg-red-100 p-2 rounded-lg">
                  <TrendingDown className="h-5 w-5 text-red-600" />
                </div>
                <div>
                  <p className="text-sm text-gray-500">总消费</p>
<p className="text-xl font-bold text-red-600">-{stats.totalOut.toLocaleString()}</p>
                </div>
              </div>
            </CardContent>
          </Card>
          <Card>
            <CardContent className="p-4">
              <div className="flex items-center gap-3">
                <div className={`p-2 rounded-lg ${stats.netFlow >= 0 ? 'bg-green-100' : 'bg-red-100'}`}>
                  <Activity className={`h-5 w-5 ${stats.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`} />
                </div>
                <div>
                  <p className="text-sm text-gray-500">净流入</p>
                  <p className={`text-xl font-bold ${stats.netFlow >= 0 ? 'text-green-600' : 'text-red-600'}`}>
                    {stats.netFlow >= 0 ? '+' : ''}{stats.netFlow.toLocaleString()}
                  </p>
                </div>
              </div>
            </CardContent>
          </Card>
        </div>
      )}

      {/* 搜索和筛选 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex flex-col md:flex-row gap-4">
            <div className="flex-1 relative">
              <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-gray-400" />
              <Input
                placeholder="搜索说明..."
                className="pl-9"
                value={searchInput}
                onChange={(e) => setSearchInput(e.target.value)}
                onKeyDown={handleKeyDown}
              />
            </div>
            <div className="flex gap-2 flex-wrap">
              <Button variant="outline" size="sm" onClick={handleSearch}>搜索</Button>
              <Select value={typeFilter} onValueChange={(v) => { setTypeFilter(v); setPage(1); }}>
                <SelectTrigger className="w-[130px]">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {commonTypes.map((t) => (
                    <SelectItem key={t} value={t}>{typeLabels[t] || t}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
              <div className="flex items-center gap-2">
                <Calendar className="h-4 w-4 text-muted-foreground" />
                <Input
                  type="date"
                  value={startDate}
                  onChange={(e) => setStartDate(e.target.value)}
                  className="w-[140px]"
                />
                <span className="text-muted-foreground">至</span>
                <Input
                  type="date"
                  value={endDate}
                  onChange={(e) => setEndDate(e.target.value)}
                  className="w-[140px]"
                />
              </div>
              {(keyword || typeFilter !== 'all' || startDate || endDate) && (
                <Button variant="ghost" size="sm" onClick={handleReset}>清除</Button>
              )}
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 流水列表 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">积分流水记录</CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12">
              <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              <span className="ml-2 text-muted-foreground">加载中...</span>
            </div>
          ) : logs.length === 0 ? (
            <div className="text-center py-16">
              <Activity className="h-12 w-12 text-muted-foreground/30 mx-auto mb-4" />
              <p className="text-muted-foreground">
                {keyword || typeFilter !== 'all' ? '没有找到匹配的记录' : '暂无积分流水记录'}
              </p>
            </div>
          ) : (
            <>
              <div className="overflow-auto">
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>用户</TableHead>
                      <TableHead>积分变动</TableHead>
                      <TableHead>类型</TableHead>
                      <TableHead>说明</TableHead>
                      <TableHead>时间</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {logs.map((log) => (
                      <TableRow key={log.id}>
                        <TableCell>
                          <span className="text-sm">{log.username}</span>
                        </TableCell>
                        <TableCell>
                          <Badge variant={log.points > 0 ? 'default' : 'destructive'}>
                            {log.points > 0 ? `+${log.points}` : log.points}
                          </Badge>
                        </TableCell>
                        <TableCell>{getTypeBadge(log.type)}</TableCell>
                        <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">
                          {log.description || '-'}
                        </TableCell>
                        <TableCell>
                          <span className="text-xs text-muted-foreground">
                            {log.createdAt ? new Date(log.createdAt).toLocaleString('zh-CN') : '-'}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              </div>

              {/* 分页 */}
              {totalPages > 1 && (
                <div className="flex items-center justify-between mt-4">
                  <span className="text-sm text-muted-foreground">
                    第 {page}/{totalPages} 页，共 {total} 条
                  </span>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>
                      上一页
                    </Button>
                    <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>
                      下一页
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};
