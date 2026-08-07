'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Settings, Shield, Gift, HardDrive, Loader2, Save, RefreshCw, Plus,
} from 'lucide-react';
import { toast } from 'sonner';

interface ConfigItem {
  key: string;
  value: any;
  type: 'string' | 'number' | 'boolean' | 'json';
  label: string;
  description: string;
  isPublic: boolean;
}

const CATEGORY_META: Record<string, { label: string; icon: React.ReactNode; color: string }> = {
  general: { label: '基本设置', icon: <Settings className="h-4 w-4" />, color: 'bg-blue-500' },
  security: { label: '安全设置', icon: <Shield className="h-4 w-4" />, color: 'bg-red-500' },
  points: { label: '积分设置', icon: <Gift className="h-4 w-4" />, color: 'bg-purple-500' },
  storage: { label: '存储设置', icon: <HardDrive className="h-4 w-4" />, color: 'bg-orange-500' },
};

const CATEGORIES = ['general', 'security', 'points', 'storage'];

export default function SettingsPage() {
  const [config, setConfig] = useState<Record<string, ConfigItem[]>>({});
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [activeTab, setActiveTab] = useState('general');

  // 编辑表单（内存中修改，不直接修改config）
  const [editForm, setEditForm] = useState<Record<string, string>>({});

  // 新增配置对话框
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [newConfig, setNewConfig] = useState({ key: '', value: '', category: 'general', label: '', description: '' });

  const loadSettings = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.success) {
        setConfig(data.data || {});
      } else {
        toast.error(data.error || '加载设置失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadSettings(); }, []);

  // 进入Tab时刷新编辑表单
  useEffect(() => {
    const items = config[activeTab] || [];
    const form: Record<string, string> = {};
    items.forEach((item) => { form[item.key] = String(item.value); });
    setEditForm(form);
  }, [activeTab, config]);

  const handleSave = async () => {
    setSaving(true);
    try {
      const items = config[activeTab] || [];
      const settings = items.map((item) => ({
        key: item.key,
        value: editForm[item.key] !== undefined ? parseValue(editForm[item.key], item.type) : item.value,
      }));

      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message);
        loadSettings();
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const handleAddConfig = async () => {
    if (!newConfig.key || !newConfig.label) {
      toast.error('键名和标签不能为空');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          settings: [{
            key: newConfig.key,
            value: newConfig.value,
            description: newConfig.description,
          }],
        }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('配置项已添加');
        setShowAddDialog(false);
        setNewConfig({ key: '', value: '', category: 'general', label: '', description: '' });
        loadSettings();
      } else {
        toast.error(data.error || '添加失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  // 执行迁移（创建表+默认数据）
  const runMigration = async () => {
    try {
      const res = await fetch('/api/migrate/site-config', { method: 'POST' });
      const data = await res.json();
      console.log('[runMigration] res.status:', res.status, 'data:', data);
      if (data.success) {
        toast.success(data.message, { duration: 6000 });
        loadSettings();
      } else {
        toast.error(data.error || '迁移失败', { duration: Infinity, closeButton: true });
        console.error('[runMigration] 失败:', data.error);
      }
    } catch (e) {
      console.error('[runMigration] 异常:', e);
      toast.error('网络错误', { duration: 6000 });
    }
  };

  function parseValue(str: string, type: string) {
    switch (type) {
      case 'number': return Number(str) || 0;
      case 'boolean': return str === 'true' || str === '1';
      default: return str;
    }
  }

  const renderField = (item: ConfigItem) => {
    const currentVal = editForm[item.key] !== undefined ? editForm[item.key] : String(item.value);

    if (item.type === 'boolean') {
      return (
        <div className="flex items-center gap-3">
          <button
            type="button"
            className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${currentVal === 'true' ? 'bg-blue-600' : 'bg-gray-200'}`}
            onClick={() => setEditForm({ ...editForm, [item.key]: currentVal === 'true' ? 'false' : 'true' })}
          >
            <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${currentVal === 'true' ? 'translate-x-6' : 'translate-x-1'}`} />
          </button>
          <span className="text-sm text-muted-foreground">{currentVal === 'true' ? '已启用' : '已禁用'}</span>
        </div>
      );
    }

    if (item.type === 'number') {
      return (
        <Input
          type="number"
          value={currentVal}
          onChange={(e) => setEditForm({ ...editForm, [item.key]: e.target.value })}
          className="max-w-[200px]"
        />
      );
    }

    return (
      <Input
        value={currentVal}
        onChange={(e) => setEditForm({ ...editForm, [item.key]: e.target.value })}
        className="max-w-[400px]"
        placeholder={item.description}
      />
    );
  };

  const CategorySettings = ({ category }: { category: string }) => {
    const items = config[category] || [];

    if (loading) return <LoadingSkeleton />;
    if (items.length === 0) {
      return (
        <div className="text-center py-16">
          <p className="text-muted-foreground mb-4">该分类暂无配置项</p>
          <Button variant="outline" size="sm" onClick={runMigration}>初始化默认配置</Button>
        </div>
      );
    }

    return (
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <p className="text-sm text-muted-foreground">{CATEGORY_META[category]?.label} - {items.length} 项</p>
          <Button variant="outline" size="sm" onClick={loadSettings}>
            <RefreshCw className="h-4 w-4 mr-1" /> 刷新
          </Button>
        </div>

        <Card>
          <CardContent className="p-6 space-y-6">
            {items.map((item) => (
              <div key={item.key} className="flex flex-col md:flex-row md:items-center gap-2 md:gap-4 pb-4 border-b last:border-0">
                <div className="md:w-[220px] shrink-0">
                  <Label className="text-sm font-medium">{item.label}</Label>
                  <p className="text-xs text-muted-foreground mt-0.5">{item.description}</p>
                  {item.isPublic && <Badge variant="outline" className="mt-1 text-xs">公开</Badge>}
                </div>
                <div className="flex-1">
                  {renderField(item)}
                </div>
                <span className="text-xs text-muted-foreground font-mono">{item.key}</span>
              </div>
            ))}
          </CardContent>
        </Card>

        <div className="flex justify-end gap-2">
          <Button variant="outline" size="sm" onClick={() => {
            const form: Record<string, string> = {};
            items.forEach((item) => { form[item.key] = String(item.value); });
            setEditForm(form);
          }}>重置</Button>
          <Button size="sm" onClick={handleSave} disabled={saving}>
            {saving ? <Loader2 className="h-4 w-4 mr-1 animate-spin" /> : <Save className="h-4 w-4 mr-1" />}
            保存设置
          </Button>
        </div>
      </div>
    );
  };

  const LoadingSkeleton = () => (
    <div className="flex items-center justify-center py-16">
      <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
      <span className="ml-2 text-muted-foreground">加载中...</span>
    </div>
  );

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">系统设置</h1>
          <p className="text-gray-500">管理系统全局配置参数</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={runMigration}>
            初始化默认配置
          </Button>
          <Button variant="outline" size="sm" onClick={() => setShowAddDialog(true)}>
            <Plus className="h-4 w-4 mr-1" /> 新增配置项
          </Button>
        </div>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          {CATEGORIES.map((cat) => (
            <TabsTrigger key={cat} value={cat}>
              {CATEGORY_META[cat]?.icon}
              <span className="ml-1">{CATEGORY_META[cat]?.label}</span>
            </TabsTrigger>
          ))}
        </TabsList>
        {CATEGORIES.map((cat) => (
          <TabsContent key={cat} value={cat} className="mt-6">
            <CategorySettings category={cat} />
          </TabsContent>
        ))}
      </Tabs>

      {/* 新增配置对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="sm:max-w-[450px]">
          <DialogHeader>
            <DialogTitle>新增配置项</DialogTitle>
            <DialogDescription>添加新的系统配置参数</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>配置键名 <span className="text-destructive">*</span></Label>
              <Input
                placeholder="如: custom_setting_key"
                value={newConfig.key}
                onChange={(e) => setNewConfig({ ...newConfig, key: e.target.value })}
              />
            </div>
            <div className="space-y-2">
              <Label>显示标签 <span className="text-destructive">*</span></Label>
              <Input
                placeholder="如: 自定义设置"
                value={newConfig.label}
                onChange={(e) => setNewConfig({ ...newConfig, label: e.target.value })}
              />
            </div>
            <div className="grid grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>分类</Label>
                <select
                  className="w-full rounded-md border border-input bg-background px-3 py-2 text-sm"
                  value={newConfig.category}
                  onChange={(e) => setNewConfig({ ...newConfig, category: e.target.value })}
                >
                  {CATEGORIES.map((cat) => (
                    <option key={cat} value={cat}>{CATEGORY_META[cat]?.label}</option>
                  ))}
                </select>
              </div>
              <div className="space-y-2">
                <Label>值</Label>
                <Input
                  placeholder="配置值"
                  value={newConfig.value}
                  onChange={(e) => setNewConfig({ ...newConfig, value: e.target.value })}
                />
              </div>
            </div>
            <div className="space-y-2">
              <Label>说明</Label>
              <Input
                placeholder="配置说明"
                value={newConfig.description}
                onChange={(e) => setNewConfig({ ...newConfig, description: e.target.value })}
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>取消</Button>
            <Button onClick={handleAddConfig} disabled={saving}>
              {saving && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}
              添加
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
