'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Loader2, Save, RefreshCw, AlertTriangle, Database } from 'lucide-react';
import { toast } from '@/components/ui/use-toast';

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
        if (result.error && result.error.includes('is_duplicate_check')) {
          console.log('检测到需要初始化数据库');
          try {
            const initResponse = await fetch('/api/admin/init-duplicate-check', {
              method: 'POST',
            });
            const initResult = await initResponse.json();

            if (initResult.requiresManualSetup) {
              setNeedsInit(true);
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
              数据库表结构不完整，需要添加判重配置列。
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
              <li>执行完成后，点击"刷新"按钮</li>
            </ol>
          </div>

          {sqlStatements && (
            <div className="space-y-2">
              <Label>SQL 语句</Label>
              <div className="bg-muted p-4 rounded-lg overflow-x-auto">
                <pre className="text-xs font-mono">{sqlStatements}</pre>
              </div>
              <Button variant="outline" size="sm" onClick={handleCopySql}>
                复制 SQL 语句
              </Button>
            </div>
          )}

          <Button onClick={loadConfig} variant="default">
            <RefreshCw className="mr-2 h-4 w-4" />
            刷新配置
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
    price: '指导价',
    supplier: '供应商',
    parameter_description: '参数描述',
    unit: '单位',
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

        <div className="pt-4 border-t">
          <div className="flex items-center justify-between">
            <div className="text-sm text-muted-foreground">
              已选择 <span className="font-semibold text-foreground">{selectedFields.length}</span> 个判重字段
            </div>
            <Button onClick={handleSave} disabled={saving}>
              {saving && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
              <Save className="mr-2 h-4 w-4" />
              保存配置
            </Button>
          </div>
        </div>
      </CardContent>
    </Card>
  );
}
