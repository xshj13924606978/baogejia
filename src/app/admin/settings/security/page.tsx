'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Loader2, Save, Shield, AlertTriangle, RefreshCw } from 'lucide-react';
import { toast } from 'sonner';

interface SecurityConfig {
  key: string;
  value: string;
  type: string;
  label: string;
  description: string;
  category: string;
}

interface SecurityField {
  key: string;
  label: string;
  description: string;
  type: 'number' | 'boolean';
  min?: number;
  max?: number;
  defaultVal: string;
}

const SECURITY_FIELDS: SecurityField[] = [
  {
    key: 'login_max_attempts',
    label: '登录最大尝试次数',
    description: '连续登录失败多少次后锁定账户',
    type: 'number',
    min: 1, max: 20,
    defaultVal: '5',
  },
  {
    key: 'login_lockout_minutes',
    label: '账户锁定时长（分钟）',
    description: '账户被锁定后的自动解锁时间',
    type: 'number',
    min: 1, max: 1440,
    defaultVal: '30',
  },
  {
    key: 'password_min_length',
    label: '密码最小长度',
    description: '用户注册和修改密码时的最小字符数',
    type: 'number',
    min: 4, max: 32,
    defaultVal: '8',
  },
  {
    key: 'allow_register',
    label: '开放注册',
    description: '是否允许新用户自主注册账号，关闭后仅管理员可创建用户',
    type: 'boolean',
    defaultVal: 'true',
  },
  {
    key: 'require_email_verify',
    label: '注册邮箱验证',
    description: '新用户注册后是否需要验证邮箱才能使用系统',
    type: 'boolean',
    defaultVal: 'false',
  },
];

export default function SecuritySettingsPage() {
  const [configs, setConfigs] = useState<SecurityConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.success) {
        const securityConfigs = (data.data || []).filter((c: SecurityConfig) => c.category === 'security');
        setConfigs(securityConfigs);
        const init: Record<string, string> = {};
        SECURITY_FIELDS.forEach(f => {
          const found = securityConfigs.find((c: SecurityConfig) => c.config_key === f.key || c.key === f.key);
          init[f.key] = found ? found.value : f.defaultVal;
        });
        setValues(init);
      } else {
        toast.error(data.error || '加载设置失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadConfigs(); }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const settings = SECURITY_FIELDS.map(f => ({
        key: f.key,
        value: values[f.key],
        description: f.description,
      }));
      const res = await fetch('/api/admin/settings', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ settings }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success('安全设置保存成功');
        loadConfigs();
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const updateValue = (key: string, val: string) => {
    setValues(prev => ({ ...prev, [key]: val }));
  };

  const isChanged = SECURITY_FIELDS.some(f => {
    const found = configs.find((c: SecurityConfig) => c.config_key === f.key || c.key === f.key);
    return (found ? found.value : f.defaultVal) !== values[f.key];
  });

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载安全设置...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">安全设置</h1>
          <p className="text-gray-500">配置登录安全策略和注册控制</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" size="sm" onClick={loadConfigs}>
            <RefreshCw className="h-4 w-4 mr-2" />
            刷新
          </Button>
          <Button onClick={handleSave} disabled={saving || !isChanged}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {isChanged ? '保存更改' : '无更改'}
          </Button>
        </div>
      </div>

      {/* 提示 */}
      <Card className="border-yellow-200 bg-yellow-50/50">
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <AlertTriangle className="h-5 w-5 text-yellow-600 mt-0.5 shrink-0" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">安全提示</p>
              <p className="mt-0.5">修改安全设置将立即生效。建议先在测试环境验证后再应用到生产环境。</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 登录安全 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg flex items-center gap-2">
            <Shield className="h-5 w-5 text-red-500" />
            登录安全
          </CardTitle>
          <CardDescription>配置登录失败锁定和密码强度要求</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 登录最大尝试次数 */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">登录最大尝试次数</Label>
              <p className="text-xs text-gray-500 mt-0.5">连续登录失败多少次后锁定账户</p>
            </div>
            <Input
              type="number"
              className="w-28 text-center"
              min={1} max={20}
              value={values['login_max_attempts'] || ''}
              onChange={(e) => updateValue('login_max_attempts', e.target.value)}
            />
          </div>

          {/* 锁定时长 */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">账户锁定时长（分钟）</Label>
              <p className="text-xs text-gray-500 mt-0.5">账户被锁定后的自动解锁时间</p>
            </div>
            <Input
              type="number"
              className="w-28 text-center"
              min={1} max={1440}
              value={values['login_lockout_minutes'] || ''}
              onChange={(e) => updateValue('login_lockout_minutes', e.target.value)}
            />
          </div>

          {/* 密码最小长度 */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">密码最小长度</Label>
              <p className="text-xs text-gray-500 mt-0.5">用户注册和修改密码时的最小字符数</p>
            </div>
            <Input
              type="number"
              className="w-28 text-center"
              min={4} max={32}
              value={values['password_min_length'] || ''}
              onChange={(e) => updateValue('password_min_length', e.target.value)}
            />
          </div>
        </CardContent>
      </Card>

      {/* 注册控制 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">注册控制</CardTitle>
          <CardDescription>控制用户注册行为和验证要求</CardDescription>
        </CardHeader>
        <CardContent className="space-y-6">
          {/* 开放注册 */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">开放注册</Label>
              <p className="text-xs text-gray-500 mt-0.5">
                关闭后仅管理员可创建用户，新用户无法自主注册
              </p>
            </div>
            <button
              onClick={() => updateValue('allow_register', values['allow_register'] === 'true' ? 'false' : 'true')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                values['allow_register'] === 'true' ? 'bg-green-500' : 'bg-gray-200'
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                values['allow_register'] === 'true' ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>

          {/* 邮箱验证 */}
          <div className="flex items-center justify-between gap-6">
            <div className="flex-1">
              <Label className="text-sm font-medium">注册邮箱验证</Label>
              <p className="text-xs text-gray-500 mt-0.5">
                开启后新用户注册后必须验证邮箱才能使用系统功能
              </p>
            </div>
            <button
              onClick={() => updateValue('require_email_verify', values['require_email_verify'] === 'true' ? 'false' : 'true')}
              className={`relative inline-flex h-6 w-11 shrink-0 cursor-pointer rounded-full border-2 border-transparent transition-colors ${
                values['require_email_verify'] === 'true' ? 'bg-blue-500' : 'bg-gray-200'
              }`}
            >
              <span className={`pointer-events-none inline-block h-5 w-5 rounded-full bg-white shadow-lg ring-0 transition-transform ${
                values['require_email_verify'] === 'true' ? 'translate-x-5' : 'translate-x-0'
              }`} />
            </button>
          </div>
        </CardContent>
      </Card>

      {/* 当前状态 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">当前配置状态</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {SECURITY_FIELDS.map(f => (
              <div key={f.key} className="flex items-center gap-3 p-3 rounded-lg border">
                <div className={`px-2 py-0.5 rounded text-xs font-medium ${
                  f.type === 'boolean'
                    ? values[f.key] === 'true' ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'
                    : 'bg-blue-100 text-blue-700'
                }`}>
                  {f.type === 'boolean' ? (values[f.key] === 'true' ? 'ON' : 'OFF') : values[f.key]}
                </div>
                <span className="text-sm text-gray-700">{f.label}</span>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
