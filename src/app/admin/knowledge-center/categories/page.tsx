'use client';

import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useState, useEffect, useCallback, useMemo } from 'react';
import { toast } from 'sonner';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { Card, CardContent } from '@/components/ui/card';
import {
  Table, TableBody, TableCell, TableHead, TableHeader, TableRow,
} from '@/components/ui/table';
import {
  AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent,
  AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  Loader2, Trash2, Edit, CheckCircle2, XCircle, Plus, ListChecks,
} from 'lucide-react';
import { cn } from '@/lib/utils';

const TYPE_LABELS: Record<string, string> = {
  document: '技术文档库',
  case: '案例库',
  standard: '标准规范库',
  drawing: '图纸图片库',
  quota: '定额库',
};

const TYPES = ['document', 'case', 'standard', 'drawing', 'quota'];

interface Category {
  id: string;
  type: string;
  name: string;
  name_en?: string;
  icon?: string;
  metadata_key: string;
  sort_order: number;
  is_default: boolean;
  is_active: boolean;
  status: string;
  reject_reason?: string;
  created_at: string;
}

export default function KnowledgeCategoryManager() {
  const [categories, setCategories] = useState<Category[]>([]);
  const [pendingCategories, setPendingCategories] = useState<Category[]>([]);
  const [activeType, setActiveType] = useState<string>('document');
  const [loading, setLoading] = useState(false);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [editName, setEditName] = useState('');
  const [newCatName, setNewCatName] = useState('');
  const [showNewForm, setShowNewForm] = useState(false);

  // 批量操作状态（#[20260825-2350-1] 添加批量操作）
  const [selectedIds, setSelectedIds] = useState<Set<string>>(new Set());
  const [batchDeleteOpen, setBatchDeleteOpen] = useState(false);
  const [batchDeleting, setBatchDeleting] = useState(false);

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const headers = getClientAuthHeaders();
      const [listRes, pendingRes] = await Promise.all([
        fetch(`/api/admin/knowledge/categories-list?type=${activeType}`, { headers }),
        fetch('/api/admin/knowledge/categories/pending', { headers }),
      ]);
      const listJson = await listRes.json();
      const pendingJson = await pendingRes.json();
      if (listJson.success) setCategories(listJson.data || []);
      if (pendingJson.success) setPendingCategories(pendingJson.data || []);
    } catch {
      toast.error('加载分类失败');
    } finally {
      setLoading(false);
    }
  }, [activeType]);

  useEffect(() => {
    fetchCategories();
  }, [fetchCategories]);

  // 切换类型时清空选择（#[20260825-2350-1]）
  useEffect(() => {
    setSelectedIds(new Set());
  }, [activeType]);

  const handleCreate = async () => {
    if (!newCatName.trim()) return;
    try {
      const headers = getClientAuthHeaders();
      const res = await fetch('/api/admin/knowledge/categories', {
        method: 'POST',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ type: activeType, name: newCatName.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('分类创建成功');
        setNewCatName('');
        setShowNewForm(false);
        fetchCategories();
      } else {
        toast.error(json.error || '创建失败');
      }
    } catch {
      toast.error('创建失败');
    }
  };

  const handleUpdate = async (id: string) => {
    if (!editName.trim()) return;
    try {
      const headers = getClientAuthHeaders();
      const res = await fetch(`/api/admin/knowledge/categories/${id}`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: editName.trim() }),
      });
      const json = await res.json();
      if (json.success) {
        toast.success('更新成功');
        setEditingId(null);
        fetchCategories();
      } else {
        toast.error(json.error || '更新失败');
      }
    } catch {
      toast.error('更新失败');
    }
  };

  const handleDelete = async (cat: Category) => {
    if (cat.is_default) {
      toast.error('系统默认分类不可删除');
      return;
    }
    if (!await confirmDialog({ title: `确定删除分类"${cat.name}"吗？`, destructive: true })) return;
    try {
      const headers = getClientAuthHeaders();
      const res = await fetch(`/api/admin/knowledge/categories/${cat.id}`, {
        method: 'DELETE',
        headers,
      });
      const json = await res.json();
      if (json.success) {
        toast.success('删除成功');
        fetchCategories();
      } else {
        toast.error(json.error || '删除失败');
      }
    } catch {
      toast.error('删除失败');
    }
  };

  const handleAudit = async (id: string, action: 'approve' | 'reject') => {
    try {
      const headers = getClientAuthHeaders();
      const body: any = { action };
      if (action === 'reject') {
        const reason = prompt('请输入拒绝原因:');
        if (!reason) return;
        body.reject_reason = reason;
      }
      const res = await fetch(`/api/admin/knowledge/categories/${id}/audit`, {
        method: 'PUT',
        headers: { ...headers, 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });
      const json = await res.json();
      if (json.success) {
        toast.success(json.message);
        fetchCategories();
      } else {
        toast.error(json.error || '操作失败');
      }
    } catch {
      toast.error('操作失败');
    }
  };

  // 批量删除（#[20260825-2350-1]）
  const handleBatchDelete = async () => {
    if (selectedIds.size === 0) return;
    const idsToDelete = Array.from(selectedIds);
    const hasDefault = typeCategories.some(c => selectedIds.has(c.id) && c.is_default);
    if (hasDefault) {
      toast.error('选中的分类中包含系统默认分类，不可删除');
      return;
    }
    setBatchDeleting(true);
    try {
      const headers = getClientAuthHeaders();
      const results = await Promise.allSettled(
        idsToDelete.map(id =>
          fetch(`/api/admin/knowledge/categories/${id}`, { method: 'DELETE', headers })
        )
      );
      const successCount = results.filter(r => r.status === 'fulfilled').length;
      const failCount = results.length - successCount;
      if (failCount === 0) {
        toast.success(`成功删除 ${successCount} 个分类`);
      } else {
        toast.warning(`删除完成：成功 ${successCount} 个，失败 ${failCount} 个`);
      }
      setSelectedIds(new Set());
      fetchCategories();
    } catch {
      toast.error('批量删除失败');
    } finally {
      setBatchDeleting(false);
      setBatchDeleteOpen(false);
    }
  };

  const typeCategories = categories.filter(c => c.type === activeType);
  const pendingForType = pendingCategories.filter(c => c.type === activeType);

  // 选择相关（#[20260825-2350-1]）
  const allSelected = typeCategories.length > 0 && typeCategories.every(c => selectedIds.has(c.id));
  const someSelected = typeCategories.some(c => selectedIds.has(c.id)) && !allSelected;

  const toggleSelectAll = (checked: boolean) => {
    if (checked) {
      setSelectedIds(new Set(typeCategories.map(c => c.id)));
    } else {
      setSelectedIds(new Set());
    }
  };

  const toggleSelectOne = (id: string, checked: boolean) => {
    const next = new Set(selectedIds);
    if (checked) next.add(id);
    else next.delete(id);
    setSelectedIds(next);
  };

  return (
    <div className="p-6 space-y-5">
      {/* 头部 */}
      <div>
        <h1 className="text-2xl font-bold tracking-tight text-slate-900 dark:text-slate-100">资料分类管理</h1>
        <p className="text-sm text-muted-foreground mt-1">管理各子库的分类，审核用户提交的分类申请</p>
      </div>

      {/* 子库切换 */}
      <Card className="border-slate-200/80 dark:border-slate-700/60 shadow-sm">
        <CardContent className="p-2">
          <div className="flex flex-wrap gap-1">
            {TYPES.map(t => (
              <Button
                key={t}
                variant={activeType === t ? 'default' : 'ghost'}
                size="sm"
                onClick={() => setActiveType(t)}
                className={cn(
                  'text-sm',
                  activeType === t && 'bg-indigo-500 hover:bg-indigo-600 text-white'
                )}
              >
                {TYPE_LABELS[t]}
              </Button>
            ))}
          </div>
        </CardContent>
      </Card>

      {/* 待审核提示 */}
      {pendingForType.length > 0 && (
        <Card className="border-amber-200/80 dark:border-amber-800/60 shadow-sm bg-amber-50/40 dark:bg-amber-950/20">
          <CardContent className="p-4 space-y-3">
            <h3 className="font-medium text-amber-800 dark:text-amber-300 text-sm">待审核分类 ({pendingForType.length})</h3>
            <div className="space-y-2">
              {pendingForType.map(cat => (
                <div key={cat.id} className="flex items-center justify-between bg-white dark:bg-slate-900 rounded-lg border border-slate-200/70 dark:border-slate-700/60 p-3">
                  <div className="flex items-center gap-2">
                    <span className="font-medium text-sm">{cat.name}</span>
                    <span className="text-xs text-muted-foreground">{cat.created_at?.substring(0, 10)}</span>
                  </div>
                  <div className="flex gap-2">
                    <Button size="sm" variant="outline" className="h-7 text-xs border-green-300 text-green-700 hover:bg-green-50 dark:border-green-700 dark:text-green-300" onClick={() => handleAudit(cat.id, 'approve')}>
                      <CheckCircle2 className="h-3.5 w-3.5 mr-1" /> 通过
                    </Button>
                    <Button size="sm" variant="outline" className="h-7 text-xs border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300" onClick={() => handleAudit(cat.id, 'reject')}>
                      <XCircle className="h-3.5 w-3.5 mr-1" /> 拒绝
                    </Button>
                  </div>
                </div>
              ))}
            </div>
          </CardContent>
        </Card>
      )}

      {/* 操作栏 */}
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <span className="text-sm text-muted-foreground">{typeCategories.length} 个分类</span>
          {selectedIds.size > 0 && (
            <Badge variant="secondary" className="text-xs">
              已选 {selectedIds.size} 项
            </Badge>
          )}
        </div>
        <div className="flex items-center gap-2">
          {selectedIds.size > 0 && (
            <Button
              size="sm"
              variant="outline"
              className="text-xs border-red-300 text-red-700 hover:bg-red-50 dark:border-red-700 dark:text-red-300"
              onClick={() => setBatchDeleteOpen(true)}
            >
              <Trash2 className="h-3.5 w-3.5 mr-1" /> 批量删除
            </Button>
          )}
          <Button size="sm" onClick={() => setShowNewForm(!showNewForm)} className="text-xs bg-gradient-to-r from-indigo-500 to-blue-500 hover:from-indigo-600 hover:to-blue-600 text-white shadow-sm">
            <Plus className="h-3.5 w-3.5 mr-1" />
            {showNewForm ? '取消' : '新增分类'}
          </Button>
        </div>
      </div>

      {/* 新增表单 */}
      {showNewForm && (
        <Card className="border-slate-200/80 dark:border-slate-700/60 shadow-sm">
          <CardContent className="p-4 flex flex-wrap items-center gap-3">
            <Input
              type="text"
              value={newCatName}
              onChange={e => setNewCatName(e.target.value)}
              placeholder="输入分类名称"
              className="flex-1 min-w-[200px]"
              onKeyDown={e => e.key === 'Enter' && handleCreate()}
            />
            <Button size="sm" onClick={handleCreate} className="bg-indigo-500 hover:bg-indigo-600 text-white">
              确认添加
            </Button>
          </CardContent>
        </Card>
      )}

      {/* 分类列表 */}
      {loading ? (
        <Card className="border-slate-200/80 dark:border-slate-700/60 shadow-sm">
          <CardContent className="flex flex-col items-center justify-center gap-2 py-16 text-muted-foreground">
            <Loader2 className="h-8 w-8 animate-spin text-indigo-500" />
            <p className="text-sm">加载中...</p>
          </CardContent>
        </Card>
      ) : (
        <Card className="border-slate-200/80 dark:border-slate-700/60 shadow-sm overflow-hidden">
          <div className="overflow-auto" style={{ maxHeight: 'calc(100vh - 300px)', minHeight: 200 }}>
            <Table>
              <TableHeader className="sticky top-0 z-10 bg-slate-50/95 backdrop-blur dark:bg-slate-900/95 shadow-sm">
                <TableRow className="hover:bg-transparent">
                  <TableHead className="w-[44px]">
                    <Checkbox
                      checked={allSelected ? true : someSelected ? 'indeterminate' : false}
                      onCheckedChange={(v) => toggleSelectAll(Boolean(v))}
                      aria-label="全选当前页"
                    />
                  </TableHead>
                  <TableHead className="min-w-[180px]">名称</TableHead>
                  <TableHead className="min-w-[120px]">metadata_key</TableHead>
                  <TableHead className="w-[80px] text-center">排序</TableHead>
                  <TableHead className="w-[100px] text-center">状态</TableHead>
                  <TableHead className="w-[80px] text-center">默认</TableHead>
                  <TableHead className="w-[140px] text-right">操作</TableHead>
                </TableRow>
              </TableHeader>
              <TableBody>
                {typeCategories.map(cat => (
                  <TableRow
                    key={cat.id}
                    data-state={selectedIds.has(cat.id) ? 'selected' : undefined}
                    className={cn(
                      'transition-colors',
                      selectedIds.has(cat.id) && 'bg-indigo-50/70 hover:bg-indigo-50 dark:bg-indigo-950/30 dark:hover:bg-indigo-950/40'
                    )}
                  >
                    <TableCell>
                      <Checkbox
                        checked={selectedIds.has(cat.id)}
                        onCheckedChange={(v) => toggleSelectOne(cat.id, Boolean(v))}
                        aria-label={`选择 ${cat.name}`}
                      />
                    </TableCell>
                    <TableCell>
                      {editingId === cat.id ? (
                        <Input
                          type="text"
                          value={editName}
                          onChange={e => setEditName(e.target.value)}
                          className="h-8 text-sm w-40"
                          onKeyDown={e => { if (e.key === 'Enter') handleUpdate(cat.id); if (e.key === 'Escape') setEditingId(null); }}
                          autoFocus
                        />
                      ) : (
                        <div className="flex flex-col">
                          <span className="font-medium text-sm text-slate-900 dark:text-slate-100">{cat.name}</span>
                          {cat.name_en && <span className="text-xs text-muted-foreground">{cat.name_en}</span>}
                        </div>
                      )}
                    </TableCell>
                    <TableCell className="text-xs text-muted-foreground">{cat.metadata_key}</TableCell>
                    <TableCell className="text-center text-sm text-muted-foreground">{cat.sort_order}</TableCell>
                    <TableCell className="text-center">
                      <div className="flex items-center justify-center gap-1 flex-wrap">
                        <Badge variant={cat.is_active ? 'default' : 'secondary'} className={cn('text-[10px] px-1.5 py-0', cat.is_active ? 'bg-green-100 text-green-700 hover:bg-green-100' : 'bg-gray-100 text-gray-500 hover:bg-gray-100')}>
                          {cat.is_active ? '启用' : '禁用'}
                        </Badge>
                        <Badge variant="outline" className={cn('text-[10px] px-1.5 py-0', cat.status === 'approved' ? 'border-blue-300 text-blue-700 bg-blue-50' : cat.status === 'rejected' ? 'border-red-300 text-red-700 bg-red-50' : 'border-amber-300 text-amber-700 bg-amber-50')}>
                          {cat.status}
                        </Badge>
                      </div>
                    </TableCell>
                    <TableCell className="text-center">
                      {cat.is_default && <span className="text-xs text-muted-foreground">系统</span>}
                    </TableCell>
                    <TableCell>
                      <div className="flex items-center justify-end gap-1">
                        {editingId === cat.id ? (
                          <>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-green-700 hover:bg-green-50" onClick={() => handleUpdate(cat.id)}>
                              保存
                            </Button>
                            <Button size="sm" variant="ghost" className="h-7 text-xs text-muted-foreground hover:bg-gray-50" onClick={() => setEditingId(null)}>
                              取消
                            </Button>
                          </>
                        ) : (
                          <>
                            <Button size="icon" variant="ghost" className="h-8 w-8" onClick={() => { setEditingId(cat.id); setEditName(cat.name); }} title="编辑">
                              <Edit className="h-4 w-4" />
                            </Button>
                            <Button size="icon" variant="ghost" className="h-8 w-8 text-red-600 hover:text-red-700 hover:bg-red-50" onClick={() => handleDelete(cat)} title="删除" disabled={cat.is_default}>
                              <Trash2 className="h-4 w-4" />
                            </Button>
                          </>
                        )}
                      </div>
                    </TableCell>
                  </TableRow>
                ))}
                {typeCategories.length === 0 && (
                  <TableRow>
                    <TableCell colSpan={7} className="h-32 text-center text-muted-foreground">
                      <div className="flex flex-col items-center justify-center gap-2">
                        <ListChecks className="h-8 w-8 text-slate-300" />
                        <p className="text-sm">暂无分类</p>
                      </div>
                    </TableCell>
                  </TableRow>
                )}
              </TableBody>
            </Table>
          </div>
        </Card>
      )}

      {/* 批量删除确认弹窗（#[20260825-2350-1]） */}
      <AlertDialog open={batchDeleteOpen} onOpenChange={setBatchDeleteOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认批量删除</AlertDialogTitle>
            <AlertDialogDescription>
              确定要删除选中的 <strong>{selectedIds.size}</strong> 个分类吗？此操作不可恢复。
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={batchDeleting}>取消</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleBatchDelete(); }}
              disabled={batchDeleting}
              className="bg-red-600 hover:bg-red-700"
            >
              {batchDeleting ? <Loader2 className="h-4 w-4 animate-spin mr-1" /> : <Trash2 className="h-4 w-4 mr-1" />}
              确认删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
