'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  TrendingUp,
  Users,
  Target,
  Award,
  RefreshCw,
  BarChart3
} from 'lucide-react';
import { PointsRuleStats } from '@/types/points-rules';
import { toast } from 'sonner';

interface PointsRuleStatsPanelProps {
  userId: string;
  userRole: string;
}

interface OverallStats {
  totalRules: number;
  totalExecutions: number;
  totalPointsAwarded: number;
  totalUniqueUsers: number;
  activeRules: number;
  avgPointsPerExecution: number;
}

export default function PointsRuleStatsPanel({ userId, userRole }: PointsRuleStatsPanelProps) {
  const [stats, setStats] = useState<PointsRuleStats[]>([]);
  const [overall, setOverall] = useState<OverallStats>({
    totalRules: 0,
    totalExecutions: 0,
    totalPointsAwarded: 0,
    totalUniqueUsers: 0,
    activeRules: 0,
    avgPointsPerExecution: 0,
  });
  const [loading, setLoading] = useState(true);
  const [ruleTypeFilter, setRuleTypeFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');

  // 加载统计信息
  const loadStats = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams();

      if (ruleTypeFilter !== 'all') {
        params.append('ruleType', ruleTypeFilter);
      }

      if (activeFilter !== 'all') {
        params.append('isActive', activeFilter === 'active' ? 'true' : 'false');
      }

      const response = await fetch(`/api/admin/points/rules/stats?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setStats(data.data.stats || []);
        setOverall(data.data.overall || {
          totalRules: 0,
          totalExecutions: 0,
          totalPointsAwarded: 0,
          totalUniqueUsers: 0,
          activeRules: 0,
          avgPointsPerExecution: 0,
        });
      } else {
        toast.error('加载规则统计失败', {
          description: data.error || '未知错误'
        });
      }
    } catch (error) {
      console.error('加载规则统计失败:', error);
      toast.error('加载规则统计失败', {
        description: '网络请求异常'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadStats();
  }, [ruleTypeFilter, activeFilter]);

  // 获取规则类型显示
  const getRuleTypeDisplay = (ruleType: string) => {
    switch (ruleType) {
      case 'reward':
        return { label: '奖励', color: 'bg-green-100 text-green-800' };
      case 'consumption':
        return { label: '消费', color: 'bg-blue-100 text-blue-800' };
      case 'penalty':
        return { label: '惩罚', color: 'bg-red-100 text-red-800' };
      default:
        return { label: ruleType, color: 'bg-gray-100 text-gray-800' };
    }
  };

  // 格式化数字
  const formatNumber = (num: number) => {
    return num.toLocaleString('zh-CN');
  };

  // 格式化日期
  const formatDate = (dateString: string | Date | null | undefined) => {
    if (!dateString) return '-';
    const date = new Date(dateString);
    return date.toLocaleDateString('zh-CN');
  };

  return (
    <div className="space-y-6">
      {/* 总体统计卡片 */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatNumber(overall.totalExecutions)}</div>
                <div className="text-sm text-gray-500">总执行次数</div>
              </div>
              <TrendingUp className="h-8 w-8 text-blue-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold text-green-600">
                  {formatNumber(overall.totalPointsAwarded)}
                </div>
                <div className="text-sm text-gray-500">总积分发放</div>
              </div>
              <Award className="h-8 w-8 text-green-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{formatNumber(overall.totalUniqueUsers)}</div>
                <div className="text-sm text-gray-500">唯一用户数</div>
              </div>
              <Users className="h-8 w-8 text-purple-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{overall.activeRules}/{overall.totalRules}</div>
                <div className="text-sm text-gray-500">启用规则/总规则</div>
              </div>
              <Target className="h-8 w-8 text-orange-500" />
            </div>
          </CardContent>
        </Card>

        <Card>
          <CardContent className="pt-6">
            <div className="flex items-center justify-between">
              <div>
                <div className="text-2xl font-bold">{overall.avgPointsPerExecution}</div>
                <div className="text-sm text-gray-500">平均积分/次</div>
              </div>
              <BarChart3 className="h-8 w-8 text-teal-500" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 筛选器 */}
      <Card>
        <CardHeader>
          <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
            <div>
              <CardTitle>规则执行统计</CardTitle>
              <CardDescription>按规则类型和状态查看详细执行数据</CardDescription>
            </div>
            <div className="flex gap-2">
              <Select value={ruleTypeFilter} onValueChange={setRuleTypeFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="规则类型" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有类型</SelectItem>
                  <SelectItem value="reward">奖励</SelectItem>
                  <SelectItem value="consumption">消费</SelectItem>
                  <SelectItem value="penalty">惩罚</SelectItem>
                </SelectContent>
              </Select>

              <Select value={activeFilter} onValueChange={setActiveFilter}>
                <SelectTrigger className="w-[120px]">
                  <SelectValue placeholder="状态" />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">所有状态</SelectItem>
                  <SelectItem value="active">已启用</SelectItem>
                  <SelectItem value="inactive">已禁用</SelectItem>
                </SelectContent>
              </Select>

              <Button onClick={loadStats} disabled={loading}>
                <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
                刷新
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          {/* 统计表格 */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>规则名称</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>操作类型</TableHead>
                  <TableHead>基础积分</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead>执行次数</TableHead>
                  <TableHead>发放积分</TableHead>
                  <TableHead>唯一用户</TableHead>
                  <TableHead>首次执行</TableHead>
                  <TableHead>最后执行</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <div className="flex justify-center">
                        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                      </div>
                      <p className="mt-2 text-gray-500">加载中...</p>
                    </TableCell>
                  </TableRow>
                ) : stats.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={10} className="text-center py-8">
                      <div className="text-gray-500">
                        暂无规则统计信息
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  stats.map((stat) => {
                    const ruleTypeDisplay = getRuleTypeDisplay(stat.ruleType);
                    return (
                      <TableRow key={stat.ruleId}>
                        <TableCell>
                          <div className="font-medium">{stat.ruleName}</div>
                          <div className="text-xs text-gray-500">{stat.ruleKey}</div>
                        </TableCell>
                        <TableCell>
                          <Badge className={ruleTypeDisplay.color}>
                            {ruleTypeDisplay.label}
                          </Badge>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{stat.operationType}</div>
                        </TableCell>
                        <TableCell className="font-mono">
                          {stat.basePoints}
                        </TableCell>
                        <TableCell>
                          <Badge className={stat.isActive ? 'bg-green-100 text-green-800' : 'bg-red-100 text-red-800'}>
                            {stat.isActive ? '启用' : '禁用'}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-medium">
                          {formatNumber(stat.totalExecutions)}
                        </TableCell>
                        <TableCell className="font-medium text-green-600">
                          {formatNumber(stat.totalPointsAwarded)}
                        </TableCell>
                        <TableCell>
                          {formatNumber(stat.uniqueUsers)}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{formatDate(stat.firstExecution)}</div>
                        </TableCell>
                        <TableCell>
                          <div className="text-sm">{formatDate(stat.lastExecution)}</div>
                        </TableCell>
                      </TableRow>
                    );
                  })
                )}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}