'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import {
  Loader2,
  Save,
  RefreshCw,
  AlertTriangle,
  Database,
  CheckCircle2,
  RotateCcw,
  TestTube,
} from 'lucide-react';
import { toast } from '@/components/ui/use-toast';
import { duplicateCheckTemplates, getDefaultTemplate, generateRuleDescription } from '@/lib/duplicate-check-templates';
import { DuplicateChecker } from '@/lib/duplicate-checker';

interface FieldConfig {
  id: number;
  field_key: string;
  field_name: string;
  field_label: string;
  is_required: boolean;
  is_duplicate_check?: boolean;
  display_order?: number;
}

interface DuplicateCheckConfigProps {
  onUpdate?: () => void;
}

export function DuplicateCheckConfig({ onUpdate }: DuplicateCheckConfigProps) {
  const [allFields, setAllFields] = useState<FieldConfig[]>([]);
  const [selectedFields, setSelectedFields] = useState<string[]>([]);
  const [loading, setLoading] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [needsInit, setNeedsInit] = useState(false);
  const [sqlStatements, setSqlStatements] = useState<string | null>(null);
  const [initing, setIniting] = useState(false);
  const [testing, setTesting] = useState(false);
  const [selectedTemplate, setSelectedTemplate] = useState<string>('');

  // 加载配置
  const loadConfig = async () => {
    setLoading(true);
    setError(null);
    setNeedsInit(false);
    try {
      const response = await fetch('/api/tables/products/duplicate-check-config');
      const result = await response.json();

      if (result.success) {
        setAllFields(result.data.allFields || []);
        setSelectedFields(result.data.duplicateCheckFields?.map((f: FieldConfig) => f.field_key) || []);
      } else {
        setError(result.error || '加载配置失败');

        // 检查是否需要初始化
        if (result.needInit) {
          console.log('检测到需要初始化数据库');
          setNeedsInit(true);
          
          // 尝试获取初始化SQL
          try {
            const initResponse = await fetch('/api/admin/init-duplicate-check', {
              method: 'POST',
            });
            const initResult = await initResponse.json();
            
            if (initResult.requiresManualSetup) {
              setSqlStatements(initResult.sqlStatements);
            }
          } catch (initErr) {
            console.error('获取初始化SQL失败:', initErr);
          }
        }
        // 检查是否是表不存在
        else if (result.error && result.error.includes('product_field_configs') && result.error.includes('does not exist')) {
          console.log('检测到 product_field_configs 表不存在');
          setNeedsInit(true);
          try {
            const initResponse = await fetch('/api/admin/init-duplicate-check', {
              method: 'POST',
            });
            const initResult = await initResponse.json();

            if (initResult.requiresManualSetup) {
              setSqlStatements(initResult.sqlStatements);
              setError('product_field_configs 表不存在，需要初始化');
            } else if (initResult.success) {
              // 初始化成功，重新加载
              await loadConfig();
            }
          } catch (initErr) {
            console.error('检查初始化状态失败:', initErr);
          }
        }
        // 检查是否需要初始化判重字段
        else if (result.error && result.error.includes('is_duplicate_check')) {
          console.log('检测到需要初始化判重字段');
          setNeedsInit(true);
          try {
            const initResponse = await fetch('/api/admin/init-duplicate-check', {
              method: 'POST',
            });
            const initResult = await initResponse.json();

            if (initResult.requiresManualSetup) {
              setSqlStatements(initResult.sqlStatements);
              setError('数据库表结构不完整，需要初始化');
            } else if (initResult.success) {
              // 初始化成功，重新加载
              await loadConfig();
            }
          } catch (initErr) {
            console.error('检查初始化状态失败:', initErr);
          }
        }
      }
    } catch (err) {
      setError('加载配置失败：' + (err instanceof Error ? err.message : '未知错误'));
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    loadConfig();
  }, []);

  // 处理字段选择
  const handleFieldToggle = (fieldKey: string, checked: boolean) => {
    if (checked) {
      setSelectedFields([...selectedFields, fieldKey]);
    } else {
      setSelectedFields(selectedFields.filter((key) => key !== fieldKey));
    }
  };

  // 保存配置
  const handleSave = async () => {
    if (selectedFields.length === 0) {
      toast({
        variant: 'destructive',
        title: '保存失败',
        description: '至少需要选择一个判重字段',
      });
      return;
    }

    setSaving(true);
    setError(null);
    try {
      const response = await fetch('/api/tables/products/duplicate-check-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duplicateCheckFields: selectedFields,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: '保存成功',
          description: result.message,
        });
        onUpdate?.();
        await loadConfig(); // 重新加载配置
      } else {
        setError(result.error || '保存失败');
        toast({
          variant: 'destructive',
          title: '保存失败',
          description: result.error,
        });
      }
    } catch (err) {
      const errorMsg = '保存失败：' + (err instanceof Error ? err.message : '未知错误');
      setError(errorMsg);
      toast({
        variant: 'destructive',
        title: '保存失败',
        description: errorMsg,
      });
    } finally {
      setSaving(false);
    }
  };

  // 复制 SQL 语句
  const handleCopySql = () => {
    if (sqlStatements) {
      navigator.clipboard.writeText(sqlStatements);
      toast({
        title: '已复制',
        description: 'SQL 语句已复制到剪贴板',
      });
    }
  };

  // 测试判重规则
  const handleTestConfig = async () => {
    if (selectedFields.length === 0) {
      toast({
        variant: 'destructive',
        title: '测试失败',
        description: '请先选择至少一个判重字段',
      });
      return;
    }

    setTesting(true);
    try {
      // 模拟测试数据
      const testData = {
        name: '测试产品',
        model: 'TEST-001',
        brand: '测试品牌',
        parameter_description: '测试参数',
      };

      // 创建判重检查器
      const checker = new DuplicateChecker({
        fields: selectedFields,
        matchRule: 'and',
      });

      const description = generateRuleDescription(selectedFields);

      toast({
        title: '✅ 判重规则测试通过',
        description: (
          <div className="mt-2 space-y-1">
            <p className="text-sm font-medium">当前规则：</p>
            <p className="text-sm text-muted-foreground">{description}</p>
            <p className="text-sm font-medium mt-2">使用字段：{selectedFields.length} 个</p>
          </div>
        ),
      });
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '测试失败',
        description: err instanceof Error ? err.message : '未知错误',
      });
    } finally {
      setTesting(false);
    }
  };

  // 恢复默认配置
  const handleResetToDefault = async () => {
    const defaultTemplate = getDefaultTemplate();

    if (!window.confirm(`确定要恢复到默认配置吗？\n\n默认规则：${defaultTemplate.description}`)) {
      return;
    }

    setSaving(true);
    try {
      const response = await fetch('/api/tables/products/duplicate-check-config', {
        method: 'PUT',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          duplicateCheckFields: defaultTemplate.fields,
        }),
      });

      const result = await response.json();

      if (result.success) {
        toast({
          title: '✅ 已恢复默认配置',
          description: defaultTemplate.description,
        });
        onUpdate?.();
        await loadConfig();
      } else {
        toast({
          variant: 'destructive',
          title: '恢复失败',
          description: result.error,
        });
      }
    } catch (err) {
      toast({
        variant: 'destructive',
        title: '恢复失败',
        description: err instanceof Error ? err.message : '未知错误',
      });
    } finally {
      setSaving(false);
    }
  };

  // 应用模板
  const handleApplyTemplate = (templateId: string) => {
    const template = duplicateCheckTemplates.find(t => t.id === templateId);

    if (!template) {
      return;
    }

    setSelectedFields(template.fields);
    setSelectedTemplate(templateId);

    toast({
      title: '✅ 已选择模板',
      description: template.description,
    });
  };

  if (loading) {
    return (
      <Card>
        <CardContent className="flex items-center justify-center py-8">
          <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
          <span className="ml-2 text-muted-foreground">加载配置中...</span>
        </CardContent>
      </Card>
    );
  }

  // 需要初始化数据库
  if (needsInit) {
    return (
      <Card>
        <CardHeader>
          <CardTitle className="flex items-center gap-2">
            <Database className="h-5 w-5" />
            数据库初始化
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-4">
          <Alert variant="destructive">
            <AlertTriangle className="h-4 w-4" />
            <AlertDescription>
              数据库表结构不完整，需要初始化后才能使用判重配置功能。
            </AlertDescription>
          </Alert>

          <div className="space-y-2">
            <p className="text-sm text-muted-foreground">
              请按照以下步骤初始化数据库：
            </p>
            <ol className="list-decimal list-inside space-y-1 text-sm text-muted-foreground">
              <li>登录 Supabase Dashboard</li>
              <li>进入 SQL Editor</li>
              <li>复制下方的 SQL 语句并执行</li>
              <li>执行完成后，点击"刷新配置"按钮</li>
            </ol>
          </div>

          {sqlStatements && (
            <div className="space-y-2">
              <Label>SQL 语句</Label>
              <div className="bg-muted p-4 rounded-lg overflow-x-auto max-h-64 overflow-y-auto">
                <pre className="text-xs font-mono whitespace-pre-wrap">{sqlStatements}</pre>
              </div>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" onClick={handleCopySql}>
                  复制 SQL 语句
                </Button>
                <Button 
                  variant="outline" 
                  size="sm" 
                  onClick={() => {
                    const blob = new Blob([sqlStatements], { type: 'text/plain' });
                    const url = URL.createObjectURL(blob);
                    const a = document.createElement('a');
                    a.href = url;
                    a.download = 'database-init.sql';
                    a.click();
                    URL.revokeObjectURL(url);
                    toast({
                      title: '已下载',
                      description: 'SQL 语句已下载为文件',
                    });
                  }}
                >
                  下载 SQL 文件
                </Button>
              </div>
            </div>
          )}

          <Button onClick={loadConfig} variant="default" disabled={initing}>
            {initing ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                检查中...
              </>
            ) : (
              <>
                <RefreshCw className="mr-2 h-4 w-4" />
                刷新配置
              </>
            )}
          </Button>
        </CardContent>
      </Card>
    );
  }

  // 字段名称映射
  const fieldLabelMap: Record<string, string> = {
    name: '产品名称',
    model: '规格型号',
    brand: '品牌',
    category: '分类',
    price: '指导价（元）',
    supplier: '供应商',
    parameter_description: '参数描述',
    unit: '单位',
    cost_price: '成本（元）',
    min_price: '最低售价（元）',
    contact_person: '联系人',
    contact_phone: '电话',
    description: '描述',
    stock: '库存',
    image_url: '图片',
  };

  return (
    <Card>
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle>判重字段配置</CardTitle>
          <Button variant="outline" size="sm" onClick={loadConfig}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        <Alert>
          <AlertDescription>
            选择用于判断产品重复的字段组合。系统会根据选中的字段组合来判断产品是否已存在，
            建议至少选择"产品名称"和"规格型号"。
          </AlertDescription>
        </Alert>

        {/* 规则模板选择器 */}
        <div className="space-y-2">
          <Label>快速应用模板</Label>
          <Select
            value={selectedTemplate}
            onValueChange={handleApplyTemplate}
          >
            <SelectTrigger>
              <SelectValue placeholder="选择判重规则模板..." />
            </SelectTrigger>
            <SelectContent>
              {duplicateCheckTemplates.map((template) => (
                <SelectItem key={template.id} value={template.id}>
                  <div className="flex items-center gap-2">
                    <span>{template.icon}</span>
                    <div className="flex flex-col">
                      <span className="font-medium">{template.name}</span>
                      <span className="text-xs text-muted-foreground">
                        {template.description}
                      </span>
                    </div>
                  </div>
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>

        {/* 当前规则描述 */}
        {selectedFields.length > 0 && (
          <Alert>
            <CheckCircle2 className="h-4 w-4" />
            <AlertDescription>
              <span className="font-medium">当前规则：</span>
              {generateRuleDescription(selectedFields)}
            </AlertDescription>
          </Alert>
        )}

        {error && (
          <Alert variant="destructive">
            <AlertDescription>{error}</AlertDescription>
          </Alert>
        )}

        <div className="space-y-3">
          {allFields.map((field) => (
            <div key={field.field_key} className="flex items-center space-x-2">
              <Checkbox
                id={`field-${field.field_key}`}
                checked={selectedFields.includes(field.field_key)}
                onCheckedChange={(checked) =>
                  handleFieldToggle(field.field_key, checked as boolean)
                }
              />
              <Label
                htmlFor={`field-${field.field_key}`}
                className="flex-1 cursor-pointer"
              >
                {fieldLabelMap[field.field_key] || field.field_label || field.field_name || field.field_key}
                {field.is_required && (
                  <span className="ml-1 text-xs text-destructive">（必填）</span>
                )}
              </Label>
            </div>
          ))}
        </div>

        <div className="pt-4 border-t space-y-4">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              已选择 <span className="font-semibold text-foreground">{selectedFields.length}</span> 个判重字段
            </div>
            <div className="flex gap-2">
              <Button
                variant="outline"
                size="sm"
                onClick={handleResetToDefault}
                disabled={saving}
              >
                <RotateCcw className="mr-2 h-4 w-4" />
                恢复默认
              </Button>
              <Button
                variant="outline"
                size="sm"
                onClick={handleTestConfig}
                disabled={testing || selectedFields.length === 0}
              >
                {testing ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <TestTube className="mr-2 h-4 w-4" />
                )}
                测试规则
              </Button>
              <Button
                onClick={handleSave}
                disabled={saving}
              >
                {saving ? (
                  <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                ) : (
                  <Save className="mr-2 h-4 w-4" />
                )}
                保存配置
              </Button>
            </div>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
