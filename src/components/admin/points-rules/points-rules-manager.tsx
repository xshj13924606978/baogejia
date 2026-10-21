'use client';

import { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Skeleton } from '@/components/ui/skeleton';
import {
  Collapsible,
  CollapsibleTrigger,
  CollapsibleContent,
} from '@/components/ui/collapsible';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Search,
  Plus,
  Edit,
  Trash2,
  CheckCircle,
  XCircle,
  RefreshCw,
  Database,
  History,
  BarChart3,
  Trophy,
  Coins,
  Zap,
  Info,
  ChevronDown,
} from 'lucide-react';
import { PointsRule } from '@/types/points-rules';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import PointsRuleForm from './points-rule-form';
import PointsRuleHistoryPanel from './points-rule-history';
import PointsRuleStatsPanel from './points-rule-stats';

interface PointsRulesManagerProps {
  userId: string;
  userRole: string;
}

// 规则类型 → 显示名称与徽章颜色
const RULE_TYPE_MAP: Record<string, { label: string; color: string }> = {
  reward: { label: '奖励类', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
  consume: { label: '消耗类', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
  token: { label: 'Token计费', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
  // 兼容原有类型
  consumption: { label: '消费', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
  penalty: { label: '惩罚', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
};

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

export default function PointsRulesManager({ userId, userRole }: PointsRulesManagerProps) {
  const [rules, setRules] = useState<PointsRule[]>([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [ruleTypeFilter, setRuleTypeFilter] = useState<string>('all');
  const [activeFilter, setActiveFilter] = useState<string>('all');
  const [migrationStatus, setMigrationStatus] = useState<any>(null);
  const [migrating, setMigrating] = useState(false);
  const [createDialogOpen, setCreateDialogOpen] = useState(false);
  const [editingRule, setEditingRule] = useState<PointsRule | null>(null);
  const [historyDialogOpen, setHistoryDialogOpen] = useState(false);
  const [selectedRuleId, setSelectedRuleId] = useState<string | null>(null);
  const [statsDialogOpen, setStatsDialogOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<{ id: string; name: string } | null>(null);
  const [deleting, setDeleting] = useState(false);

  // 加载积分规则
  const loadRules = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/points-rules?limit=100`);
      const data = await response.json();

      if (data.success) {
        setRules(data.data || []);
      } else {
        toast.error('加载积分规则失败', {
          description: data.error || '未知错误'
        });
      }
    } catch (error) {
      toast.error('加载积分规则失败', {
        description: '网络请求异常'
      });
      console.error('加载积分规则失败:', error);
    } finally {
      setLoading(false);
    }
  };

  // 检查迁移状态
  const checkMigrationStatus = async () => {
    try {
      const response = await fetch('/api/admin/points-rules/migrate');
      const data = await response.json();

      if (data.success) {
        setMigrationStatus(data.migrationStatus);
      }
    } catch (error) {
      console.error('检查迁移状态失败:', error);
    }
  };

  // 执行数据库迁移
  const runMigration = async () => {
    try {
      setMigrating(true);
      const response = await fetch('/api/admin/points-rules/migrate', {
        method: 'POST',
      });
      const data = await response.json();

      if (data.success) {
        toast.success('数据库迁移成功', {
          description: `完成 ${data.successCount || 0} 条语句`
        });
        await checkMigrationStatus();
        await loadRules();
      } else {
        toast.error('数据库迁移失败', {
          description: data.error || '未知错误'
        });
      }
    } catch (error) {
      toast.error('数据库迁移失败', {
        description: '网络请求异常'
      });
      console.error('数据库迁移失败:', error);
    } finally {
      setMigrating(false);
    }
  };

  // 激活/禁用规则
  const toggleRuleActive = async (ruleId: string, currentActive: boolean) => {
    try {
      const response = await fetch(`/api/admin/points-rules/${ruleId}/activate`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ isActive: !currentActive }),
      });

      const data = await response.json();

      if (data.success) {
        toast.success(`规则已${!currentActive ? '激活' : '禁用'}`);
        await loadRules();
      } else {
        toast.error('操作失败', {
          description: data.error || '未知错误'
        });
      }
    } catch (error) {
      toast.error('操作失败', {
        description: '网络请求异常'
      });
      console.error('激活/禁用规则失败:', error);
    }
  };

  // 删除规则
  const confirmDeleteRule = async () => {
    if (!deleteTarget) return;
    try {
      setDeleting(true);
      const response = await fetch(`/api/admin/points-rules/${deleteTarget.id}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('规则删除成功');
        setDeleteTarget(null);
        await loadRules();
      } else {
        toast.error('删除失败', {
          description: data.error || '未知错误'
        });
      }
    } catch (error) {
      toast.error('删除失败', {
        description: '网络请求异常'
      });
      console.error('删除规则失败:', error);
    } finally {
      setDeleting(false);
    }
  };

  // 初始化加载
  useEffect(() => {
    loadRules();
    checkMigrationStatus();
  }, []);

  // 过滤规则（支持新的 rule_type 字段）
  const filteredRules = useMemo(() => rules.filter(rule => {
    // 搜索过滤
    const name = rule.rule_name || rule.ruleName || '';
    const desc = rule.rule_description || rule.ruleDescription || '';
    const key = rule.rule_key || rule.ruleKey || '';
    if (search && !name.toLowerCase().includes(search.toLowerCase()) &&
      !key.toLowerCase().includes(search.toLowerCase()) &&
      !desc.toLowerCase().includes(search.toLowerCase())) {
      return false;
    }

    // 规则类型过滤（兼容原有 ruleType 和新 rule_type）
    const effectiveType = (rule.rule_type === 'reward' || rule.rule_type === 'consume' || rule.rule_type === 'token')
      ? rule.rule_type
      : (rule.ruleType || rule.rule_type || 'reward');
    if (ruleTypeFilter !== 'all' && effectiveType !== ruleTypeFilter) {
      return false;
    }

    // 激活状态过滤
    if (activeFilter !== 'all') {
      const isActive = activeFilter === 'active';
      const ruleActive = rule.is_active !== undefined ? rule.is_active : rule.isActive;
      if (ruleActive !== isActive) {
        return false;
      }
    }

    return true;
  }), [rules, search, ruleTypeFilter, activeFilter]);

  // 统计：按类型归类
  const stats = useMemo(() => {
    const countByType = (type: string) => rules.filter(rule => {
      const t = (rule.rule_type === 'reward' || rule.rule_type === 'consume' || rule.rule_type === 'token')
        ? rule.rule_type
        : (rule.ruleType || rule.rule_type || 'reward');
      return t === type;
    }).length;
    return {
      total: rules.length,
      reward: countByType('reward'),
      consume: countByType('consume'),
      token: countByType('token'),
    };
  }, [rules]);

  // 获取积分显示
  const getPointsDisplay = (points: number) => {
    if (points > 0) {
      return <span className="text-green-600 font-bold">+{points}</span>;
    } else if (points < 0) {
      return <span className="text-red-600 font-bold">{points}</span>;
    } else {
      return <span className="text-gray-600 font-bold">{points}</span>;
    }
  };

  const statCards = [
    { label: '规则总数', value: stats.total, icon: Trophy, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', desc: '全部积分规则' },
    { label: '奖励类', value: stats.reward, icon: Coins, color: 'text-green-600 bg-green-50 dark:bg-green-900/20', desc: '用户获得积分' },
    { label: '消耗类', value: stats.consume, icon: Zap, color: 'text-orange-600 bg-orange-50 dark:bg-orange-900/20', desc: '用户消耗积分' },
    { label: 'Token计费', value: stats.token, icon: Database, color: 'text-blue-600 bg-blue-50 dark:bg-blue-900/20', desc: '按Token计费' },
  ];

  // 迁移是否完成（API 返回 migrated 布尔值）
  const migrationDone = migrationStatus ? (migrationStatus.migrated === true || (migrationStatus.pointsRulesColumns?.length || 0) >= 6) : true;

  // 迁移状态明细（用于提示卡片展示）
  const migrationChecks = migrationStatus
    ? [
        { label: 'points_rules 扩展字段', ok: (migrationStatus.pointsRulesColumns?.length || 0) >= 6 },
        { label: 'points_transactions 表', ok: migrationStatus.pointsTransactionsExists === true },
        { label: 'users.tokens 字段', ok: migrationStatus.usersTokensColumn === true },
      ]
    : [];

  return (
    <div className="h-full flex flex-col gap-3">
      {/* 迁移状态卡片 */}
      {!migrationDone && migrationStatus && (
        <Card className="border-yellow-200 bg-yellow-50 shrink-0">
          <CardHeader className="pb-3">
            <CardTitle className="flex items-center gap-2 text-yellow-800">
              <Database className="h-5 w-5" />
              数据库迁移提示
            </CardTitle>
            <CardDescription className="text-yellow-700">
              积分规则管理系统需要先创建数据库表才能使用。
            </CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-3">
              <div className="text-sm">
                <p className="font-medium mb-2">表状态检查:</p>
                <ul className="space-y-1">
                  {migrationChecks.map((check) => (
                    <li key={check.label} className="flex items-center gap-2">
                      {check.ok ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className={check.ok ? 'text-green-700' : 'text-red-700'}>
                        {check.label}: {check.ok ? '已就绪' : '未就绪'}
                      </span>
                    </li>
                  ))}
                </ul>
              </div>

              <Button
                onClick={runMigration}
                disabled={migrating}
                className="bg-yellow-600 hover:bg-yellow-700"
              >
                {migrating ? (
                  <>
                    <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                    迁移中...
                  </>
                ) : (
                  <>
                    <Database className="h-4 w-4 mr-2" />
                    执行数据库迁移
                  </>
                )}
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 顶部统计卡片（紧凑） */}
      <div className="grid grid-cols-2 lg:grid-cols-4 gap-3 shrink-0">
        {statCards.map((card) => {
          const Icon = card.icon;
          return (
            <div
              key={card.label}
              className="flex items-center gap-3 p-3 bg-card rounded-lg border"
              title={card.desc}
            >
              <div className={`h-9 w-9 rounded-lg flex items-center justify-center shrink-0 ${card.color}`}>
                <Icon className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <div className="text-xl font-bold leading-tight">{card.value}</div>
                <div className="text-xs text-muted-foreground truncate">{card.label}</div>
              </div>
            </div>
          );
        })}
      </div>

      {/* 控制栏：搜索 + 过滤 + 按钮 */}
      <div className="flex flex-col sm:flex-row items-start sm:items-center gap-3 shrink-0">
        <div className="relative flex-1 w-full">
          <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
          <Input
            placeholder="搜索规则名称、标识符或描述..."
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            className="pl-10"
          />
        </div>

        <div className="flex flex-wrap items-center gap-2">
          <Select value={ruleTypeFilter} onValueChange={setRuleTypeFilter}>
            <SelectTrigger className="w-[130px]">
              <SelectValue placeholder="规则类型" />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="all">所有类型</SelectItem>
              <SelectItem value="reward">奖励类</SelectItem>
              <SelectItem value="consume">消耗类</SelectItem>
              <SelectItem value="token">Token计费</SelectItem>
              <SelectItem value="consumption">消费(旧)</SelectItem>
              <SelectItem value="penalty">惩罚(旧)</SelectItem>
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

          <Button
            variant="outline"
            size="sm"
            onClick={() => setStatsDialogOpen(true)}
          >
            <BarChart3 className="h-4 w-4 mr-2" />
            统计
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={loadRules}
            disabled={loading}
          >
            <RefreshCw className={`h-4 w-4 mr-2 ${loading ? 'animate-spin' : ''}`} />
            刷新
          </Button>
          <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
            <Plus className="h-4 w-4 mr-2" />
            新建规则
          </Button>
        </div>
      </div>

      {/* 规则表格（可滚动容器） */}
      <Card className="flex-1 min-h-0 overflow-hidden flex flex-col">
        <CardHeader className="pb-3 shrink-0">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-2">
            <div>
              <CardTitle>积分规则列表</CardTitle>
              <CardDescription>
                共 {rules.length} 条规则，当前显示 {filteredRules.length} 条
              </CardDescription>
            </div>
          </div>
        </CardHeader>
        <CardContent className="flex-1 min-h-0 overflow-auto p-0">
          <div className="overflow-x-auto">
            <Table className="min-w-[900px]">
              <TableHeader className="sticky top-0 bg-background z-10">
                <TableRow>
                  <TableHead className="min-w-[140px]">规则名称</TableHead>
                  <TableHead className="min-w-[120px]">标识符</TableHead>
                  <TableHead className="w-[100px]">类型</TableHead>
                  <TableHead className="w-[100px]">积分</TableHead>
                  <TableHead className="min-w-[110px]">操作类型</TableHead>
                  <TableHead className="w-[130px]">状态</TableHead>
                  <TableHead className="w-[150px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  Array.from({ length: 5 }).map((_, i) => (
                    <TableRow key={`skeleton-${i}`}>
                      <TableCell colSpan={7}>
                        <div className="flex items-center gap-4 py-1">
                          <Skeleton className="h-4 w-32" />
                          <Skeleton className="h-4 w-24" />
                          <Skeleton className="h-5 w-16 rounded-full" />
                          <Skeleton className="h-4 w-12" />
                          <Skeleton className="h-4 w-20" />
                          <Skeleton className="h-5 w-14 rounded-full" />
                          <Skeleton className="h-4 w-24" />
                        </div>
                      </TableCell>
                    </TableRow>
                  ))
                ) : filteredRules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-12">
                      <div className="text-gray-500 flex flex-col items-center gap-2">
                        <Search className="h-8 w-8 text-gray-300" />
                        <span>{rules.length === 0 ? '暂无积分规则，点击「新建规则」创建' : '没有找到匹配的规则'}</span>
                      </div>
                    </TableCell>
                  </TableRow>
                ) : (
                  filteredRules.map((rule) => {
                    // 兼容数据库字段和前端字段
                    const rName = rule.rule_name || rule.ruleName || '';
                    const rDesc = rule.rule_description || rule.ruleDescription || '';
                    const rKey = rule.rule_key || rule.ruleKey || '';
                    const rType = (rule.rule_type === 'reward' || rule.rule_type === 'consume' || rule.rule_type === 'token')
                      ? rule.rule_type
                      : (rule.ruleType || rule.rule_type || 'reward') as string;
                    const rActive = rule.is_active !== undefined ? rule.is_active : (rule.isActive ?? true);
                    const rSystem = rule.is_system_rule !== undefined ? rule.is_system_rule : (rule.isSystemRule ?? false);
                    const rBasePoints = rule.base_points !== undefined ? rule.base_points : (rule.basePoints ?? 0);
                    const rOpType = rule.operation_type || rule.operationType || '';
                    const ruleTypeDisplay = RULE_TYPE_MAP[rType] || { label: rType, color: 'bg-gray-100 text-gray-800' };

                    // 根据规则类型显示不同的积分/Token信息
                    const getConfigDisplay = () => {
                      const config = rule.rule_config;
                      if (!config || typeof config !== 'object') {
                        return getPointsDisplay(rBasePoints);
                      }
                      if (rType === 'reward') {
                        const pts = (config as any).points || rBasePoints;
                        return getPointsDisplay(pts);
                      } else if (rType === 'consume') {
                        const cost = (config as any).base_cost || rBasePoints;
                        return <span className="text-orange-600 font-bold">-{cost}</span>;
                      } else if (rType === 'token') {
                        const tokens = (config as any).base_tokens || rBasePoints;
                        return <span className="text-blue-600 font-bold">{tokens} Token</span>;
                      }
                      return getPointsDisplay(rBasePoints);
                    };

                    return (
                      <TableRow key={rule.id}>
                        <TableCell>
                          <div className="font-medium truncate max-w-[200px]" title={rName}>{rName}</div>
                          {rDesc && (
                            <div className="text-sm text-gray-500 mt-1 truncate max-w-[220px]" title={rDesc}>
                              {rDesc}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {rKey && (
                            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded whitespace-nowrap">
                              {rKey}
                            </code>
                          )}
                        </TableCell>
                        <TableCell>
                          <Badge className={ruleTypeDisplay.color}>
                            {ruleTypeDisplay.label}
                          </Badge>
                        </TableCell>
                        <TableCell className="font-mono">
                          {getConfigDisplay()}
                        </TableCell>
                        <TableCell>
                          <div className="text-sm truncate max-w-[100px]" title={rOpType}>{OPERATION_TYPE_LABELS[rOpType] || rOpType}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={rActive}
                              onCheckedChange={() => toggleRuleActive(rule.id!, rActive)}
                              disabled={rSystem}
                            />
                            <span className={`text-xs whitespace-nowrap ${rActive ? 'text-green-600' : 'text-red-600'}`}>
                              {rActive ? '已启用' : '已禁用'}
                            </span>
                            {rSystem && (
                              <Badge variant="outline" className="text-xs">
                                系统
                              </Badge>
                            )}
                          </div>
                        </TableCell>
                        <TableCell className="text-right">
                          <div className="flex justify-end gap-1">
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="编辑"
                              onClick={() => setEditingRule(rule)}
                            >
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8"
                              title="查看执行历史"
                              onClick={() => {
                                setSelectedRuleId(rule.id);
                                setHistoryDialogOpen(true);
                              }}
                            >
                              <History className="h-4 w-4" />
                            </Button>
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                              title={rSystem ? '系统规则不可删除' : '删除'}
                              onClick={() => {
                                if (rSystem) {
                                  toast.error('系统规则不可删除', { description: `「${rName}」是系统内置规则，无法删除` });
                                  return;
                                }
                                setDeleteTarget({ id: rule.id!, name: rName });
                              }}
                            >
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </div>
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

      {/* 使用说明（可折叠，默认收起） */}
      <div className="shrink-0">
        <Collapsible defaultOpen={false}>
          <CollapsibleTrigger className="group w-full flex items-center gap-1.5 text-sm text-muted-foreground py-1.5 hover:text-foreground transition-colors">
            <Info className="h-4 w-4" />
            使用说明
            <ChevronDown className="h-4 w-4 transition-transform duration-200 group-data-[state=open]:rotate-180" />
          </CollapsibleTrigger>
          <CollapsibleContent>
            <div className="text-sm text-muted-foreground space-y-1.5 p-3 bg-muted/30 rounded-lg mt-1">
              <p>• <strong>奖励类规则</strong>（绿色）：用户完成特定操作时获得积分（如注册、每日登录、上传文件）</p>
              <p>• <strong>消耗类规则</strong>（橙色）：用户使用服务时消耗积分（如生成报价、导出报告），支持等级折扣</p>
              <p>• <strong>Token计费规则</strong>（蓝色）：按使用量消耗Token（如AI对话、PDF解析），支持等级折扣</p>
              <p>• <strong>系统规则</strong>：内置规则，不可删除，部分字段不可修改</p>
              <p>• <strong>优先级</strong>：数值越小优先级越高，优先匹配高优先级规则</p>
            </div>
          </CollapsibleContent>
        </Collapsible>
      </div>

      {/* 创建规则 Dialog */}
      <Dialog open={createDialogOpen} onOpenChange={setCreateDialogOpen}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>创建积分规则</DialogTitle>
          </DialogHeader>
          <PointsRuleForm
            userId={userId}
            userRole={userRole}
            onSuccess={() => {
              setCreateDialogOpen(false);
              loadRules();
            }}
            onCancel={() => setCreateDialogOpen(false)}
          />
        </DialogContent>
      </Dialog>

      {/* 编辑规则对话框 */}
      <Dialog open={!!editingRule} onOpenChange={(open) => !open && setEditingRule(null)}>
        <DialogContent className="max-w-4xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>编辑积分规则</DialogTitle>
          </DialogHeader>
          {editingRule && (
            <PointsRuleForm
              userId={userId}
              userRole={userRole}
              initialData={{
                id: editingRule.id,
                ruleKey: editingRule.ruleKey || editingRule.rule_key || '',
                ruleName: editingRule.ruleName || editingRule.rule_name || '',
                ruleDescription: editingRule.ruleDescription || editingRule.rule_description || '',
                ruleType: (editingRule.ruleType || editingRule.rule_type || 'reward') as any,
                operationType: (editingRule.operationType || editingRule.operation_type || 'register') as any,
                basePoints: editingRule.basePoints ?? editingRule.base_points ?? 0,
                pointsFormula: editingRule.pointsFormula || editingRule.points_formula || '',
                maxPointsPerDay: editingRule.maxPointsPerDay ?? editingRule.max_points_per_day ?? undefined,
                maxPointsTotal: editingRule.maxPointsTotal ?? editingRule.max_points_total ?? undefined,
                conditions: editingRule.conditions || null,
                userLevelMin: editingRule.userLevelMin ?? editingRule.user_level_min ?? 1,
                userLevelMax: editingRule.userLevelMax ?? editingRule.user_level_max ?? 5,
                userRoles: editingRule.userRoles || editingRule.user_roles || [],
                effectiveFrom: (editingRule.effectiveFrom || editingRule.effective_from) ? new Date(editingRule.effectiveFrom || editingRule.effective_from!).toISOString().slice(0, 16) : '',
                effectiveTo: (editingRule.effectiveTo || editingRule.effective_to) ? new Date(editingRule.effectiveTo || editingRule.effective_to!).toISOString().slice(0, 16) : '',
                scheduleCron: editingRule.scheduleCron || editingRule.schedule_cron || '',
                isActive: editingRule.isActive ?? editingRule.is_active ?? true,
                priority: editingRule.priority ?? 0,
                is_system_rule: editingRule.is_system_rule ?? editingRule.isSystemRule ?? false,
                rule_config: editingRule.rule_config,
                discount_config: editingRule.discount_config,
                rule_type: editingRule.rule_type,
              }}
              onSuccess={() => {
                setEditingRule(null);
                loadRules();
              }}
              onCancel={() => setEditingRule(null)}
            />
          )}
        </DialogContent>
      </Dialog>

      {/* 执行历史对话框 */}
      <Dialog open={historyDialogOpen} onOpenChange={setHistoryDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>积分规则执行历史</DialogTitle>
          </DialogHeader>
          <PointsRuleHistoryPanel
            userId={userId}
            userRole={userRole}
            ruleId={selectedRuleId || undefined}
          />
        </DialogContent>
      </Dialog>

      {/* 统计对话框 */}
      <Dialog open={statsDialogOpen} onOpenChange={setStatsDialogOpen}>
        <DialogContent className="max-w-6xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>积分规则统计</DialogTitle>
          </DialogHeader>
          <PointsRuleStatsPanel
            userId={userId}
            userRole={userRole}
          />
        </DialogContent>
      </Dialog>

      {/* 删除确认对话框 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除规则</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除规则「{deleteTarget?.name}」吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              disabled={deleting}
              onClick={(e) => {
                e.preventDefault();
                confirmDeleteRule();
              }}
              className="bg-red-600 hover:bg-red-700 text-white"
            >
              {deleting ? (
                <>
                  <RefreshCw className="h-4 w-4 mr-2 animate-spin" />
                  删除中...
                </>
              ) : (
                <>
                  <Trash2 className="h-4 w-4 mr-2" />
                  确认删除
                </>
              )}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
