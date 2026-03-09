'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';

interface FieldConfig {
  id: number;
  field_key: string;
  field_label: string;
  is_required: boolean;
  created_at: string;
  updated_at: string;
}

interface FieldConfigManagerProps {
  onClose?: () => void;
}

export default function FieldConfigManager({ onClose }: FieldConfigManagerProps) {
  const [configs, setConfigs] = useState<FieldConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  // 加载字段配置
  useEffect(() => {
    loadConfigs();
  }, []);

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/tables/products/field-configs');
      const data = await res.json();

      if (data.success) {
        setConfigs(data.data || []);
      } else {
        console.error('加载字段配置失败:', data.error);
      }
    } catch (error) {
      console.error('加载字段配置失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleToggleRequired = async (fieldKey: string, currentValue: boolean) => {
    setSaving(true);
    try {
      const res = await fetch('/api/tables/products/field-configs', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          field_key: fieldKey,
          is_required: !currentValue
        })
      });

      const data = await res.json();

      if (data.success) {
        // 更新本地状态
        setConfigs(prev =>
          prev.map(config =>
            config.field_key === fieldKey
              ? { ...config, is_required: !currentValue }
              : config
          )
        );
      } else {
        alert(`更新失败：${data.error}`);
      }
    } catch (error) {
      console.error('更新字段配置失败:', error);
      alert('更新失败');
    } finally {
      setSaving(false);
    }
  };

  return (
    <Card className="w-full">
      <CardHeader>
        <div className="flex items-center justify-between">
          <div>
            <CardTitle>字段必填配置</CardTitle>
            <CardDescription>
              设置产品价格表单中各字段的必填/选填状态
            </CardDescription>
          </div>
          {onClose && (
            <Button variant="outline" onClick={onClose}>
              关闭
            </Button>
          )}
        </div>
      </CardHeader>
      <CardContent>
        {loading ? (
          <div className="text-center py-8 text-muted-foreground">
            加载中...
          </div>
        ) : (
          <div className="space-y-4">
            {configs.map((config) => (
              <div
                key={config.field_key}
                className="flex items-center justify-between p-4 border rounded-lg hover:bg-muted/50 transition-colors"
              >
                <div className="flex-1">
                  <Label htmlFor={`field-${config.field_key}`} className="text-base font-medium">
                    {config.field_label}
                  </Label>
                  <p className="text-sm text-muted-foreground mt-1">
                    当前状态: <span className={config.is_required ? "text-red-600 font-medium" : "text-muted-foreground"}>
                      {config.is_required ? '必填' : '选填'}
                    </span>
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Label htmlFor={`field-${config.field_key}`} className="text-sm text-muted-foreground">
                    {config.is_required ? '必填' : '选填'}
                  </Label>
                  <Switch
                    id={`field-${config.field_key}`}
                    checked={config.is_required}
                    onCheckedChange={() => handleToggleRequired(config.field_key, config.is_required)}
                    disabled={saving}
                  />
                </div>
              </div>
            ))}
          </div>
        )}
      </CardContent>
    </Card>
  );
}
