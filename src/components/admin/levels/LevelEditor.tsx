'use client';

import React, { useState, useEffect } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from '@/components/ui/select';
import { useToast } from '@/components/ui/use-toast';
import { Loader2, Eye } from 'lucide-react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';

interface LevelEditorProps {
  level: number;
  onSave: (level: number, changes: any, reason: string) => Promise<void>;
  onCancel: () => void;
}

interface Config {
  name: string;
  requiredPoints: number;
  quotas: {
    daily_quota: number;
    max_files: number;
    max_chat_messages: number;
  };
  fieldPermissions: {
    can_view_cost_price: boolean;
    can_view_min_price: boolean;
    can_view_manufacturer: boolean;
    can_view_contact: boolean;
    can_view_phone: boolean;
  };
  modulePermissions: string[];
}

interface Module {
  module_code: string;
  module_name: string;
  description: string;
  is_active: boolean;
}

interface PermissionChange {
  type: 'field' | 'module' | 'quota';
  name: string;
  before: any;
  after: any;
}

const formatPermissionChange = (before: Config, after: Config): PermissionChange[] => {
  const changes: PermissionChange[] = [];

  // 字段权限变化
  const fieldLabels: Record<string, string> = {
    can_view_cost_price: '查看成本价',
    can_view_min_price: '查看最低售价',
    can_view_manufacturer: '查看制造商',
    can_view_contact: '查看联系人',
    can_view_phone: '查看联系电话',
  };

  Object.keys(fieldLabels).forEach(key => {
    const fieldKey = key as keyof typeof before.fieldPermissions;
    if (before.fieldPermissions[fieldKey] !== after.fieldPermissions[fieldKey]) {
      changes.push({
        type: 'field',
        name: fieldLabels[key],
        before: before.fieldPermissions[fieldKey],
        after: after.fieldPermissions[fieldKey],
      });
    }
  });

  // 配额变化
  const quotaLabels: Record<string, string> = {
    daily_quota: '每日查询配额',
    max_files: '最大文件数量',
    max_chat_messages: '最大聊天消息数',
  };

  Object.keys(quotaLabels).forEach(key => {
    const quotaKey = key as keyof typeof before.quotas;
    if (before.quotas[quotaKey] !== after.quotas[quotaKey]) {
      changes.push({
        type: 'quota',
        name: quotaLabels[key],
        before: before.quotas[quotaKey],
        after: after.quotas[quotaKey],
      });
    }
  });

  // 模块权限变化
  const beforeModules = new Set(before.modulePermissions);
  const afterModules = new Set(after.modulePermissions);

  const addedModules = [...afterModules].filter(m => !beforeModules.has(m));
  const removedModules = [...beforeModules].filter(m => !afterModules.has(m));

  addedModules.forEach(module => {
    changes.push({
      type: 'module',
      name: module,
      before: false,
      after: true,
    });
  });

  removedModules.forEach(module => {
    changes.push({
      type: 'module',
      name: module,
      before: true,
      after: false,
    });
  });

  return changes;
};

const PermissionChangeItem: React.FC<{ change: PermissionChange }> = ({ change }) => {
  const getValueDisplay = (value: any, type: string) => {
    if (typeof value === 'boolean') {
      return value ? (
        <span className="text-green-600 font-medium">✓ 允许</span>
      ) : (
        <span className="text-red-600 font-medium">✗ 禁止</span>
      );
    }
    if (type === 'quota') {
      return <span className="font-medium">{value}</span>;
    }
    return String(value);
  };

  const getChangeIndicator = () => {
    if (change.type === 'field' || change.type === 'module') {
      return change.after ? (
        <span className="text-green-600 text-xs">（新增）</span>
      ) : (
        <span className="text-red-600 text-xs">（移除）</span>
      );
    }
    if (change.type === 'quota') {
      const diff = change.after - change.before;
      return diff > 0 ? (
        <span className="text-green-600 text-xs">（+{diff}）</span>
      ) : diff < 0 ? (
        <span className="text-red-600 text-xs">（{diff}）</span>
      ) : null;
    }
    return null;
  };

  return (
    <div className="flex items-center justify-between py-2 border-b last:border-b-0">
      <div className="flex-1">
        <div className="font-medium">{change.name}</div>
        <div className="text-sm text-muted-foreground mt-1">
          <span className="mr-4">
            <span className="text-muted-foreground">修改前：</span>
            {getValueDisplay(change.before, change.type)}
          </span>
          <span>
            <span className="text-muted-foreground">修改后：</span>
            {getValueDisplay(change.after, change.type)}
          </span>
        </div>
      </div>
      {getChangeIndicator()}
    </div>
  );
};

export const LevelEditor: React.FC<LevelEditorProps> = ({ level, onSave, onCancel }) => {
  const [loading, setLoading] = useState(false);
  const [config, setConfig] = useState<Config | null>(null);
  const [modules, setModules] = useState<Module[]>([]);
  const [previewOpen, setPreviewOpen] = useState(false);
  const [previewData, setPreviewData] = useState<any>(null);
  const { toast } = useToast();

  // 表单状态
  const [formData, setFormData] = useState({
    name: '',
    requiredPoints: 0,
    daily_quota: 0,
    max_files: 0,
    max_chat_messages: 0,
    can_view_cost_price: false,
    can_view_min_price: false,
    can_view_manufacturer: false,
    can_view_contact: false,
    can_view_phone: false,
    modulePermissions: [] as string[],
    reason: '',
  });

  useEffect(() => {
    fetchConfig();
    fetchModules();
  }, [level]);

  const fetchConfig = async () => {
    try {
      const res = await fetch(`/api/admin/levels/${level}`, {
        credentials: 'include'
      });
      const data = await res.json();

      if (data.success && data.config) {
        setConfig(data.config);
        setFormData({
          name: data.config.name,
          requiredPoints: data.config.requiredPoints,
          daily_quota: data.config.quotas.daily_quota,
          max_files: data.config.quotas.max_files,
          max_chat_messages: data.config.quotas.max_chat_messages,
          can_view_cost_price: data.config.fieldPermissions.can_view_cost_price,
          can_view_min_price: data.config.fieldPermissions.can_view_min_price,
          can_view_manufacturer: data.config.fieldPermissions.can_view_manufacturer,
          can_view_contact: data.config.fieldPermissions.can_view_contact,
          can_view_phone: data.config.fieldPermissions.can_view_phone,
          modulePermissions: data.config.modulePermissions,
          reason: '',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '获取配置失败',
      });
    }
  };

  const fetchModules = async () => {
    try {
      const res = await fetch('/api/admin/modules', {
        credentials: 'include'
      });
      const data = await res.json();
      if (data.success) {
        setModules(data.data || []);
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '获取模块列表失败',
      });
    }
  };

  const handlePreview = async () => {
    try {
      const changes = {
        fieldPermissions: {
          can_view_cost_price: formData.can_view_cost_price,
          can_view_min_price: formData.can_view_min_price,
          can_view_manufacturer: formData.can_view_manufacturer,
          can_view_contact: formData.can_view_contact,
          can_view_phone: formData.can_view_phone,
        },
        modulePermissions: formData.modulePermissions,
        quotas: {
          daily_quota: formData.daily_quota,
          max_files: formData.max_files,
          max_chat_messages: formData.max_chat_messages,
        },
      };

      const res = await fetch('/api/admin/permissions/preview', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        credentials: 'include',
        body: JSON.stringify({ level, changes }),
      });

      const data = await res.json();

      console.log('[LevelEditor] 预览响应数据:', data);

      if (data.success) {
        setPreviewData(data.preview);
        setPreviewOpen(true);
      } else {
        toast({
          variant: 'destructive',
          title: '预览失败',
          description: data.error || '服务器错误',
        });
      }
    } catch (error) {
      console.error('[LevelEditor] 预览失败:', error);
      toast({
        variant: 'destructive',
        title: '预览失败',
        description: error instanceof Error ? error.message : '网络错误',
      });
    }
  };

  const handleSubmit = async () => {
    if (!formData.reason) {
      toast({
        variant: 'destructive',
        title: '请填写修改原因',
      });
      return;
    }

    try {
      setLoading(true);

      const changes = {
        fieldPermissions: {
          can_view_cost_price: formData.can_view_cost_price,
          can_view_min_price: formData.can_view_min_price,
          can_view_manufacturer: formData.can_view_manufacturer,
          can_view_contact: formData.can_view_contact,
          can_view_phone: formData.can_view_phone,
        },
        modulePermissions: formData.modulePermissions,
        quotas: {
          daily_quota: formData.daily_quota,
          max_files: formData.max_files,
          max_chat_messages: formData.max_chat_messages,
        },
      };

      await onSave(level, changes, formData.reason);
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '保存失败',
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleModulePermission = (moduleCode: string) => {
    setFormData((prev) => ({
      ...prev,
      modulePermissions: prev.modulePermissions.includes(moduleCode)
        ? prev.modulePermissions.filter((m) => m !== moduleCode)
        : [...prev.modulePermissions, moduleCode],
    }));
  };

  return (
    <div className="space-y-6">
      <Tabs defaultValue="basic" className="w-full">
        <TabsList className="grid w-full grid-cols-5">
          <TabsTrigger value="basic">基础信息</TabsTrigger>
          <TabsTrigger value="fields">字段权限</TabsTrigger>
          <TabsTrigger value="modules">模块权限</TabsTrigger>
          <TabsTrigger value="quotas">配额设置</TabsTrigger>
          <TabsTrigger value="reason">修改说明</TabsTrigger>
        </TabsList>

        <TabsContent value="basic" className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="name">等级名称</Label>
            <Input id="name" value={formData.name} disabled />
          </div>

          <div className="space-y-2">
            <Label htmlFor="requiredPoints">所需积分</Label>
            <Input
              id="requiredPoints"
              type="number"
              value={formData.requiredPoints}
              disabled
            />
          </div>
        </TabsContent>

        <TabsContent value="fields" className="space-y-4 mt-6">
          <div className="flex items-center justify-between">
            <Label htmlFor="can_view_cost_price">查看成本价</Label>
            <Switch
              id="can_view_cost_price"
              checked={formData.can_view_cost_price}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, can_view_cost_price: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="can_view_min_price">查看最低售价</Label>
            <Switch
              id="can_view_min_price"
              checked={formData.can_view_min_price}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, can_view_min_price: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="can_view_manufacturer">查看厂家信息</Label>
            <Switch
              id="can_view_manufacturer"
              checked={formData.can_view_manufacturer}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, can_view_manufacturer: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="can_view_contact">查看联系人</Label>
            <Switch
              id="can_view_contact"
              checked={formData.can_view_contact}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, can_view_contact: checked })
              }
            />
          </div>

          <div className="flex items-center justify-between">
            <Label htmlFor="can_view_phone">查看联系电话</Label>
            <Switch
              id="can_view_phone"
              checked={formData.can_view_phone}
              onCheckedChange={(checked) =>
                setFormData({ ...formData, can_view_phone: checked })
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="modules" className="space-y-4 mt-6">
          <Label>可用模块</Label>
          <div className="space-y-2">
            {modules.map((module) => (
              <div
                key={module.module_code}
                className="flex items-center justify-between p-3 border rounded-md"
              >
                <div>
                  <div className="font-medium">{module.module_name}</div>
                  <div className="text-sm text-muted-foreground">
                    {module.module_code}
                  </div>
                </div>
                <Switch
                  checked={formData.modulePermissions.includes(module.module_code)}
                  onCheckedChange={() => toggleModulePermission(module.module_code)}
                />
              </div>
            ))}
          </div>
        </TabsContent>

        <TabsContent value="quotas" className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="daily_quota">每日查询配额</Label>
            <Input
              id="daily_quota"
              type="number"
              min={0}
              value={formData.daily_quota}
              onChange={(e) =>
                setFormData({ ...formData, daily_quota: parseInt(e.target.value) || 0 })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_files">最大文件数量</Label>
            <Input
              id="max_files"
              type="number"
              min={0}
              value={formData.max_files}
              onChange={(e) =>
                setFormData({ ...formData, max_files: parseInt(e.target.value) || 0 })
              }
            />
          </div>

          <div className="space-y-2">
            <Label htmlFor="max_chat_messages">最大聊天消息数</Label>
            <Input
              id="max_chat_messages"
              type="number"
              min={0}
              value={formData.max_chat_messages}
              onChange={(e) =>
                setFormData({ ...formData, max_chat_messages: parseInt(e.target.value) || 0 })
              }
            />
          </div>
        </TabsContent>

        <TabsContent value="reason" className="space-y-4 mt-6">
          <div className="space-y-2">
            <Label htmlFor="reason">
              修改原因 <span className="text-destructive">*</span>
            </Label>
            <Textarea
              id="reason"
              rows={4}
              placeholder="请输入修改原因..."
              value={formData.reason}
              onChange={(e) =>
                setFormData({ ...formData, reason: e.target.value })
              }
            />
          </div>
        </TabsContent>
      </Tabs>

      <div className="flex justify-end gap-2 pt-4 border-t">
        <Button variant="outline" onClick={handlePreview}>
          <Eye className="mr-2 h-4 w-4" />
          预览效果
        </Button>
        <Button variant="outline" onClick={onCancel}>
          取消
        </Button>
        <Button onClick={handleSubmit} disabled={loading}>
          {loading && <Loader2 className="mr-2 h-4 w-4 animate-spin" />}
          保存修改
        </Button>
      </div>

      <Dialog open={previewOpen} onOpenChange={setPreviewOpen}>
        <DialogContent className="max-w-2xl max-h-[80vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>权限修改预览</DialogTitle>
            <DialogDescription>
              查看 LV.{level} 等级配置修改对用户的影响范围和具体变化
            </DialogDescription>
          </DialogHeader>
          {previewData && (
            <div className="space-y-4">
              <div className="p-4 bg-muted rounded-md">
                <div className="text-3xl font-bold mb-3">LV.{level} {config?.name || ''}</div>
                {previewData.affectedUsers > 0 ? (
                  <>
                    <div className="font-medium">影响用户数</div>
                    <div className="text-2xl font-bold">{previewData.affectedUsers}</div>
                    {previewData.affectedUsers > 3 && (
                      <div className="text-sm text-muted-foreground mt-1">
                        修改将影响该等级下的所有用户
                      </div>
                    )}
                  </>
                ) : (
                  <div className="text-2xl font-bold">当前没有 LV.{level} 等级的用户</div>
                )}
              </div>

              {previewData.affectedUsers <= 3 && previewData.sampleUsers && previewData.sampleUsers.length > 0 && (
                <div className="space-y-6">
                  <div>
                    <div className="font-medium mb-3">示例用户变更详情</div>
                    <div className="space-y-4">
                      {previewData.sampleUsers.map((user: any) => {
                        const changes = formatPermissionChange(user.before, user.after);
                        return (
                          <div key={user.id} className="p-4 border rounded-md">
                            <div className="font-medium mb-3 flex items-center gap-2">
                              <span>用户：{user.name}</span>
                              <span className="text-sm text-muted-foreground">（{user.email || user.id}）</span>
                            </div>
                            {changes.length > 0 ? (
                              <div className="space-y-1">
                                {changes.map((change, idx) => (
                                  <PermissionChangeItem key={idx} change={change} />
                                ))}
                              </div>
                            ) : (
                              <div className="text-sm text-muted-foreground">无变更</div>
                            )}
                          </div>
                        );
                      })}
                    </div>
                  </div>
                </div>
              )}
            </div>
          )}
        </DialogContent>
      </Dialog>
    </div>
  );
};
// test
// test
