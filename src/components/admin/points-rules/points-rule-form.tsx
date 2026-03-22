'use client';

import { useState, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { PointsRuleType, RuleType, RewardRuleConfig, ConsumeRuleConfig, TokenRuleConfig, DiscountConfig } from '@/types/points-rules';
import { PointOperationType } from '@/lib/points-service';
import { allRuleTemplates, RULE_TYPE_LABELS, UNIT_TYPE_LABELS } from '@/lib/rule-templates';
import { toast } from 'sonner';
import PointsRuleConditionsEditor from './points-rule-conditions-editor';

interface PointsRuleFormProps {
  userId: string;
  userRole: string;
  onSuccess?: () => void;
  onCancel?: () => void;
  initialData?: Partial<{
    id: string;
    ruleKey: string;
    ruleName: string;
    ruleDescription: string;
    ruleType: PointsRuleType;
    operationType: PointOperationType;
    basePoints: number;
    pointsFormula: string;
    maxPointsPerDay: number;
    maxPointsTotal: number;
    conditions: any;
    userLevelMin: number;
    userLevelMax: number;
    userRoles: string[];
    effectiveFrom: string;
    effectiveTo: string;
    scheduleCron: string;
    isActive: boolean;
    priority: number;
    // 新增字段
    extended_rule_type?: RuleType;
    rule_config?: RewardRuleConfig | ConsumeRuleConfig | TokenRuleConfig;
    discount_config?: DiscountConfig;
    rule_name?: string;
    rule_description?: string;
    rule_key?: string;
    base_points?: number;
    is_active?: boolean;
    is_system_rule?: boolean;
    operation_type?: string;
    rule_type?: string;
  }>;
}

// 原有规则类型选项（保留兼容）
const RULE_TYPE_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: 'reward', label: '奖励类', description: '用户完成任务获得积分' },
  { value: 'consume', label: '消耗类', description: '用户使用功能消耗积分，支持等级折扣' },
  { value: 'token', label: 'Token计费', description: '按使用量消耗Token，支持等级折扣' },
  // 兼容原有类型
  { value: 'consumption', label: '消费(旧)', description: '原有消费类型（兼容）' },
  { value: 'penalty', label: '惩罚(旧)', description: '原有惩罚类型（兼容）' },
];

// 操作类型选项
const OPERATION_TYPE_OPTIONS: { value: string; label: string; description: string }[] = [
  { value: 'register', label: '注册奖励', description: '新用户注册时获得积分' },
  { value: 'daily_login', label: '每日登录', description: '每日登录奖励' },
  { value: 'chat', label: '对话消费', description: '使用对话功能消费积分/Token' },
  { value: 'upload_file', label: '上传文件', description: '上传文件奖励' },
  { value: 'parse_document', label: '文档解析', description: '文档解析消耗Token' },
  { value: 'generate_proposal', label: '生成方案/报价', description: '生成方案消耗积分/Token' },
  { value: 'enhance_proposal', label: '方案增强', description: '方案增强消耗积分' },
  { value: 'export_quote', label: '导出报价单', description: '导出报价单消耗积分' },
  { value: 'recharge', label: '充值', description: '充值获得积分' },
  { value: 'admin_grant', label: '管理员发放', description: '管理员手动发放积分' },
  { value: 'admin_deduct', label: '管理员扣除', description: '管理员手动扣除积分' },
  { value: 'exchange', label: '兑换消费', description: '积分兑换商品' },
  { value: 'refund', label: '退款', description: '积分退款' },
  { value: 'invite_reward', label: '邀请奖励', description: '邀请新用户奖励' },
  { value: 'task_reward', label: '任务奖励', description: '完成任务奖励' },
];

// 默认等级折扣配置
const DEFAULT_DISCOUNT: DiscountConfig = {
  enabled: true,
  levels: [
    { level: 5, discount: 0.5 },
    { level: 4, discount: 0.6 },
    { level: 3, discount: 0.7 },
    { level: 2, discount: 0.8 },
    { level: 1, discount: 1.0 },
  ],
};

export default function PointsRuleForm({ userId, userRole, onSuccess, onCancel, initialData }: PointsRuleFormProps) {
  const [loading, setLoading] = useState(false);
  const isEditing = !!initialData?.id;
  const isSystemRule = !!initialData?.is_system_rule;
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  // 确定当前规则类型（兼容新旧字段）
  const initialExtendedType = initialData?.extended_rule_type
    || (initialData?.rule_type === 'reward' || initialData?.rule_type === 'consume' || initialData?.rule_type === 'token'
      ? initialData.rule_type as RuleType
      : 'reward');

  const [formData, setFormData] = useState({
    // 基本字段（兼容新旧）
    ruleKey: initialData?.ruleKey || initialData?.rule_key || '',
    ruleName: initialData?.ruleName || initialData?.rule_name || '',
    ruleDescription: initialData?.ruleDescription || initialData?.rule_description || '',
    ruleType: initialData?.ruleType || initialData?.rule_type || 'reward',
    operationType: initialData?.operationType || initialData?.operation_type || 'register',
    basePoints: initialData?.basePoints || initialData?.base_points || 10,
    pointsFormula: initialData?.pointsFormula || '',
    maxPointsPerDay: initialData?.maxPointsPerDay ?? null,
    maxPointsTotal: initialData?.maxPointsTotal ?? null,
    conditions: initialData?.conditions || null,
    userLevelMin: initialData?.userLevelMin || 1,
    userLevelMax: initialData?.userLevelMax || 5,
    userRoles: initialData?.userRoles || [],
    effectiveFrom: initialData?.effectiveFrom || '',
    effectiveTo: initialData?.effectiveTo || '',
    scheduleCron: initialData?.scheduleCron || '',
    isActive: initialData?.isActive ?? initialData?.is_active ?? true,
    priority: initialData?.priority || 0,
    // 新增字段
    extendedRuleType: initialExtendedType as RuleType,
  });

  // 规则配置（根据类型动态变化）
  const [rewardConfig, setRewardConfig] = useState<RewardRuleConfig>(
    (initialData?.rule_config as RewardRuleConfig) || { points: 10, trigger_condition: '', daily_limit: null, total_limit: null }
  );
  const [consumeConfig, setConsumeConfig] = useState<ConsumeRuleConfig>(
    (initialData?.rule_config as ConsumeRuleConfig) || { base_cost: 10, unit_cost: 2, unit_type: 'product_count', min_balance: 0 }
  );
  const [tokenConfig, setTokenConfig] = useState<TokenRuleConfig>(
    (initialData?.rule_config as TokenRuleConfig) || { base_tokens: 10, unit_tokens: 2, unit_type: 'product_count', min_balance: 0 }
  );
  const [discountConfig, setDiscountConfig] = useState<DiscountConfig>(
    initialData?.discount_config || DEFAULT_DISCOUNT
  );

  // 稳定的表单字段变更函数
  const handleChange = useCallback((field: string, value: any) => {
    setFormData(prev => ({ ...prev, [field]: value }));
  }, []);

  // 专用的规则类型变更处理函数（替代有循环问题的 useEffect）
  const handleRuleTypeChange = useCallback((newType: RuleType) => {
    setFormData(prev => {
      let basePoints = prev.basePoints;
      if (newType === 'reward') basePoints = rewardConfig.points;
      else if (newType === 'consume') basePoints = consumeConfig.base_cost;
      else if (newType === 'token') basePoints = tokenConfig.base_tokens;

      return {
        ...prev,
        extendedRuleType: newType,
        ruleType: newType,
        basePoints,
      };
    });
    setSelectedTemplate('');
  }, [rewardConfig.points, consumeConfig.base_cost, tokenConfig.base_tokens]);

  // 从模板加载
  const loadTemplate = useCallback((templateKey: string) => {
    if (!templateKey) return;
    const template = allRuleTemplates.find(t => t.ruleKey === templateKey);
    if (!template) return;

    setSelectedTemplate(templateKey);

    // 使用 handleRuleTypeChange 同步设置规则类型和 basePoints
    if (template.ruleType !== formData.extendedRuleType) {
      handleRuleTypeChange(template.ruleType);
    }

    setFormData(prev => ({
      ...prev,
      ruleKey: template.ruleKey,
      ruleName: template.ruleName,
      ruleDescription: template.ruleDescription,
      extendedRuleType: template.ruleType,
      ruleType: template.ruleType,
      operationType: template.operationType,
      isActive: true,
      priority: template.priority,
      basePoints: template.ruleConfig
        ? (template.ruleType === 'reward' ? (template.ruleConfig as RewardRuleConfig).points
          : template.ruleType === 'consume' ? (template.ruleConfig as ConsumeRuleConfig).base_cost
          : (template.ruleConfig as TokenRuleConfig).base_tokens)
        : prev.basePoints,
    }));

    if (template.ruleConfig) {
      if (template.ruleType === 'reward') {
        setRewardConfig(template.ruleConfig as RewardRuleConfig);
      } else if (template.ruleType === 'consume') {
        setConsumeConfig(template.ruleConfig as ConsumeRuleConfig);
      } else if (template.ruleType === 'token') {
        setTokenConfig(template.ruleConfig as TokenRuleConfig);
      }
    }

    if (template.discountConfig) {
      setDiscountConfig(template.discountConfig);
    }
  }, [formData.extendedRuleType, handleRuleTypeChange]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setLoading(true);

    try {
      if (!formData.ruleName.trim()) {
        toast.error('请输入规则名称');
        setLoading(false);
        return;
      }

      // 构建 rule_config
      let ruleConfig = {};
      if (formData.extendedRuleType === 'reward') {
        ruleConfig = rewardConfig;
      } else if (formData.extendedRuleType === 'consume') {
        ruleConfig = consumeConfig;
      } else if (formData.extendedRuleType === 'token') {
        ruleConfig = tokenConfig;
      }

      // 构建 discount_config（仅消耗类和Token类）
      const effectiveDiscountConfig = (formData.extendedRuleType === 'consume' || formData.extendedRuleType === 'token')
        ? discountConfig
        : {};

      const url = isEditing
        ? `/api/admin/points/rules/${initialData!.id}`
        : '/api/admin/points/rules';

      const method = isEditing ? 'PUT' : 'POST';

      const requestBody = {
        rule_key: formData.ruleKey,
        rule_name: formData.ruleName,
        rule_description: formData.ruleDescription,
        rule_type: formData.extendedRuleType,
        operation_type: formData.operationType,
        base_points: formData.basePoints,
        points_formula: formData.pointsFormula || 'fixed',
        max_points_per_day: formData.maxPointsPerDay,
        max_points_total: formData.maxPointsTotal,
        conditions: Array.isArray(formData.conditions) ? formData.conditions : [],
        user_level_min: formData.userLevelMin,
        user_level_max: formData.userLevelMax,
        user_roles: Array.isArray(formData.userRoles) && formData.userRoles.length > 0 ? formData.userRoles : ['user','vip','manufacturer','admin','super_admin'],
        effective_from: formData.effectiveFrom || null,
        effective_to: formData.effectiveTo || null,
        schedule_cron: formData.scheduleCron || null,
        is_active: formData.isActive,
        priority: formData.priority,
        // 创建时为 false，更新时保留原值
        ...(isEditing ? {} : { is_system_rule: false }),
        // 新增字段
        rule_config: ruleConfig,
        discount_config: effectiveDiscountConfig,
      };

      const response = await fetch(url, {
        method,
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(requestBody),
      });

      const result = await response.json();

      if (result.success) {
        toast.success(isEditing ? '规则更新成功' : '规则创建成功');
        if (onSuccess) onSuccess();
      } else {
        toast.error(isEditing ? '规则更新失败' : '规则创建失败', {
          description: result.error || '未知错误',
        });
      }
    } catch (error) {
      console.error(isEditing ? '更新规则失败' : '创建规则失败', error);
      toast.error(isEditing ? '规则更新失败' : '规则创建失败', {
        description: '网络请求异常',
      });
    } finally {
      setLoading(false);
    }
  };

  const isReward = formData.extendedRuleType === 'reward';
  const isConsume = formData.extendedRuleType === 'consume';
  const isToken = formData.extendedRuleType === 'token';
  const showDiscount = isConsume || isToken;

  // 获取按类型分组的模板
  const templatesByType = allRuleTemplates.filter(t => t.ruleType === formData.extendedRuleType);

  return (
    <Card>
      <CardHeader>
        <CardTitle>{isEditing ? '编辑积分规则' : '创建积分规则'}</CardTitle>
        <CardDescription>{isEditing ? '修改现有积分规则配置' : '配置新的积分规则，支持奖励/消耗/Token三类'}</CardDescription>
      </CardHeader>
      <CardContent>
        <form onSubmit={handleSubmit} className="space-y-6">
          {/* 预设模板选择（仅创建时显示） */}
          {!isEditing && (
            <div className="space-y-2">
              <Label>快速创建（从模板）</Label>
              <div className="flex flex-wrap gap-2">
                {allRuleTemplates.map(template => {
                  const typeLabel = RULE_TYPE_LABELS[template.ruleType];
                  return (
                    <Badge
                      key={template.ruleKey}
                      variant={selectedTemplate === template.ruleKey ? 'default' : 'outline'}
                      className="cursor-pointer text-xs"
                      onClick={() => loadTemplate(template.ruleKey)}
                    >
                      {template.ruleName}
                    </Badge>
                  );
                })}
              </div>
            </div>
          )}

          {/* 基本配置 */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">基本配置</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="ruleKey">
                  规则标识符
                  {isSystemRule && <span className="text-amber-600 ml-1 text-xs">（系统规则不可修改）</span>}
                </Label>
                <Input
                  id="ruleKey"
                  placeholder="例如: daily_login"
                  value={formData.ruleKey}
                  onChange={(e) => handleChange('ruleKey', e.target.value)}
                  disabled={isSystemRule}
                />
                <p className="text-xs text-gray-500">唯一标识符，用于系统内部引用</p>
              </div>
              <div className="space-y-2">
                <Label htmlFor="ruleName">
                  规则名称 *
                  {isSystemRule && <span className="text-amber-600 ml-1 text-xs">（系统规则不可修改）</span>}
                </Label>
                <Input
                  id="ruleName"
                  placeholder="例如: 每日登录奖励"
                  value={formData.ruleName}
                  onChange={(e) => handleChange('ruleName', e.target.value)}
                  required
                  disabled={isSystemRule}
                />
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="ruleDescription">规则描述</Label>
              <Textarea
                id="ruleDescription"
                placeholder="描述规则的作用和适用场景"
                value={formData.ruleDescription}
                onChange={(e) => handleChange('ruleDescription', e.target.value)}
                rows={2}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="extendedRuleType">规则类型 *</Label>
                <Select
                  value={formData.extendedRuleType}
                  onValueChange={(value) => handleRuleTypeChange(value as RuleType)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择规则类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {RULE_TYPE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        <div>
                          <div className="font-medium">{option.label}</div>
                          <div className="text-xs text-gray-500">{option.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="operationType">操作类型</Label>
                <Select
                  value={formData.operationType}
                  onValueChange={(value) => handleChange('operationType', value)}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="选择操作类型" />
                  </SelectTrigger>
                  <SelectContent>
                    {OPERATION_TYPE_OPTIONS.map(option => (
                      <SelectItem key={option.value} value={option.value}>
                        <div>
                          <div className="font-medium">{option.label}</div>
                          <div className="text-xs text-gray-500">{option.description}</div>
                        </div>
                      </SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </div>

          {/* 动态配置区域（根据规则类型显示不同内容） */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">
              {isReward ? '奖励配置' : isConsume ? '消耗配置' : isToken ? 'Token计费配置' : '规则配置'}
            </h3>

            {/* 奖励类配置 */}
            {isReward && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>奖励积分值</Label>
                  <Input
                    type="number"
                    value={rewardConfig.points}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setRewardConfig(prev => ({ ...prev, points: val }));
                      handleChange('basePoints', val);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>触发条件</Label>
                  <Input
                    value={rewardConfig.trigger_condition}
                    onChange={(e) => setRewardConfig(prev => ({ ...prev, trigger_condition: e.target.value }))}
                    placeholder="例如: daily_login, upload_file"
                  />
                </div>
                <div className="space-y-2">
                  <Label>每日上限</Label>
                  <Input
                    type="number"
                    value={rewardConfig.daily_limit ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      setRewardConfig(prev => ({ ...prev, daily_limit: val }));
                      handleChange('maxPointsPerDay', val);
                    }}
                    placeholder="留空=无限制"
                  />
                </div>
                <div className="space-y-2">
                  <Label>总上限</Label>
                  <Input
                    type="number"
                    value={rewardConfig.total_limit ?? ''}
                    onChange={(e) => {
                      const val = e.target.value ? parseInt(e.target.value) : null;
                      setRewardConfig(prev => ({ ...prev, total_limit: val }));
                      handleChange('maxPointsTotal', val);
                    }}
                    placeholder="留空=无限制"
                  />
                </div>
              </div>
            )}

            {/* 消耗类配置 */}
            {isConsume && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>基础消耗（积分）</Label>
                  <Input
                    type="number"
                    value={consumeConfig.base_cost}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setConsumeConfig(prev => ({ ...prev, base_cost: val }));
                      handleChange('basePoints', val);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>单位消耗（积分）</Label>
                  <Input
                    type="number"
                    value={consumeConfig.unit_cost}
                    onChange={(e) => setConsumeConfig(prev => ({ ...prev, unit_cost: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>单位类型</Label>
                  <Select
                    value={consumeConfig.unit_type}
                    onValueChange={(value) => setConsumeConfig(prev => ({ ...prev, unit_type: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(UNIT_TYPE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>最低余额要求</Label>
                  <Input
                    type="number"
                    value={consumeConfig.min_balance}
                    onChange={(e) => setConsumeConfig(prev => ({ ...prev, min_balance: parseInt(e.target.value) || 0 }))}
                  />
                  <p className="text-xs text-gray-500">用户积分低于此值时禁止操作</p>
                </div>
              </div>
            )}

            {/* Token计费类配置 */}
            {isToken && (
              <div className="grid grid-cols-2 gap-4">
                <div className="space-y-2">
                  <Label>基础Token值</Label>
                  <Input
                    type="number"
                    value={tokenConfig.base_tokens}
                    onChange={(e) => {
                      const val = parseInt(e.target.value) || 0;
                      setTokenConfig(prev => ({ ...prev, base_tokens: val }));
                      handleChange('basePoints', val);
                    }}
                  />
                </div>
                <div className="space-y-2">
                  <Label>单位Token值</Label>
                  <Input
                    type="number"
                    value={tokenConfig.unit_tokens}
                    onChange={(e) => setTokenConfig(prev => ({ ...prev, unit_tokens: parseInt(e.target.value) || 0 }))}
                  />
                </div>
                <div className="space-y-2">
                  <Label>单位类型</Label>
                  <Select
                    value={tokenConfig.unit_type}
                    onValueChange={(value) => setTokenConfig(prev => ({ ...prev, unit_type: value as any }))}
                  >
                    <SelectTrigger>
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {Object.entries(UNIT_TYPE_LABELS).map(([key, label]) => (
                        <SelectItem key={key} value={key}>{label}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                </div>
                <div className="space-y-2">
                  <Label>最低Token余额</Label>
                  <Input
                    type="number"
                    value={tokenConfig.min_balance}
                    onChange={(e) => setTokenConfig(prev => ({ ...prev, min_balance: parseInt(e.target.value) || 0 }))}
                  />
                </div>
              </div>
            )}

            {/* 等级折扣配置（仅消耗类和Token类） */}
            {showDiscount && (
              <div className="space-y-3 p-4 border rounded-lg bg-gray-50 dark:bg-gray-900">
                <div className="flex items-center justify-between">
                  <Label className="font-semibold">等级折扣配置</Label>
                  <Switch
                    checked={discountConfig.enabled}
                    onCheckedChange={(checked) => setDiscountConfig(prev => ({ ...prev, enabled: checked }))}
                  />
                </div>
                {discountConfig.enabled && (
                  <div className="space-y-2">
                    <p className="text-xs text-gray-500">配置不同用户等级的折扣率（1.0=无折扣，0.5=五折）</p>
                    <div className="grid grid-cols-5 gap-2">
                      {discountConfig.levels.map((levelConfig, index) => (
                        <div key={levelConfig.level} className="space-y-1">
                          <Label className="text-xs">等级 {levelConfig.level}</Label>
                          <Input
                            type="number"
                            step="0.1"
                            min="0"
                            max="1"
                            value={levelConfig.discount}
                            onChange={(e) => {
                              const newLevels = [...discountConfig.levels];
                              newLevels[index] = { ...newLevels[index], discount: parseFloat(e.target.value) || 1.0 };
                              setDiscountConfig(prev => ({ ...prev, levels: newLevels }));
                            }}
                            className="text-sm"
                          />
                          <span className="text-xs text-gray-400">{Math.round(levelConfig.discount * 100)}%折</span>
                        </div>
                      ))}
                    </div>
                  </div>
                )}
              </div>
            )}
          </div>

          {/* 高级配置 */}
          <div className="space-y-4">
            <h3 className="text-lg font-semibold">高级配置</h3>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>用户等级范围</Label>
                <div className="flex items-center gap-2">
                  <Input
                    type="number"
                    value={formData.userLevelMin}
                    onChange={(e) => handleChange('userLevelMin', parseInt(e.target.value) || 1)}
                    className="w-20"
                  />
                  <span className="text-gray-500">-</span>
                  <Input
                    type="number"
                    value={formData.userLevelMax}
                    onChange={(e) => handleChange('userLevelMax', parseInt(e.target.value) || 5)}
                    className="w-20"
                  />
                </div>
              </div>
              <div className="space-y-2">
                <Label>优先级</Label>
                <Input
                  type="number"
                  value={formData.priority}
                  onChange={(e) => handleChange('priority', parseInt(e.target.value) || 0)}
                />
                <p className="text-xs text-gray-500">数值越大越靠前</p>
              </div>
            </div>

            <div className="space-y-2">
              <Label>条件配置</Label>
              <PointsRuleConditionsEditor
                value={formData.conditions}
                onChange={(value) => handleChange('conditions', value)}
              />
            </div>

            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>生效时间</Label>
                <Input
                  type="datetime-local"
                  value={formData.effectiveFrom}
                  onChange={(e) => handleChange('effectiveFrom', e.target.value)}
                />
              </div>
              <div className="space-y-2">
                <Label>失效时间</Label>
                <Input
                  type="datetime-local"
                  value={formData.effectiveTo}
                  onChange={(e) => handleChange('effectiveTo', e.target.value)}
                />
              </div>
            </div>
          </div>

          {/* 状态 & 提交 */}
          <div className="flex items-center justify-between">
            <div className="flex items-center space-x-2">
              <Switch
                checked={formData.isActive}
                onCheckedChange={(checked) => handleChange('isActive', checked)}
              />
              <Label>启用规则</Label>
            </div>
            <div className="flex gap-2">
              {onCancel && (
                <Button type="button" variant="outline" onClick={onCancel} disabled={loading}>
                  取消
                </Button>
              )}
              <Button type="submit" disabled={loading}>
                {loading ? (isEditing ? '更新中...' : '创建中...') : (isEditing ? '更新规则' : '创建规则')}
              </Button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
}
