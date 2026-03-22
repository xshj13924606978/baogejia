'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Label } from '@/components/ui/label';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { 
  Plus, 
  Trash2, 
  ChevronDown, 
  ChevronRight,
  CheckCircle,
  XCircle
} from 'lucide-react';
import { ConditionType, ConditionOperator, LogicalOperator } from '@/types/points-rules';

// 条件配置项
interface ConditionItem {
  id: string;
  conditionType: ConditionType;
  conditionKey: string;
  conditionOperator: ConditionOperator;
  conditionValue: any;
  logicalOperator: LogicalOperator;
  conditionGroup: number;
  description?: string;
}

interface PointsRuleConditionsEditorProps {
  value?: any;
  onChange?: (value: any) => void;
}

// 条件类型选项
const CONDITION_TYPE_OPTIONS: { value: ConditionType; label: string; description: string }[] = [
  { value: 'user_level', label: '用户等级', description: '基于用户等级的条件' },
  { value: 'user_role', label: '用户角色', description: '基于用户角色的条件' },
  { value: 'time_range', label: '时间范围', description: '基于时间范围的条件' },
  { value: 'frequency', label: '频率限制', description: '基于频率限制的条件' },
  { value: 'day_of_week', label: '星期几', description: '基于星期几的条件' },
  { value: 'time_of_day', label: '一天中的时间', description: '基于一天中时间的条件' },
  { value: 'custom_field', label: '自定义字段', description: '基于自定义字段的条件' },
  { value: 'previous_actions', label: '前置操作', description: '基于前置操作的条件' },
  { value: 'points_balance', label: '积分余额', description: '基于积分余额的条件' },
  { value: 'user_age_days', label: '用户注册天数', description: '基于用户注册天数的条件' },
];

// 操作符选项
const CONDITION_OPERATOR_OPTIONS: Record<ConditionType, { value: ConditionOperator; label: string; description: string }[]> = {
  user_level: [
    { value: 'eq', label: '等于', description: '等于指定等级' },
    { value: 'ne', label: '不等于', description: '不等于指定等级' },
    { value: 'gt', label: '大于', description: '大于指定等级' },
    { value: 'gte', label: '大于等于', description: '大于等于指定等级' },
    { value: 'lt', label: '小于', description: '小于指定等级' },
    { value: 'lte', label: '小于等于', description: '小于等于指定等级' },
    { value: 'between', label: '在范围内', description: '在指定等级范围内' },
  ],
  user_role: [
    { value: 'eq', label: '等于', description: '等于指定角色' },
    { value: 'ne', label: '不等于', description: '不等于指定角色' },
    { value: 'in', label: '在列表中', description: '在指定角色列表中' },
    { value: 'not_in', label: '不在列表中', description: '不在指定角色列表中' },
  ],
  time_range: [
    { value: 'between', label: '在范围内', description: '在指定时间范围内' },
    { value: 'not_between', label: '不在范围内', description: '不在指定时间范围内' },
  ],
  frequency: [
    { value: 'lt', label: '小于', description: '小于指定次数' },
    { value: 'lte', label: '小于等于', description: '小于等于指定次数' },
    { value: 'gt', label: '大于', description: '大于指定次数' },
    { value: 'gte', label: '大于等于', description: '大于等于指定次数' },
    { value: 'eq', label: '等于', description: '等于指定次数' },
  ],
  day_of_week: [
    { value: 'in', label: '在列表中', description: '在指定的星期几列表中' },
    { value: 'not_in', label: '不在列表中', description: '不在指定的星期几列表中' },
  ],
  time_of_day: [
    { value: 'between', label: '在范围内', description: '在一天中的指定时间范围内' },
    { value: 'not_between', label: '不在范围内', description: '不在一天中的指定时间范围内' },
  ],
  custom_field: [
    { value: 'eq', label: '等于', description: '等于指定值' },
    { value: 'ne', label: '不等于', description: '不等于指定值' },
    { value: 'gt', label: '大于', description: '大于指定值' },
    { value: 'gte', label: '大于等于', description: '大于等于指定值' },
    { value: 'lt', label: '小于', description: '小于指定值' },
    { value: 'lte', label: '小于等于', description: '小于等于指定值' },
    { value: 'contains', label: '包含', description: '包含指定值' },
    { value: 'regex', label: '正则匹配', description: '匹配正则表达式' },
  ],
  previous_actions: [
    { value: 'gt', label: '大于', description: '大于指定次数' },
    { value: 'gte', label: '大于等于', description: '大于等于指定次数' },
    { value: 'lt', label: '小于', description: '小于指定次数' },
    { value: 'lte', label: '小于等于', description: '小于等于指定次数' },
    { value: 'eq', label: '等于', description: '等于指定次数' },
  ],
  points_balance: [
    { value: 'gt', label: '大于', description: '大于指定积分' },
    { value: 'gte', label: '大于等于', description: '大于等于指定积分' },
    { value: 'lt', label: '小于', description: '小于指定积分' },
    { value: 'lte', label: '小于等于', description: '小于等于指定积分' },
    { value: 'eq', label: '等于', description: '等于指定积分' },
  ],
  user_age_days: [
    { value: 'gt', label: '大于', description: '大于指定天数' },
    { value: 'gte', label: '大于等于', description: '大于等于指定天数' },
    { value: 'lt', label: '小于', description: '小于指定天数' },
    { value: 'lte', label: '小于等于', description: '小于等于指定天数' },
    { value: 'eq', label: '等于', description: '等于指定天数' },
    { value: 'between', label: '在范围内', description: '在指定天数范围内' },
  ],
};

// 默认条件配置
const DEFAULT_CONDITION: Omit<ConditionItem, 'id'> = {
  conditionType: 'user_level',
  conditionKey: 'user_level',
  conditionOperator: 'gte',
  conditionValue: 1,
  logicalOperator: 'AND',
  conditionGroup: 0,
  description: '',
};

export default function PointsRuleConditionsEditor({ value, onChange }: PointsRuleConditionsEditorProps) {
  const [conditions, setConditions] = useState<ConditionItem[]>([]);
  const [expandedGroup, setExpandedGroup] = useState<number | null>(0);
  const [jsonMode, setJsonMode] = useState(false);
  const [jsonError, setJsonError] = useState<string | null>(null);

  // 用于跟踪上一次通知父组件的值，防止循环更新
  const lastNotifiedRef = useRef<any>(null);

  // 初始化：从value解析条件（仅在value实质变化时更新）
  useEffect(() => {
    if (!value) {
      if (conditions.length > 0) {
        setConditions([]);
      }
      lastNotifiedRef.current = null;
      return;
    }

    try {
      let parsedConditions: ConditionItem[] = [];

      if (Array.isArray(value)) {
        parsedConditions = value.map((cond, index) => ({
          id: `cond-${index}`,
          ...DEFAULT_CONDITION,
          ...cond,
        }));
      } else if (typeof value === 'object') {
        parsedConditions = [{
          id: 'cond-0',
          ...DEFAULT_CONDITION,
          ...value,
        }];
      }

      // 深度比较：只有当 value 与上次通知父组件的值不同时才更新内部状态
      const valueStr = JSON.stringify(value);
      const lastNotifiedStr = JSON.stringify(lastNotifiedRef.current);
      if (valueStr !== lastNotifiedStr) {
        setConditions(parsedConditions);
        lastNotifiedRef.current = value;
      }
    } catch (error) {
      console.error('解析条件失败:', error);
      if (conditions.length > 0) {
        setConditions([]);
      }
    }
  }, [value]); // eslint-disable-line react-hooks/exhaustive-deps

  // 当条件变化时通知父组件（避免循环：跳过与父组件传入值相同的更新）
  useEffect(() => {
    if (!onChange) return;

    if (conditions.length === 0) {
      if (lastNotifiedRef.current !== null) {
        lastNotifiedRef.current = null;
        onChange(null);
      }
      return;
    }

    // 转换为原始格式
    const formattedConditions = conditions.map(cond => ({
      conditionType: cond.conditionType,
      conditionKey: cond.conditionKey,
      conditionOperator: cond.conditionOperator,
      conditionValue: cond.conditionValue,
      logicalOperator: cond.logicalOperator,
      conditionGroup: cond.conditionGroup,
      description: cond.description,
    }));

    const output = formattedConditions.length === 1 ? formattedConditions[0] : formattedConditions;

    // 深度比较：只有当输出与上次通知的值不同时才通知父组件
    const outputStr = JSON.stringify(output);
    const lastNotifiedStr = JSON.stringify(lastNotifiedRef.current);
    if (outputStr !== lastNotifiedStr) {
      lastNotifiedRef.current = output;
      onChange(output);
    }
  }, [conditions, onChange]);

  // 添加新条件
  const addCondition = () => {
    const newId = `cond-${Date.now()}`;
    const newCondition: ConditionItem = {
      id: newId,
      ...DEFAULT_CONDITION,
      conditionGroup: conditions.length > 0 ? conditions[conditions.length - 1].conditionGroup : 0,
    };
    setConditions([...conditions, newCondition]);
  };

  // 删除条件
  const removeCondition = (id: string) => {
    setConditions(conditions.filter(cond => cond.id !== id));
  };

  // 更新条件
  const updateCondition = (id: string, field: keyof ConditionItem, value: any) => {
    setConditions(conditions.map(cond => {
      if (cond.id === id) {
        return { ...cond, [field]: value };
      }
      return cond;
    }));
  };

  // 添加条件组
  const addConditionGroup = () => {
    const newGroupId = conditions.length > 0 ? Math.max(...conditions.map(c => c.conditionGroup)) + 1 : 0;
    const newId = `cond-${Date.now()}`;
    const newCondition: ConditionItem = {
      id: newId,
      ...DEFAULT_CONDITION,
      conditionGroup: newGroupId,
      logicalOperator: 'AND',
    };
    setConditions([...conditions, newCondition]);
    setExpandedGroup(newGroupId);
  };

  // 获取条件组
  const getConditionGroups = () => {
    const groups: { [key: number]: ConditionItem[] } = {};
    conditions.forEach(cond => {
      if (!groups[cond.conditionGroup]) {
        groups[cond.conditionGroup] = [];
      }
      groups[cond.conditionGroup].push(cond);
    });
    return groups;
  };

  // 渲染条件值输入
  const renderValueInput = (condition: ConditionItem) => {
    const { conditionType, conditionValue } = condition;

    switch (conditionType) {
      case 'user_level':
      case 'user_age_days':
      case 'points_balance':
      case 'frequency':
      case 'previous_actions':
        return (
          <Input
            type="number"
            value={conditionValue || ''}
            onChange={(e) => updateCondition(condition.id, 'conditionValue', parseInt(e.target.value) || 0)}
            placeholder="输入数值"
            className="flex-1"
          />
        );

      case 'user_role':
        return (
          <Input
            value={conditionValue || ''}
            onChange={(e) => updateCondition(condition.id, 'conditionValue', e.target.value)}
            placeholder="例如: premium, admin"
            className="flex-1"
          />
        );

      case 'time_range':
      case 'time_of_day':
        return (
          <div className="flex gap-2">
            <Input
              type="time"
              value={conditionValue?.start || ''}
              onChange={(e) => {
                const newValue = {
                  ...(typeof conditionValue === 'object' ? conditionValue : {}),
                  start: e.target.value,
                };
                updateCondition(condition.id, 'conditionValue', newValue);
              }}
              placeholder="开始时间"
              className="flex-1"
            />
            <Input
              type="time"
              value={conditionValue?.end || ''}
              onChange={(e) => {
                const newValue = {
                  ...(typeof conditionValue === 'object' ? conditionValue : {}),
                  end: e.target.value,
                };
                updateCondition(condition.id, 'conditionValue', newValue);
              }}
              placeholder="结束时间"
              className="flex-1"
            />
          </div>
        );

      case 'day_of_week':
        return (
          <Input
            value={conditionValue || ''}
            onChange={(e) => updateCondition(condition.id, 'conditionValue', e.target.value)}
            placeholder="例如: 1,2,3 (周一到周三)"
            className="flex-1"
          />
        );

      case 'custom_field':
        return (
          <Textarea
            value={conditionValue || ''}
            onChange={(e) => updateCondition(condition.id, 'conditionValue', e.target.value)}
            placeholder="输入自定义字段值"
            rows={2}
            className="flex-1"
          />
        );

      default:
        return (
          <Input
            value={conditionValue || ''}
            onChange={(e) => updateCondition(condition.id, 'conditionValue', e.target.value)}
            placeholder="输入值"
            className="flex-1"
          />
        );
    }
  };

  // 获取条件类型显示名称
  const getConditionTypeDisplay = (type: ConditionType) => {
    const option = CONDITION_TYPE_OPTIONS.find(opt => opt.value === type);
    return option?.label || type;
  };

  // 获取操作符显示名称
  const getOperatorDisplay = (operator: ConditionOperator) => {
    for (const typeOptions of Object.values(CONDITION_OPERATOR_OPTIONS)) {
      const option = typeOptions.find(opt => opt.value === operator);
      if (option) return option.label;
    }
    return operator;
  };

  const conditionGroups = getConditionGroups();

  return (
    <div className="space-y-4">
      <div className="flex items-center justify-between">
        <div>
          <h3 className="text-lg font-semibold">条件配置</h3>
          <p className="text-sm text-gray-500">配置规则触发所需的条件，可配置多个条件和条件组</p>
        </div>
        <div className="flex gap-2">
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={() => setJsonMode(!jsonMode)}
          >
            {jsonMode ? '切换到可视化' : '切换到JSON'}
          </Button>
          <Button
            type="button"
            size="sm"
            onClick={addCondition}
          >
            <Plus className="h-4 w-4 mr-2" />
            添加条件
          </Button>
          <Button
            type="button"
            variant="outline"
            size="sm"
            onClick={addConditionGroup}
          >
            <Plus className="h-4 w-4 mr-2" />
            添加条件组
          </Button>
        </div>
      </div>

      {jsonMode ? (
        <div className="space-y-2">
          <Label>JSON配置</Label>
          <Textarea
            value={value ? JSON.stringify(value, null, 2) : ''}
            onChange={(e) => {
              try {
                const text = e.target.value.trim();
                if (!text) {
                  onChange?.(null);
                  setJsonError(null);
                  return;
                }
                const parsed = JSON.parse(text);
                onChange?.(parsed);
                setJsonError(null);
              } catch (err) {
                setJsonError('JSON格式错误');
              }
            }}
            rows={6}
            className="font-mono text-sm"
            placeholder='输入JSON格式的条件配置'
          />
          {jsonError && (
            <div className="flex items-center gap-1 text-red-600 text-sm">
              <XCircle className="h-4 w-4" />
              {jsonError}
            </div>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {Object.keys(conditionGroups).length === 0 ? (
            <Card>
              <CardContent className="pt-6 text-center text-gray-500">
                <p>暂无条件配置</p>
                <p className="text-sm mt-1">点击"添加条件"按钮开始配置</p>
              </CardContent>
            </Card>
          ) : (
            Object.entries(conditionGroups).map(([groupId, groupConditions]) => (
              <Card key={`group-${groupId}`}>
                <CardHeader className="pb-3">
                  <div className="flex items-center justify-between">
                    <div className="flex items-center gap-2">
                      <Button
                        variant="ghost"
                        size="icon"
                        className="h-6 w-6"
                        onClick={() => setExpandedGroup(expandedGroup === parseInt(groupId) ? null : parseInt(groupId))}
                      >
                        {expandedGroup === parseInt(groupId) ? (
                          <ChevronDown className="h-4 w-4" />
                        ) : (
                          <ChevronRight className="h-4 w-4" />
                        )}
                      </Button>
                      <CardTitle className="text-base">
                        条件组 {parseInt(groupId) + 1}
                        {groupConditions.length > 0 && (
                          <Badge variant="outline" className="ml-2">
                            {groupConditions.length} 个条件
                          </Badge>
                        )}
                      </CardTitle>
                    </div>
                    <div className="flex items-center gap-2">
                      {groupConditions.length > 0 && (
                        <>
                          <span className="text-sm text-gray-500">逻辑运算符:</span>
                          <Select
                            value={groupConditions[0].logicalOperator}
                            onValueChange={(value: LogicalOperator) => {
                              groupConditions.forEach(cond => {
                                updateCondition(cond.id, 'logicalOperator', value);
                              });
                            }}
                          >
                            <SelectTrigger className="w-[100px]">
                              <SelectValue />
                            </SelectTrigger>
                            <SelectContent>
                              <SelectItem value="AND">AND (且)</SelectItem>
                              <SelectItem value="OR">OR (或)</SelectItem>
                            </SelectContent>
                          </Select>
                        </>
                      )}
                    </div>
                  </div>
                </CardHeader>
                {expandedGroup === parseInt(groupId) && (
                  <CardContent className="space-y-4">
                    {groupConditions.map((condition, index) => (
                      <div key={condition.id} className="border rounded-lg p-4 space-y-3">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-2">
                            <Badge variant="secondary">条件 {index + 1}</Badge>
                            {condition.description && (
                              <span className="text-sm text-gray-600">{condition.description}</span>
                            )}
                          </div>
                          <Button
                            type="button"
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50"
                            onClick={() => removeCondition(condition.id)}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>

                        <div className="grid grid-cols-1 md:grid-cols-4 gap-3">
                          <div className="space-y-1">
                            <Label className="text-xs">条件类型</Label>
                            <Select
                              value={condition.conditionType}
                              onValueChange={(value: ConditionType) => {
                                updateCondition(condition.id, 'conditionType', value);
                                // 重置操作符为默认值
                                const defaultOperator = CONDITION_OPERATOR_OPTIONS[value]?.[0]?.value || 'eq';
                                updateCondition(condition.id, 'conditionOperator', defaultOperator);
                                // 重置条件键
                                updateCondition(condition.id, 'conditionKey', value);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {CONDITION_TYPE_OPTIONS.map((option) => (
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

                          <div className="space-y-1">
                            <Label className="text-xs">操作符</Label>
                            <Select
                              value={condition.conditionOperator}
                              onValueChange={(value: ConditionOperator) => {
                                updateCondition(condition.id, 'conditionOperator', value);
                              }}
                            >
                              <SelectTrigger>
                                <SelectValue />
                              </SelectTrigger>
                              <SelectContent>
                                {(CONDITION_OPERATOR_OPTIONS[condition.conditionType] || []).map((option) => (
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

                          <div className="space-y-1 md:col-span-2">
                            <Label className="text-xs">条件值</Label>
                            {renderValueInput(condition)}
                          </div>
                        </div>

                        <div className="space-y-1">
                          <Label className="text-xs">条件描述 (可选)</Label>
                          <Input
                            value={condition.description || ''}
                            onChange={(e) => updateCondition(condition.id, 'description', e.target.value)}
                            placeholder="描述此条件的用途"
                          />
                        </div>
                      </div>
                    ))}

                    <div className="pt-2">
                      <Button
                        type="button"
                        variant="outline"
                        size="sm"
                        onClick={() => {
                          const newId = `cond-${Date.now()}`;
                          const newCondition: ConditionItem = {
                            id: newId,
                            ...DEFAULT_CONDITION,
                            conditionGroup: parseInt(groupId),
                            logicalOperator: groupConditions[0]?.logicalOperator || 'AND',
                          };
                          setConditions([...conditions, newCondition]);
                        }}
                      >
                        <Plus className="h-4 w-4 mr-2" />
                        向此组添加条件
                      </Button>
                    </div>
                  </CardContent>
                )}
              </Card>
            ))
          )}

          <div className="text-sm text-gray-500 pt-2">
            <p>说明：</p>
            <ul className="list-disc pl-5 space-y-1">
              <li>同一组内的条件使用相同的逻辑运算符（AND 或 OR）</li>
              <li>不同组之间使用 AND 连接</li>
              <li>条件不配置表示无限制</li>
            </ul>
          </div>
        </div>
      )}
    </div>
  );
}