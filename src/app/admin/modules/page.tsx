'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Label } from '@/components/ui/label';
import {
  Dialog, DialogContent, DialogDescription, DialogFooter,
  DialogHeader, DialogTitle,
} from '@/components/ui/dialog';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import { Settings, Plus, Edit2, Trash2, Loader2, ToggleLeft, ToggleRight } from 'lucide-react';
import { toast } from 'sonner';

interface Module {
  id?: string;
  module_code: string;
  module_name: string;
  description: string;
  is_active: boolean;
}

export default function ModulesPage() {
  const [modules, setModules] = useState<Module[]>([]);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);

  // 对话框
  const [showAddDialog, setShowAddDialog] = useState(false);
  const [showEditDialog, setShowEditDialog] = useState(false);
  const [showDeleteDialog, setShowDeleteDialog] = useState(false);
  const [editModule, setEditModule] = useState<Module | null>(null);
  const [deleteModule, setDeleteModule] = useState<Module | null>(null);

  // 表单
  const [form, setForm] = useState({ code: '', name: '', description: '' });

  const loadModules = useCallback(async () => {
    setLoading(true);
    try {
      const res = await fetch('/api/admin/modules');
      const data = await res.json();
      if (data.success) {
        setModules(data.data || []);
      } else {
        toast.error(data.error || '加载失败');
      }
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  }, []);

  useEffect(() => { loadModules(); }, [loadModules]);

  // 添加
  const handleAdd = async () => {
    if (!form.code || !form.name) { toast.error('模块代码和名称不能为空'); return; }
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/modules', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ module_code: form.code, module_name: form.name, description: form.description }),
      });
      const data = await res.json();
      if (data.success) { toast.success('模块创建成功'); setShowAddDialog(false); setForm({ code: '', name: '', description: '' }); loadModules(); }
      else { toast.error(data.error || '创建失败'); }
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  // 编辑
  const openEdit = (m: Module) => {
    setEditModule(m);
    setForm({ code: m.module_code, name: m.module_name, description: m.description });
    setShowEditDialog(true);
  };

  const handleEdit = async () => {
    if (!editModule?.id) return;
    setSubmitting(true);
    try {
      const res = await fetch('/api/admin/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: editModule.id, module_name: form.name, description: form.description }),
      });
      const data = await res.json();
      if (data.success) { toast.success('更新成功'); setShowEditDialog(false); loadModules(); }
      else { toast.error(data.error || '更新失败'); }
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  // 删除
  const openDelete = (m: Module) => { setDeleteModule(m); setShowDeleteDialog(true); };
  const handleDelete = async () => {
    if (!deleteModule?.id) return;
    setSubmitting(true);
    try {
      const res = await fetch(`/api/admin/modules?id=${deleteModule.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast.success('已删除'); setShowDeleteDialog(false); loadModules(); }
      else { toast.error(data.error || '删除失败'); }
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  // 启用/禁用
  const handleToggle = async (m: Module) => {
    try {
      const res = await fetch('/api/admin/modules', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: m.id, is_active: !m.is_active }),
      });
      const data = await res.json();
      if (data.success) { toast.success(m.is_active ? '已禁用' : '已启用'); loadModules(); }
      else { toast.error(data.error || '操作失败'); }
    } catch { toast.error('网络错误'); }
  };

  const activeCount = modules.filter((m) => m.is_active).length;

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">模块管理</h1>
          <p className="text-gray-500">管理系统功能模块的启用和配置</p>
        </div>
        <Button onClick={() => { setForm({ code: '', name: '', description: '' }); setShowAddDialog(true); }}>
          <Plus className="h-4 w-4 mr-2" />新增模块
        </Button>
      </div>

      {/* 统计 */}
      <div className="grid gap-4 md:grid-cols-2">
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-blue-100 p-2 rounded-lg"><Settings className="h-5 w-5 text-blue-600" /></div>
              <div><p className="text-sm text-gray-500">总模块数</p><p className="text-xl font-bold">{modules.length}</p></div>
            </div>
          </CardContent>
        </Card>
        <Card>
          <CardContent className="p-4">
            <div className="flex items-center gap-3">
              <div className="bg-green-100 p-2 rounded-lg"><ToggleRight className="h-5 w-5 text-green-600" /></div>
              <div><p className="text-sm text-gray-500">已启用</p><p className="text-xl font-bold text-green-600">{activeCount}</p></div>
            </div>
          </CardContent>
        </Card>
      </div>

      {/* 模块列表 */}
      <Card>
        <CardHeader><CardTitle className="text-lg">模块列表</CardTitle></CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin" /><span className="ml-2">加载中...</span></div>
          ) : (
            <Table>
              <TableHeader>
                <TableRow>
                  <TableHead>状态</TableHead>
                  <TableHead>模块代码</TableHead>
                  <TableHead>名称</TableHead>
                  <TableHead>描述</TableHead>
                  <TableHead className="text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {modules.map((m) => (
                  <TableRow key={m.id || m.module_code}>
                    <TableCell>
                      <button
                        onClick={() => handleToggle(m)}
                        className={`relative inline-flex h-6 w-11 items-center rounded-full transition-colors ${m.is_active ? 'bg-green-600' : 'bg-gray-200'}`}
                      >
                        <span className={`inline-block h-4 w-4 transform rounded-full bg-white transition-transform ${m.is_active ? 'translate-x-6' : 'translate-x-1'}`} />
                      </button>
                    </TableCell>
                    <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{m.module_code}</code></TableCell>
                    <TableCell className="font-medium">{m.module_name}</TableCell>
                    <TableCell className="text-sm text-muted-foreground max-w-[300px] truncate">{m.description || '-'}</TableCell>
                    <TableCell className="text-right">
                      <div className="flex justify-end gap-1">
                        <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(m)}>
                          <Edit2 className="h-4 w-4" />
                        </Button>
                        <Button variant="ghost" size="icon" className="h-8 w-8 text-red-600" onClick={() => openDelete(m)}>
                          <Trash2 className="h-4 w-4" />
                        </Button>
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          )}
        </CardContent>
      </Card>

      {/* 新增对话框 */}
      <Dialog open={showAddDialog} onOpenChange={setShowAddDialog}>
        <DialogContent className="max-w-[450px]">
          <DialogHeader>
            <DialogTitle>新增模块</DialogTitle>
            <DialogDescription>添加新的功能模块</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>模块代码 <span className="text-destructive">*</span></Label>
              <Input placeholder="如: custom_module" value={form.code} onChange={(e) => setForm({ ...form, code: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>模块名称 <span className="text-destructive">*</span></Label>
              <Input placeholder="如: 自定义模块" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Input placeholder="模块功能描述" value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowAddDialog(false)}>取消</Button>
            <Button onClick={handleAdd} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}创建</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 编辑对话框 */}
      <Dialog open={showEditDialog} onOpenChange={setShowEditDialog}>
        <DialogContent className="max-w-[450px]">
          <DialogHeader>
            <DialogTitle>编辑模块</DialogTitle>
            <DialogDescription>修改模块信息</DialogDescription>
          </DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="space-y-2">
              <Label>模块代码</Label>
              <Input value={form.code} disabled className="bg-muted" />
            </div>
            <div className="space-y-2">
              <Label>模块名称</Label>
              <Input value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
            </div>
            <div className="space-y-2">
              <Label>描述</Label>
              <Input value={form.description} onChange={(e) => setForm({ ...form, description: e.target.value })} />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowEditDialog(false)}>取消</Button>
            <Button onClick={handleEdit} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}保存</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <Dialog open={showDeleteDialog} onOpenChange={setShowDeleteDialog}>
        <DialogContent className="max-w-[400px]">
          <DialogHeader>
            <DialogTitle>确认删除</DialogTitle>
            <DialogDescription>确定要删除模块「{deleteModule?.module_name}」（{deleteModule?.module_code}）吗？</DialogDescription>
          </DialogHeader>
          <DialogFooter>
            <Button variant="outline" onClick={() => setShowDeleteDialog(false)}>取消</Button>
            <Button variant="destructive" onClick={handleDelete} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}删除</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
}
