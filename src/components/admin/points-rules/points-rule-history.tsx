'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { 
  Search, 
  Calendar,
  Filter,
  RefreshCw,
  CheckCircle,
  XCircle,
  AlertCircle,
  Clock
} from 'lucide-react';
import { PointsRuleHistory, ExecutionStatus } from '@/types/points-rules';
import { toast } from 'sonner';
import { formatDateTime } from '@/lib/date-utils';

interface PointsRuleHistoryPanelProps {
  userId: string;
  userRole: string;
  ruleId?: string; // 可选，用于筛选特定规则
}

// 操作类型 → 中文显示名称
const OPERATION_TYPE_LABELS: Record<string, string> = {
  register: '注册',
  daily_login: '每日登录',
  recharge: '充值',
  earn: '获取',
  consume: '消耗',
  refund: '退款',
  exchange: '兑换',
  invite_reward: '邀请奖励',
  task_reward: '任务奖励',
  contributor_register: '贡献者注册',
  contributor_adopt: '贡献者采纳',
  contributor_upload: '贡献者上传',
  contributor_review: '贡献者审核',
  knowledge_download: '知识库下载',
  knowledge_share: '知识库分享',
  knowledge_upload: '知识库上传',
  parse_doc: '文档解析',
  parse_document: '文档解析',
  chat: 'AI对话',
  generate_token: 'Token生成',
  generate_proposal: '生成方案',
  enhance_proposal: '方案增强',
  enhance_token: 'Token增强',
  export_quote: '导出报价',
  export_report: '导出报告',
  export_qu: '导出',
  upload_file: '上传文件',
  invite_config: '邀请配置',
  admin_grant: '管理员发放',
  admin_deduct: '管理员扣除',
};

export default function PointsRuleHistoryPanel({ userId, userRole, ruleId }: PointsRuleHistoryPanelProps) {
  const [history, setHistory] = useState<PointsRuleHistory[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState<string>('all');
  const [operationTypeFilter, setOperationTypeFilter] = useState<string>('all');
  const [startDate, setStartDate] = useState<string>('');
  const [endDate, setEndDate] = useState<string>('');
  const [page, setPage] = useState(1);
  const [total, setTotal] = useState(0);
  const limit = 20;

  // 加载执行历史
  const loadHistory = async () => {
    try {
      setLoading(true);
      
      const params = new URLSearchParams({
        page: page.toString(),
        limit: limit.toString(),
      });

      if (ruleId) {
        params.append('ruleId', ruleId);
      }

      if (search) {
        params.append('search', search);
      }

      if (statusFilter !== 'all') {
        params.append('status', statusFilter);
      }

      if (operationTypeFilter !== 'all') {
        params.append('operationType', operationTypeFilter);
      }

      if (startDate) {
        params.append('startDate', startDate);
      }

      if (endDate) {
        params.append('endDate', endDate);
      }

      const response = await fetch(`/api/admin/points/history?${params.toString()}`);
      const data = await response.json();
      
      if (data.success) {
        setHistory(data.data || []);
        setTotal(data.total || 0);
      } else {
        toast.error('加载执行历史失败', {
          description: data.error || '未知错误'
        });
      }
    } catch (error) {
      console.error('加载执行历史失败:', error);
      toast.error('加载执行历史失败', {
        description: '网络请求异常'
      });
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadHistory();
  }, [page, ruleId]);

  // 获取状态显示
  const getStatusDisplay = (status: ExecutionStatus) => {
    switch (status) {
      case 'success':
        return { label: '成功', color: 'bg-green-100 text-green-800', icon: <CheckCircle className="h-4 w-4" /> };
      case 'failed':
        return { label: '失败', color: 'bg-red-100 text-red-800', icon: <XCircle className="h-4 w-4" /> };
      case 'skipped':
        return { label: '跳过', color: 'bg-yellow-100 text-yellow-800', icon: <AlertCircle className="h-4 w-4" /> };
      case 'limited':
        return { label: '受限', color: 'bg-blue-100 text-blue-800', icon: <Clock className="h-4 w-4" /> };
      default:
        return { label: status, color: 'bg-gray-100 text-gray-800', icon: null };
    }
  };

  // 格式化日期

  // 重置筛选
  const resetFilters = () => {
    setSearch('');
    setStatusFilter('all');
    setOperationTypeFilter('all');
    setStartDate('');
    setEndDate('');
    setPage(1);
  };

  const totalPages = Math.ceil(total / limit);

  return (
    <Card>
      <CardHeader>
        <CardTitle>积分规则执行历史</CardTitle>
        <CardDescription>
          查看积分规则的执行记录和统计信息
          {ruleId && <span className="ml-2 text-blue-600">(规则ID: {ruleId})</span>}
        </CardDescription>
      </CardHeader>
      <CardContent>
        {/* 筛选器 */}
        <div className="space-y-4 mb-6">
          <div className="flex flex-col sm:flex-row gap-4">
            {/* 搜索框 */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="搜索操作类型或失败原因..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  onKeyDown={(e) => e.key === 'Enter' && loadHistory()}
                  className="pl-10"
                />
              </div>
            </div>

            {/* 状态筛选 */}
            <Select value={statusFilter} onValueChange={setStatusFilter}>
              <SelectTrigger className="w-[120px]">
                <SelectValue placeholder="状态" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有状态</SelectItem>
                <SelectItem value="success">成功</SelectItem>
                <SelectItem value="failed">失败</SelectItem>
                <SelectItem value="skipped">跳过</SelectItem>
                <SelectItem value="limited">受限</SelectItem>
              </SelectContent>
            </Select>

            {/* 操作类型筛选 */}
            <Select value={operationTypeFilter} onValueChange={setOperationTypeFilter}>
              <SelectTrigger className="w-[150px]">
                <SelectValue placeholder="操作类型" />
              </SelectTrigger>
              <SelectContent>
                <SelectItem value="all">所有类型</SelectItem>
                <SelectItem value="register">注册奖励</SelectItem>
                <SelectItem value="daily_login">每日登录</SelectItem>
                <SelectItem value="chat">对话消费</SelectItem>
                <SelectItem value="upload_file">上传文件</SelectItem>
                <SelectItem value="parse_document">文档解析</SelectItem>
                <SelectItem value="generate_proposal">生成方案</SelectItem>
                <SelectItem value="enhance_proposal">方案增强</SelectItem>
                <SelectItem value="export_quote">导出报价单</SelectItem>
              </SelectContent>
            </Select>
          </div>

          {/* 日期范围筛选 */}
          <div className="flex flex-col sm:flex-row gap-4">
            <div className="flex items-center gap-2 flex-1">
              <Calendar className="h-4 w-4 text-gray-400" />
              <Input
                type="date"
                placeholder="开始日期"
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                className="flex-1"
              />
              <span className="text-gray-500">至</span>
              <Input
                type="date"
                placeholder="结束日期"
                value={endDate}
                onChange={(e) => setEndDate(e.target.value)}
                className="flex-1"
              />
            </div>

            {/* 操作按钮 */}
            <div className="flex gap-2">
              <Button variant="outline" onClick={resetFilters}>
                <Filter className="h-4 w-4 mr-2" />
                重置
              </Button>
              <Button onClick={loadHistory}>
                <RefreshCw className="h-4 w-4 mr-2" />
                刷新
              </Button>
            </div>
          </div>
        </div>

        {/* 历史表格 */}
        <div className="border rounded-lg">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead>执行时间</TableHead>
                <TableHead>用户ID</TableHead>
                <TableHead>操作类型</TableHead>
                <TableHead>规则ID</TableHead>
                <TableHead>积分</TableHead>
                <TableHead>状态</TableHead>
                <TableHead>条件匹配</TableHead>
                <TableHead>失败原因</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {loading ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="flex justify-center">
                      <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                    </div>
                    <p className="mt-2 text-gray-500">加载中...</p>
                  </TableCell>
                </TableRow>
              ) : history.length === 0 ? (
                <TableRow>
                  <TableCell colSpan={8} className="text-center py-8">
                    <div className="text-gray-500">
                      暂无执行历史记录
                    </div>
                  </TableCell>
                </TableRow>
              ) : (
                history.map((record) => {
                  const statusDisplay = getStatusDisplay(record.executionStatus);
                  return (
                    <TableRow key={record.id}>
                      <TableCell>
                        <div className="text-sm">{formatDateTime(record.executedAt)}</div>
                      </TableCell>
                      <TableCell>
                        <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                          {record.userId.substring(0, 8)}...
                        </code>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">{OPERATION_TYPE_LABELS[record.operationType] || record.operationType}</div>
                      </TableCell>
                      <TableCell>
                        {record.ruleId ? (
                          <code className="text-xs bg-gray-100 px-2 py-1 rounded">
                            {record.ruleId.substring(0, 8)}...
                          </code>
                        ) : (
                          <span className="text-gray-400">-</span>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="font-mono">
                          {record.pointsAwarded > 0 ? '+' : ''}{record.pointsAwarded}
                        </div>
                        {record.pointsExpected !== undefined && record.pointsExpected !== record.pointsAwarded && (
                          <div className="text-xs text-gray-500">
                            预期: {record.pointsExpected}
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <Badge className={statusDisplay.color}>
                          <div className="flex items-center gap-1">
                            {statusDisplay.icon}
                            {statusDisplay.label}
                          </div>
                        </Badge>
                      </TableCell>
                      <TableCell>
                        <div className="text-sm">
                          {record.conditionsPassed}/{record.conditionsEvaluated}
                        </div>
                        {record.conditionsMatched && (
                          <div className="text-xs text-gray-500">
                            {Object.keys(record.conditionsMatched || {}).length} 条件
                          </div>
                        )}
                      </TableCell>
                      <TableCell>
                        <div className="text-sm text-red-600 max-w-[200px] truncate">
                          {record.failureReason || '-'}
                        </div>
                      </TableCell>
                    </TableRow>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>

        {/* 分页 */}
        {totalPages > 1 && (
          <div className="flex items-center justify-between mt-6">
            <div className="text-sm text-gray-500">
              共 {total} 条记录，第 {page} / {totalPages} 页
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.max(1, p - 1))}
                disabled={page <= 1}
              >
                上一页
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={() => setPage(p => Math.min(totalPages, p + 1))}
                disabled={page >= totalPages}
              >
                下一页
              </Button>
            </div>
          </div>
        )}
      </CardContent>
    </Card>
  );
}