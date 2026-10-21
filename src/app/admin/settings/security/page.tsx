'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import {
  Loader2,
  Save,
  Shield,
  Lock,
  UserPlus,
  AlertTriangle,
  RefreshCw,
  CheckCircle2,
  XCircle,
  Eye,
  RotateCcw,
  Download,
  ClipboardList,
  Copy,
  FlipHorizontal,
  Filter,
} from 'lucide-react';
import { toast } from 'sonner';

interface SecurityConfig {
  key: string;
  config_key?: string;
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

// 安全设置字段定义（兜底默认值）。DB 数据优先于此表。
const SECURITY_FIELDS: SecurityField[] = [
  {
    key: 'login_max_attempts',
    label: '登录最大尝试次数',
    description: '连续登录失败多少次后锁定账户',
    type: 'number',
    min: 1,
    max: 20,
    defaultVal: '5',
  },
  {
    key: 'login_lockout_minutes',
    label: '账户锁定时长（分钟）',
    description: '账户被锁定后的自动解锁时间',
    type: 'number',
    min: 1,
    max: 1440,
    defaultVal: '30',
  },
  {
    key: 'password_min_length',
    label: '密码最小长度',
    description: '用户注册和修改密码时的最小字符数',
    type: 'number',
    min: 4,
    max: 32,
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
  {
    key: 'session_timeout_hours',
    label: '会话超时时间（小时）',
    description: '用户登录会话过期时间，超过后需重新登录',
    type: 'number',
    min: 1,
    max: 168,
    defaultVal: '24',
  },
];

// 兼容 API 返回结构：data.data 可能是 {security:[...]} 对象，也可能是数据数组
function extractSecurityConfigs(payload: any): SecurityConfig[] {
  const raw = payload?.data;
  if (Array.isArray(raw)) return raw.filter((c: SecurityConfig) => c.category === 'security');
  if (raw && typeof raw === 'object' && Array.isArray(raw.security)) return raw.security;
  return [];
}

export default function SecuritySettingsPage() {
  const [configs, setConfigs] = useState<SecurityConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [values, setValues] = useState<Record<string, string>>({});
  const [selectedKeys, setSelectedKeys] = useState<Set<string>>(new Set());

  const loadConfigs = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/settings');
      const data = await res.json();
      if (data.success) {
        const securityConfigs = extractSecurityConfigs(data);
        setConfigs(securityConfigs);
        const init: Record<string, string> = {};
        SECURITY_FIELDS.forEach(f => {
          const found = securityConfigs.find((c: SecurityConfig) => c.config_key === f.key || c.key === f.key);
          init[f.key] = found ? String(found.value) : f.defaultVal;
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

  useEffect(() => {
    loadConfigs();
  }, []);

  const handleSave = async () => {
    setSaving(true);
    try {
      const settings = SECURITY_FIELDS.map(f => ({
        key: f.key,
        value: values[f.key] ?? f.defaultVal,
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

  // 原始 DB 值（用于检测变更）
  const originalValues = useMemo(() => {
    const m: Record<string, string> = {};
    SECURITY_FIELDS.forEach(f => {
      const found = configs.find(c => c.config_key === f.key || c.key === f.key);
      m[f.key] = found ? String(found.value) : f.defaultVal;
    });
    return m;
  }, [configs]);

  const isChanged = SECURITY_FIELDS.some(f => originalValues[f.key] !== values[f.key]);

  // 批量操作
  const toggleSelect = (key: string, checked: boolean) => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      if (checked) next.add(key);
      else next.delete(key);
      return next;
    });
  };

  const toggleSelectAll = (checked: boolean) => {
    if (checked) setSelectedKeys(new Set(SECURITY_FIELDS.map(f => f.key)));
    else setSelectedKeys(new Set());
  };

  const allSelected = selectedKeys.size === SECURITY_FIELDS.length && SECURITY_FIELDS.length > 0;
  const someSelected = selectedKeys.size > 0 && !allSelected;

  const selectedBooleans = useMemo(
    () => SECURITY_FIELDS.filter(f => f.type === 'boolean' && selectedKeys.has(f.key)),
    [selectedKeys],
  );

  const bulkSetBoolean = (val: 'true' | 'false') => {
    const next = { ...values };
    selectedBooleans.forEach(f => {
      next[f.key] = val;
    });
    setValues(next);
    toast.success(`已${val === 'true' ? '启用' : '禁用'} ${selectedBooleans.length} 个开关项`);
  };

  const bulkResetSelectedToDefault = () => {
    const next = { ...values };
    SECURITY_FIELDS.forEach(f => {
      if (selectedKeys.has(f.key)) next[f.key] = f.defaultVal;
    });
    setValues(next);
    toast.success(`已重置 ${selectedKeys.size} 项为默认值`);
  };

  const resetAllToDefault = () => {
    const next: Record<string, string> = {};
    SECURITY_FIELDS.forEach(f => (next[f.key] = f.defaultVal));
    setValues(next);
    toast.success('已全部重置为默认值');
  };

  const bulkInvertSelection = () => {
    setSelectedKeys(prev => {
      const next = new Set<string>();
      SECURITY_FIELDS.forEach(f => {
        if (!prev.has(f.key)) next.add(f.key);
      });
      return next;
    });
  };

  const selectByType = (type: 'boolean' | 'number') => {
    setSelectedKeys(prev => {
      const next = new Set(prev);
      SECURITY_FIELDS.forEach(f => {
        if (f.type === type) next.add(f.key);
      });
      return next;
    });
  };

  const copySelectedToClipboard = async () => {
    const lines: string[] = [];
    SECURITY_FIELDS.forEach(f => {
      if (selectedKeys.has(f.key)) {
        lines.push(`${f.label}: ${values[f.key] ?? f.defaultVal}`);
      }
    });
    const text = lines.join('\n');
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`已复制 ${selectedKeys.size} 项配置到剪贴板`);
    } catch {
      toast.error('复制失败');
    }
  };

  const handleInitializeDefaults = async () => {
    try {
      const res = await fetch('/api/migrate/site-config', { method: 'POST' });
      const data = await res.json();
      if (data.success) {
        toast.success('已初始化默认配置');
        loadConfigs();
      } else {
        toast.error(data.error || '初始化失败');
      }
    } catch {
      toast.error('网络错误');
    }
  };

  const exportSelected = () => {
    const fields = SECURITY_FIELDS.filter(f => selectedKeys.has(f.key));
    const rows = ['key,label,type,value,default,description'];
    fields.forEach(f => {
      const safe = (s: string) => `"${s.replace(/"/g, '""')}"`;
      rows.push(
        [f.key, safe(f.label), f.type, values[f.key] ?? '', f.defaultVal, safe(f.description)]
          .map(v => (typeof v === 'string' ? v : String(v)))
          .join(','),
      );
    });
    const blob = new Blob([rows.join('\n')], { type: 'text/csv;charset=utf-8' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `安全设置-${new Date().toISOString().slice(0, 10)}.csv`;
    a.click();
    URL.revokeObjectURL(url);
    toast.success(`已导出 ${fields.length} 项配置`);
  };

  // 概览统计
  const overview = useMemo(() => {
    const enabled = SECURITY_FIELDS.filter(f => f.type === 'boolean' && values[f.key] === 'true').length;
    const booleanTotal = SECURITY_FIELDS.filter(f => f.type === 'boolean').length;
    const numberTotal = SECURITY_FIELDS.filter(f => f.type === 'number').length;
    return { enabled, booleanTotal, numberTotal, total: SECURITY_FIELDS.length };
  }, [values]);

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载安全设置...</span>
      </div>
    );
  }

  // 配置项分组
  const loginSecurityFields = SECURITY_FIELDS.filter(f =>
    ['login_max_attempts', 'login_lockout_minutes', 'password_min_length', 'session_timeout_hours'].includes(f.key),
  );
  const registerFields = SECURITY_FIELDS.filter(f =>
    ['allow_register', 'require_email_verify'].includes(f.key),
  );

  return (
    <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-5 sm:px-6 lg:px-8">
      {/* 标题 + 主操作 */}
      <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            <Shield className="h-6 w-6 text-red-500" />
            安全设置
          </h1>
          <p className="mt-1 text-sm text-muted-foreground">
            配置登录安全策略、密码强度与会话控制；修改保存后立即生效
          </p>
        </div>
        <div className="flex flex-wrap gap-2">
          <Button variant="outline" size="sm" onClick={loadConfigs}>
            <RefreshCw className="mr-1.5 h-4 w-4" />
            刷新
          </Button>
          <Button onClick={handleSave} disabled={saving || !isChanged}>
            {saving ? <Loader2 className="mr-1.5 h-4 w-4 animate-spin" /> : <Save className="mr-1.5 h-4 w-4" />}
            {isChanged ? '保存更改' : '无更改'}
          </Button>
        </div>
      </div>

      {/* 概览统计卡 */}
      <div className="grid grid-cols-2 gap-2.5 sm:grid-cols-4">
        <Card className="border-l-4 border-l-red-500 shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">配置项总数</p>
                <p className="mt-0.5 text-xl font-semibold leading-none tracking-tight">{overview.total}</p>
              </div>
              <ClipboardList className="h-7 w-7 text-red-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-green-500 shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">已启用</p>
                <p className="mt-0.5 text-xl font-semibold leading-none tracking-tight">
                  {overview.enabled}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">/ {overview.booleanTotal}</span>
                </p>
              </div>
              <CheckCircle2 className="h-7 w-7 text-green-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-blue-500 shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">数值类项</p>
                <p className="mt-0.5 text-xl font-semibold leading-none tracking-tight">{overview.numberTotal}</p>
              </div>
              <Lock className="h-7 w-7 text-blue-500/30" />
            </div>
          </CardContent>
        </Card>
        <Card className="border-l-4 border-l-amber-500 shadow-sm">
          <CardContent className="p-3.5">
            <div className="flex items-center justify-between">
              <div>
                <p className="text-[11px] font-medium text-muted-foreground">已选择 / 待保存</p>
                <p className="mt-0.5 text-xl font-semibold leading-none tracking-tight">
                  {selectedKeys.size}
                  <span className="ml-1 text-xs font-normal text-muted-foreground">
                    / {isChanged ? '有' : '无'}
                  </span>
                </p>
              </div>
              <Eye className="h-7 w-7 text-amber-500/30" />
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 空数据引导 */}
      {configs.length === 0 && (
        <Card className="border-dashed border-amber-300 bg-amber-50/40">
          <CardContent className="flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between">
            <div className="flex items-start gap-3">
              <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0 text-amber-600" />
              <div className="text-sm">
                <p className="font-medium text-amber-900">尚未初始化安全配置</p>
                <p className="mt-0.5 text-amber-700">数据库中暂无安全设置记录，建议先初始化默认配置。</p>
              </div>
            </div>
            <Button size="sm" variant="outline" onClick={handleInitializeDefaults}>
              <RotateCcw className="mr-1.5 h-4 w-4" />
              初始化默认配置
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 安全提示 */}
      <Card className="border-yellow-200/80 bg-yellow-50/40 shadow-sm">
        <CardContent className="p-3">
          <div className="flex items-start gap-3">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-yellow-600" />
            <div className="text-sm text-yellow-800">
              <p className="font-medium">安全提示</p>
              <p className="mt-0.5 text-xs leading-relaxed">修改安全设置将立即生效。建议先在测试环境验证后再应用到生产环境。</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 批量操作栏（选中项后才显示） */}
      {selectedKeys.size > 0 && (
        <Card className="border-blue-300 bg-blue-50/60 shadow-sm">
          <CardContent className="flex flex-col gap-2 p-3">
            <div className="flex flex-wrap items-center gap-2">
              <div className="flex items-center gap-2 text-sm">
                <Checkbox
                  checked={allSelected}
                  onCheckedChange={c => toggleSelectAll(!!c)}
                  aria-label="全选"
                  className={someSelected ? 'data-[state=checked]:bg-blue-500' : ''}
                />
                <span className="font-medium">已选 {selectedKeys.size} 项</span>
              </div>
              <div className="hidden h-4 w-px bg-blue-200 sm:block" />
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={bulkInvertSelection}>
                <FlipHorizontal className="mr-1 h-3 w-3" />
                反选
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => selectByType('boolean')}>
                <Filter className="mr-1 h-3 w-3" />
                全选开关
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={() => selectByType('number')}>
                <Filter className="mr-1 h-3 w-3" />
                全选数值
              </Button>
              <Button size="sm" variant="ghost" className="h-7 px-2 text-xs" onClick={copySelectedToClipboard}>
                <Copy className="mr-1 h-3 w-3" />
                复制
              </Button>
            </div>
            <div className="flex flex-wrap gap-2">
              {selectedBooleans.length > 0 && (
                <>
                  <Button size="sm" variant="outline" onClick={() => bulkSetBoolean('true')}>
                    <CheckCircle2 className="mr-1.5 h-4 w-4 text-green-600" />
                    批量启用 ({selectedBooleans.length})
                  </Button>
                  <Button size="sm" variant="outline" onClick={() => bulkSetBoolean('false')}>
                    <XCircle className="mr-1.5 h-4 w-4 text-gray-500" />
                    批量禁用
                  </Button>
                </>
              )}
              <Button size="sm" variant="outline" onClick={bulkResetSelectedToDefault}>
                <RotateCcw className="mr-1.5 h-4 w-4" />
                批量重置默认
              </Button>
              <Button size="sm" variant="outline" onClick={exportSelected}>
                <Download className="mr-1.5 h-4 w-4" />
                导出选中
              </Button>
            </div>
          </CardContent>
        </Card>
      )}

      {/* 登录安全 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <Lock className="h-4 w-4 text-red-500" />
                登录安全
              </CardTitle>
              <CardDescription className="text-xs">配置登录失败锁定、密码强度与会话时长</CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={loginSecurityFields.every(f => selectedKeys.has(f.key))}
                onCheckedChange={c => {
                  loginSecurityFields.forEach(f => toggleSelect(f.key, !!c));
                }}
              />
              <span className="text-muted-foreground">全选本组</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="divide-y px-4 pb-4 pt-0">
          {loginSecurityFields.map(field => (
            <ConfigRow
              key={field.key}
              field={field}
              value={values[field.key] ?? ''}
              onChange={v => updateValue(field.key, v)}
              isSelected={selectedKeys.has(field.key)}
              onSelectChange={c => toggleSelect(field.key, c)}
            />
          ))}
        </CardContent>
      </Card>

      {/* 注册控制 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <UserPlus className="h-4 w-4 text-blue-500" />
                注册控制
              </CardTitle>
              <CardDescription className="text-xs">控制用户注册行为和验证要求</CardDescription>
            </div>
            <div className="flex items-center gap-2 text-xs">
              <Checkbox
                checked={registerFields.every(f => selectedKeys.has(f.key))}
                onCheckedChange={c => {
                  registerFields.forEach(f => toggleSelect(f.key, !!c));
                }}
              />
              <span className="text-muted-foreground">全选本组</span>
            </div>
          </div>
        </CardHeader>
        <CardContent className="divide-y px-4 pb-4 pt-0">
          {registerFields.map(field => (
            <ConfigRow
              key={field.key}
              field={field}
              value={values[field.key] ?? ''}
              onChange={v => updateValue(field.key, v)}
              isSelected={selectedKeys.has(field.key)}
              onSelectChange={c => toggleSelect(field.key, c)}
            />
          ))}
        </CardContent>
      </Card>

      {/* 底部操作区 */}
      <Card className="shadow-sm">
        <CardHeader className="pb-2 pt-4">
          <div className="flex items-start justify-between gap-3">
            <div>
              <CardTitle className="flex items-center gap-2 text-base">
                <ClipboardList className="h-4 w-4 text-amber-500" />
                当前配置状态
              </CardTitle>
              <CardDescription className="text-xs">实时反映所有已保存配置项的当前值</CardDescription>
            </div>
            <AlertDialog>
              <AlertDialogTrigger asChild>
                <Button size="sm" variant="ghost">
                  <RotateCcw className="mr-1.5 h-4 w-4" />
                  全部重置默认
                </Button>
              </AlertDialogTrigger>
              <AlertDialogContent>
                <AlertDialogHeader>
                  <AlertDialogTitle>全部重置为默认值？</AlertDialogTitle>
                  <AlertDialogDescription>
                    将把全部 {SECURITY_FIELDS.length} 项恢复为默认值，未保存前不会写入数据库。
                  </AlertDialogDescription>
                </AlertDialogHeader>
                <AlertDialogFooter>
                  <AlertDialogCancel>取消</AlertDialogCancel>
                  <AlertDialogAction onClick={resetAllToDefault}>确认重置</AlertDialogAction>
                </AlertDialogFooter>
              </AlertDialogContent>
            </AlertDialog>
          </div>
        </CardHeader>
        <CardContent className="overflow-x-auto px-4 pb-4 pt-0">
          <div className="grid min-w-[16rem] gap-2 sm:grid-cols-2 lg:grid-cols-3">
            {SECURITY_FIELDS.map(f => {
              const isOn = f.type === 'boolean' && values[f.key] === 'true';
              return (
                <div
                  key={f.key}
                  className="flex items-center gap-2.5 rounded-md border bg-card/60 p-2.5 transition-colors hover:bg-accent/40"
                >
                  <div
                    className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-semibold ${
                      f.type === 'boolean'
                        ? isOn
                          ? 'bg-green-100 text-green-700'
                          : 'bg-gray-100 text-gray-500'
                        : 'bg-blue-100 text-blue-700'
                    }`}
                  >
                    {f.type === 'boolean' ? (isOn ? 'ON' : 'OFF') : (values[f.key] ?? '-')}
                  </div>
                  <span className="line-clamp-1 text-sm text-foreground">{f.label}</span>
                </div>
              );
            })}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}

interface ConfigRowProps {
  field: SecurityField;
  value: string;
  onChange: (v: string) => void;
  isSelected: boolean;
  onSelectChange: (c: boolean) => void;
}

function ConfigRow({ field, value, onChange, isSelected, onSelectChange }: ConfigRowProps) {
  const numVal = Number(value || 0);
  const atMin = field.min !== undefined && numVal <= field.min;
  const atMax = field.max !== undefined && numVal >= field.max;

  return (
    <div
      className={`flex items-center justify-between gap-3 py-2.5 first:pt-1 last:pb-1 ${
        isSelected ? 'bg-blue-50/50 -mx-4 px-4 rounded-md' : ''
      }`}
    >
      <div className="flex min-w-0 flex-1 items-start gap-2.5">
        <Checkbox
          checked={isSelected}
          onCheckedChange={c => onSelectChange(!!c)}
          aria-label={`选择 ${field.label}`}
          className="mt-0.5"
        />
        <div className="min-w-0 flex-1">
          <Label className="text-sm font-medium">{field.label}</Label>
          <p className="mt-0.5 line-clamp-2 text-xs text-muted-foreground">{field.description}</p>
          <code className="mt-1 inline-block rounded bg-muted px-1.5 py-0.5 font-mono text-[10px] text-muted-foreground">
            {field.key}
          </code>
        </div>
      </div>
      <div className="shrink-0">
        {field.type === 'boolean' ? (
          <div className="flex items-center gap-2">
            <span className={`text-xs font-semibold ${value === 'true' ? 'text-blue-600' : 'text-gray-400'}`}>
              {value === 'true' ? 'ON' : 'OFF'}
            </span>
            <button
              type="button"
              onClick={() => onChange(value === 'true' ? 'false' : 'true')}
              className={`relative inline-flex h-5 w-9 shrink-0 cursor-pointer items-center rounded-full border-2 border-transparent transition-colors ${
                value === 'true' ? 'bg-blue-500' : 'bg-gray-300'
              }`}
            >
              <span
                className={`pointer-events-none inline-block h-4 w-4 transform rounded-full bg-white shadow ring-0 transition ${
                  value === 'true' ? 'translate-x-4' : 'translate-x-0'
                }`}
              />
            </button>
          </div>
        ) : (
          <div className="flex items-center gap-1">
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              disabled={atMin}
              onClick={() => onChange(String(atMin ? numVal : Math.max(field.min ?? 0, numVal - 1)))}
            >
              -
            </Button>
            <Input
              type="number"
              className="h-8 w-20 text-center text-sm"
              min={field.min}
              max={field.max}
              value={value}
              onChange={e => onChange(e.target.value)}
            />
            <Button
              size="icon"
              variant="ghost"
              className="h-7 w-7 text-muted-foreground"
              disabled={atMax}
              onClick={() => onChange(String(atMax ? numVal : Math.min(field.max ?? 9999, numVal + 1)))}
            >
              +
            </Button>
          </div>
        )}
      </div>
    </div>
  );
}
