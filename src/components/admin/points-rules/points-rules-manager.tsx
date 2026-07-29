'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
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
  BarChart3
} from 'lucide-react';
import { PointsRule, PointsRuleType, RuleType } from '@/types/points-rules';
import { RULE_TYPE_LABELS } from '@/lib/rule-templates';
import { toast } from 'sonner';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '@/components/ui/dialog';
import PointsRuleForm from './points-rule-form';
import PointsRuleHistoryPanel from './points-rule-history';
import PointsRuleStatsPanel from './points-rule-stats';

interface PointsRulesManagerProps {
  userId: string;
  userRole: string;
}

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

  // 加载积分规则
  const loadRules = async () => {
    try {
      setLoading(true);
      const response = await fetch(`/api/admin/points/rules?limit=100`);
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
      const response = await fetch('/api/migrate/unified-points-rules');
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
      const response = await fetch('/api/migrate/unified-points-rules', {
        method: 'POST',
      });
      const data = await response.json();
      
      if (data.success) {
        toast.success('数据库迁移成功', {
          description: `已创建 ${data.tablesCreated?.length || 0} 个表，插入了 ${data.sampleRules?.length || 0} 条默认规则`
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
      const response = await fetch(`/api/admin/points/rules/${ruleId}/activate`, {
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
  const deleteRule = async (ruleId: string | undefined, ruleName: string) => {
    if (!ruleId) {
      toast.error('删除失败', { description: '规则 ID 无效' });
      return;
    }

    if (!confirm(`确定要删除规则 "${ruleName}" 吗？此操作不可撤销。`)) {
      return;
    }

    try {
      const response = await fetch(`/api/admin/points/rules/${ruleId}`, {
        method: 'DELETE',
      });

      const data = await response.json();

      if (data.success) {
        toast.success('规则删除成功');
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
    }
  };

  // 初始化加载
  useEffect(() => {
    loadRules();
    checkMigrationStatus();
  }, []);

  // 过滤规则（支持新的 rule_type 字段）
  const filteredRules = rules.filter(rule => {
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
  });

  // 获取规则类型显示名称（扩展支持三种类型）
  const getRuleTypeDisplay = (type: string) => {
    // 新增类型: reward=奖励类(绿), consume=消耗类(橙), token=Token类(蓝)
    const typeMap: Record<string, { label: string, color: string }> = {
      reward: { label: '奖励类', color: 'bg-green-100 text-green-800 dark:bg-green-900/30 dark:text-green-400' },
      consume: { label: '消耗类', color: 'bg-orange-100 text-orange-800 dark:bg-orange-900/30 dark:text-orange-400' },
      token: { label: 'Token计费', color: 'bg-blue-100 text-blue-800 dark:bg-blue-900/30 dark:text-blue-400' },
      // 兼容原有类型
      consumption: { label: '消费', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
      penalty: { label: '惩罚', color: 'bg-red-100 text-red-800 dark:bg-red-900/30 dark:text-red-400' },
    };
    return typeMap[type] || { label: type, color: 'bg-gray-100 text-gray-800' };
  };

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

  return (
    <div className="space-y-6">
      {/* 迁移状态卡片 */}
      {migrationStatus && !migrationStatus.allTablesExist && (
        <Card className="border-yellow-200 bg-yellow-50">
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
                  {migrationStatus.tables?.map((table: any) => (
                    <li key={table.table} className="flex items-center gap-2">
                      {table.exists ? (
                        <CheckCircle className="h-4 w-4 text-green-500" />
                      ) : (
                        <XCircle className="h-4 w-4 text-red-500" />
                      )}
                      <span className={table.exists ? 'text-green-700' : 'text-red-700'}>
                        {table.description}: {table.exists ? '已存在' : '未创建'}
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

      {/* 控制栏 */}
      <Card>
        <CardHeader className="pb-3">
          <div className="flex flex-col sm:flex-row justify-between items-start sm:items-center gap-4">
            <div>
              <CardTitle>积分规则管理</CardTitle>
              <CardDescription>
                管理用户积分获取和消费的规则，支持条件配置和限制设置
              </CardDescription>
            </div>
            <div className="flex items-center gap-2">
              <Button onClick={loadRules} variant="outline" size="sm">
                <RefreshCw className="h-4 w-4 mr-2" />
                刷新
              </Button>
              <Button size="sm" onClick={() => setCreateDialogOpen(true)}>
                <Plus className="h-4 w-4 mr-2" />
                新建规则
              </Button>
            </div>
          </div>
        </CardHeader>
        <CardContent>
          <div className="flex flex-col sm:flex-row gap-4 mb-6">
            {/* 搜索框 */}
            <div className="flex-1">
              <div className="relative">
                <Search className="absolute left-3 top-1/2 transform -translate-y-1/2 h-4 w-4 text-gray-400" />
                <Input
                  placeholder="搜索规则名称、标识符或描述..."
                  value={search}
                  onChange={(e) => setSearch(e.target.value)}
                  className="pl-10"
                />
              </div>
            </div>

            {/* 过滤器 */}
            <div className="flex gap-2">
              <Select value={ruleTypeFilter} onValueChange={setRuleTypeFilter}>
                <SelectTrigger className="w-[120px]">
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
            </div>
            
            {/* 统计按钮 */}
            <Button 
              variant="outline" 
              className="ml-auto"
              onClick={() => setStatsDialogOpen(true)}
            >
              <BarChart3 className="h-4 w-4 mr-2" />
              统计
            </Button>
            
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
          </div>

          {/* 规则表格 */}
          <div className="border rounded-lg">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>规则名称</TableHead>
                  <TableHead>标识符</TableHead>
                  <TableHead>类型</TableHead>
                  <TableHead>积分</TableHead>
                  <TableHead>操作类型</TableHead>
                  <TableHead>状态</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {loading ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="flex justify-center">
                        <RefreshCw className="h-6 w-6 animate-spin text-gray-400" />
                      </div>
                      <p className="mt-2 text-gray-500">加载中...</p>
                    </TableCell>
                  </TableRow>
                ) : filteredRules.length === 0 ? (
                  <TableRow>
                    <TableCell colSpan={7} className="text-center py-8">
                      <div className="text-gray-500">
                        {rules.length === 0 ? '暂无积分规则' : '没有找到匹配的规则'}
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
                    const ruleTypeDisplay = getRuleTypeDisplay(rType);

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
                          <div className="font-medium">{rName}</div>
                          {rDesc && (
                            <div className="text-sm text-gray-500 mt-1 line-clamp-1">
                              {rDesc}
                            </div>
                          )}
                        </TableCell>
                        <TableCell>
                          {rKey && (
                            <code className="text-xs bg-gray-100 dark:bg-gray-800 px-2 py-1 rounded">
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
                          <div className="text-sm">{rOpType}</div>
                        </TableCell>
                        <TableCell>
                          <div className="flex items-center gap-2">
                            <Switch
                              checked={rActive}
                              onCheckedChange={() => toggleRuleActive(rule.id!, rActive)}
                              disabled={rSystem}
                            />
                            <span className={rActive ? 'text-green-600' : 'text-red-600'}>
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
                          <div className="flex justify-end gap-2">
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
                                deleteRule(rule.id, rName);
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

          {/* 统计信息 */}
          <div className="mt-6 grid grid-cols-1 sm:grid-cols-3 gap-4">
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold">{rules.length}</div>
                <div className="text-sm text-gray-500">总规则数</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-green-600">
                  {rules.filter(r => r.is_active ?? r.isActive).length}
                </div>
                <div className="text-sm text-gray-500">启用中</div>
              </CardContent>
            </Card>
            <Card>
              <CardContent className="pt-6">
                <div className="text-2xl font-bold text-blue-600">
                  {rules.filter(r => r.is_system_rule ?? r.isSystemRule).length}
                </div>
                <div className="text-sm text-gray-500">系统规则</div>
              </CardContent>
            </Card>
          </div>

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
        </CardContent>
      </Card>

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

          {/* 使用说明 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">使用说明</CardTitle>
        </CardHeader>
        <CardContent className="space-y-3 text-sm text-gray-600">
          <p>
            <strong>积分规则系统</strong>允许管理员动态配置用户积分获取和消费规则。
          </p>
          <ul className="list-disc pl-5 space-y-1">
            <li><strong>奖励类规则</strong>（绿色）：用户完成特定操作时获得积分（如注册、每日登录、上传文件）</li>
            <li><strong>消耗类规则</strong>（橙色）：用户使用服务时消耗积分（如生成报价、导出报告），支持等级折扣</li>
            <li><strong>Token计费规则</strong>（蓝色）：按使用量消耗Token（如AI对话、PDF解析），支持等级折扣</li>
            <li><strong>系统规则</strong>：内置规则，不可删除，部分字段不可修改</li>
            <li><strong>优先级</strong>：数值越小优先级越高，优先匹配高优先级规则</li>
          </ul>
          <p className="pt-2">
            首次使用需要先执行 <strong>数据库迁移</strong> 创建必要的数据库表。
          </p>
        </CardContent>
      </Card>
    </div>
  );
}