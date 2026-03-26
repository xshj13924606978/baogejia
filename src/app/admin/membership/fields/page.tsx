'use client';

import React, { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Switch } from '@/components/ui/switch';
import { Loader2, Save, RotateCcw, ShieldCheck, Eye } from 'lucide-react';
import { toast } from 'sonner';

interface LevelConfig {
  level: number;
  name: string;
  requiredPoints: number;
  role: string;
  fieldPermissions: Record<string, boolean>;
}

const FIELD_LABELS: Record<string, string> = {
  can_view_cost_price: '查看成本价',
  can_view_min_price: '查看最低价',
  can_view_manufacturer: '查看制造商',
  can_view_contact: '查看联系方式',
  can_view_phone: '查看手机号',
};

const FIELD_KEYS = Object.keys(FIELD_LABELS);

export default function MembershipFieldPermissionsPage() {
  const [levels, setLevels] = useState<LevelConfig[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [edited, setEdited] = useState(false);
  const [permissions, setPermissions] = useState<Record<number, Record<string, boolean>>>({});

  const loadLevels = async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/levels');
      const data = await res.json();
      if (data.success) {
        const list = data.data || data.levels || [];
        setLevels(list);
        // 初始化权限矩阵
        const init: Record<number, Record<string, boolean>> = {};
        list.forEach((l: LevelConfig) => {
          init[l.level] = { ...FIELD_KEYS.reduce((acc, k) => ({ ...acc, [k]: false }), {}), ...(l.fieldPermissions || {}) };
        });
        setPermissions(init);
        setEdited(false);
      } else {
        toast.error('加载等级配置失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => { loadLevels(); }, []);

  const togglePermission = (level: number, field: string) => {
    setPermissions(prev => ({
      ...prev,
      [level]: {
        ...prev[level],
        [field]: !prev[level][field],
      },
    }));
    setEdited(true);
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      // 逐个等级更新
      const updates = Object.entries(permissions).map(async ([level, perms]) => {
        const res = await fetch(`/api/admin/levels/${level}`, {
          method: 'PUT',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ fieldPermissions: perms }),
        });
        return res.json();
      });
      const results = await Promise.all(updates);
      const failed = results.filter(r => !r.success);
      if (failed.length === 0) {
        toast.success('字段权限保存成功');
        setEdited(false);
      } else {
        toast.error(`${failed.length} 个等级保存失败`);
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  const handleReset = () => {
    const init: Record<number, Record<string, boolean>> = {};
    levels.forEach(l => {
      init[l.level] = { ...FIELD_KEYS.reduce((acc, k) => ({ ...acc, [k]: false }), {}), ...(l.fieldPermissions || {}) };
    });
    setPermissions(init);
    setEdited(false);
    toast.info('已重置为原始配置');
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-24">
        <Loader2 className="h-8 w-8 animate-spin text-muted-foreground" />
        <span className="ml-2 text-muted-foreground">加载字段权限配置...</span>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      {/* 标题 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">字段权限</h1>
          <p className="text-gray-500">配置各会员等级可查看的产品字段</p>
        </div>
        <div className="flex gap-2">
          {edited && (
            <Button variant="outline" onClick={handleReset} disabled={saving}>
              <RotateCcw className="h-4 w-4 mr-2" />
              重置
            </Button>
          )}
          <Button onClick={handleSave} disabled={saving || !edited}>
            {saving ? <Loader2 className="h-4 w-4 mr-2 animate-spin" /> : <Save className="h-4 w-4 mr-2" />}
            {edited ? '保存更改' : '无更改'}
          </Button>
        </div>
      </div>

      {/* 说明 */}
      <Card>
        <CardContent className="p-4">
          <div className="flex items-start gap-3">
            <ShieldCheck className="h-5 w-5 text-blue-500 mt-0.5" />
            <div className="text-sm text-gray-600">
              <p>字段权限控制不同会员等级可以查看的产品信息。开启后，对应等级的用户在产品列表和报价单中可以看到该字段。</p>
              <p className="mt-1">默认所有等级无法查看成本价、最低价等敏感信息。修改后请点击"保存更改"。</p>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 权限矩阵 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">权限矩阵</CardTitle>
          <CardDescription>行为会员等级，列为可查看的字段</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="overflow-auto">
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead className="w-[160px]">会员等级</TableHead>
                  {FIELD_KEYS.map(key => (
                    <TableHead key={key} className="text-center min-w-[120px]">{FIELD_LABELS[key]}</TableHead>
                  ))}
                  <TableHead className="text-center w-[80px]">已授权</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {levels.map((level) => {
                  const perms = permissions[level.level] || {};
                  const grantedCount = FIELD_KEYS.filter(k => perms[k]).length;
                  return (
                    <TableRow key={level.level}>
                      <TableCell>
                        <div>
                          <span className="font-medium">{level.name}</span>
                          <p className="text-xs text-gray-400">Lv.{level.level} · {level.requiredPoints}积分</p>
                        </div>
                      </TableCell>
                      {FIELD_KEYS.map(key => (
                        <TableCell key={key} className="text-center">
                          <button
                            onClick={() => togglePermission(level.level, key)}
                            className={`inline-flex items-center justify-center w-9 h-9 rounded-md border transition-colors ${
                              perms[key]
                                ? 'bg-blue-50 border-blue-300 text-blue-600 hover:bg-blue-100'
                                : 'border-gray-200 text-gray-300 hover:border-gray-300 hover:text-gray-400'
                            }`}
                          >
                            {perms[key] ? <Eye className="h-4 w-4" /> : <Eye className="h-4 w-4 opacity-30" />}
                          </button>
                        </TableCell>
                      ))}
                      <TableCell className="text-center">
                        <Badge variant={grantedCount > 0 ? 'default' : 'outline'} className={grantedCount > 0 ? 'bg-blue-100 text-blue-700' : ''}>
                          {grantedCount}/{FIELD_KEYS.length}
                        </Badge>
                      </TableCell>
                    </TableRow>
                  );
                })}
              </TableBody>
            </Table>
          </div>
        </CardContent>
      </Card>

      {/* 字段说明 */}
      <Card>
        <CardHeader>
          <CardTitle className="text-lg">字段说明</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid gap-3 md:grid-cols-2 lg:grid-cols-3">
            {FIELD_KEYS.map(key => (
              <div key={key} className="flex items-center gap-3 p-3 rounded-lg border">
                <div className="bg-blue-100 p-1.5 rounded">
                  <Eye className="h-4 w-4 text-blue-600" />
                </div>
                <div>
                  <p className="text-sm font-medium">{FIELD_LABELS[key]}</p>
                  <p className="text-xs text-gray-400">{key.replace(/_/g, ' ')}</p>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
