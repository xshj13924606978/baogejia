'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { Plus, Edit, Trash2, Eye, Loader2, Braces } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogFooter } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { Label } from '@/components/ui/label';

const API = '/api/admin/config/fields';
const MODULES_API = '/api/admin/config/modules';
const PAGES_API = '/api/admin/config/pages';

const FIELD_TYPES = [
  { value: 'text', label: '文本' },
  { value: 'number', label: '数字' },
  { value: 'select', label: '下拉选择' },
  { value: 'date', label: '日期' },
  { value: 'datetime', label: '日期时间' },
  { value: 'textarea', label: '多行文本' },
  { value: 'json', label: 'JSON' },
  { value: 'file', label: '文件' },
  { value: 'image', label: '图片' },
  { value: 'switch', label: '开关' },
  { value: 'email', label: '邮箱' },
  { value: 'phone', label: '手机号' },
  { value: 'url', label: '网址' },
  { value: 'color', label: '颜色' },
  { value: 'tag', label: '标签' },
  { value: 'cascader', label: '级联选择' },
  { value: 'rich_text', label: '富文本' },
];

const FIELD_TYPE_LABELS: Record<string, string> = Object.fromEntries(FIELD_TYPES.map(t => [t.value, t.label]));

interface FieldItem {
  id: string;
  page_id: string;
  field_key: string;
  field_type: string;
  label_zh: string;
  is_visible: boolean;
  is_editable: boolean;
  is_required: boolean;
  sort_order: number;
  group_name: string | null;
  default_value: unknown;
  validation_rules: Record<string, unknown>;
  options_config: Record<string, unknown> | null;
  config: Record<string, unknown>;
  page?: { id: string; page_key: string; name_zh: string } | null;
}

const emptyForm = {
  page_id: '', field_key: '', field_type: 'text', label_zh: '',
  is_visible: true, is_editable: true, is_required: false,
  sort_order: 0, group_name: '',
  validation_rules: '{}' as string,
  config: '{}' as string,
};

export default function ConfigFields() {
  const [items, setItems] = useState<FieldItem[]>([]);
  const [modules, setModules] = useState<{ id: string; name_zh: string }[]>([]);
  const [pages, setPages] = useState<{ id: string; name_zh: string }[]>([]);
  const [loading, setLoading] = useState(true);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [pageSize] = useState(100);
  const [filterModule, setFilterModule] = useState('');
  const [filterPage, setFilterPage] = useState('');

  const [dialogOpen, setDialogOpen] = useState(false);
  const [editing, setEditing] = useState<FieldItem | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [submitting, setSubmitting] = useState(false);

  const [deleteTarget, setDeleteTarget] = useState<FieldItem | null>(null);
  const [deleting, setDeleting] = useState(false);

  const loadModules = useCallback(async () => {
    const res = await fetch(`${MODULES_API}?all=true`);
    const data = await res.json();
    if (data.success) setModules((data.data || []).map((m: any) => ({ id: m.id, name_zh: m.name_zh })));
  }, []);

  const loadPages = useCallback(async (moduleId: string) => {
    if (!moduleId) { setPages([]); return; }
    const res = await fetch(`${PAGES_API}?module_id=${moduleId}&limit=200`);
    const data = await res.json();
    if (data.success) setPages((data.data || []).map((p: any) => ({ id: p.id, name_zh: p.name_zh })));
  }, []);

  useEffect(() => { loadModules(); }, [loadModules]);
  useEffect(() => { loadPages(filterModule); }, [filterModule, loadPages]);

  const loadItems = useCallback(async () => {
    if (!filterPage) { setItems([]); setTotal(0); setLoading(false); return; }
    setLoading(true);
    try {
      const params = new URLSearchParams({ page: String(page), limit: String(pageSize), page_id: filterPage });
      const res = await fetch(`${API}?${params}`);
      const data = await res.json();
      if (data.success) { setItems(data.data || []); setTotal(data.total || 0); }
      else toast.error(data.error || '加载失败');
    } catch { toast.error('网络错误'); }
    finally { setLoading(false); }
  }, [page, pageSize, filterPage]);

  useEffect(() => { loadItems(); }, [loadItems]);

  const openCreate = () => {
    setEditing(null);
    setForm({ ...emptyForm, page_id: filterPage });
    setDialogOpen(true);
  };

  const openEdit = (f: FieldItem) => {
    setEditing(f);
    setForm({
      page_id: f.page_id,
      field_key: f.field_key,
      field_type: f.field_type,
      label_zh: f.label_zh,
      is_visible: f.is_visible,
      is_editable: f.is_editable,
      is_required: f.is_required,
      sort_order: f.sort_order,
      group_name: f.group_name || '',
      validation_rules: JSON.stringify(f.validation_rules || {}, null, 2),
      config: JSON.stringify(f.config || {}, null, 2),
    });
    setDialogOpen(true);
  };

  const parseJson = (str: string): Record<string, unknown> => {
    try { return JSON.parse(str); } catch { return {}; }
  };

  const handleSubmit = async () => {
    if (!form.page_id || !form.field_key || !form.label_zh) { toast.error('页面、字段代码和标签不能为空'); return; }
    const validationRules = parseJson(form.validation_rules);
    const configVal = parseJson(form.config);
    if (form.validation_rules.trim() && Object.keys(validationRules).length === 0) { toast.error('validation_rules JSON 格式错误'); return; }

    setSubmitting(true);
    try {
      const method = editing ? 'PUT' : 'POST';
      const url = editing ? `${API}/${editing.id}` : API;
      const body = { ...form, validation_rules: validationRules, config: configVal };
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(body) });
      const data = await res.json();
      if (data.success) { toast.success(editing ? '更新成功' : '创建成功'); setDialogOpen(false); loadItems(); }
      else toast.error(data.error || '操作失败');
    } catch { toast.error('网络错误'); }
    finally { setSubmitting(false); }
  };

  const handleToggle = async (f: FieldItem, key: 'is_visible' | 'is_editable') => {
    try {
      const res = await fetch(`${API}/${f.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ [key]: !f[key] }) });
      const data = await res.json();
      if (data.success) loadItems();
      else toast.error(data.error || '操作失败');
    } catch { toast.error('网络错误'); }
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const res = await fetch(`${API}/${deleteTarget.id}`, { method: 'DELETE' });
      const data = await res.json();
      if (data.success) { toast.success('已删除'); loadItems(); }
      else toast.error(data.error || '删除失败');
    } catch { toast.error('网络错误'); }
    finally { setDeleting(false); setDeleteTarget(null); }
  };

  const totalPages = Math.ceil(total / pageSize);

  return (
    <div className="space-y-4">
      {/* 级联筛选 */}
      <div className="flex items-center gap-2 flex-1">
        <select className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={filterModule} onChange={(e) => { setFilterModule(e.target.value); setFilterPage(''); setPage(1); }}>
          <option value="">选择模块</option>
          {modules.map(m => <option key={m.id} value={m.id}>{m.name_zh}</option>)}
        </select>
        <select className="h-9 rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={filterPage} onChange={(e) => { setFilterPage(e.target.value); setPage(1); }} disabled={!filterModule}>
          <option value="">选择页面</option>
          {pages.map(p => <option key={p.id} value={p.id}>{p.name_zh}</option>)}
        </select>
        <div className="flex-1" />
        <Button size="sm" onClick={openCreate} disabled={!filterPage}><Plus className="h-4 w-4 mr-1" /> 新增字段</Button>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-12"><Loader2 className="h-6 w-6 animate-spin text-muted-foreground" /></div>
      ) : items.length === 0 ? (
        <div className="flex flex-col items-center justify-center py-12 text-center text-muted-foreground">
          <Braces className="h-10 w-10 mb-2 opacity-30" />
          <p className="font-medium">暂无字段</p>
          <p className="text-sm">{filterPage ? '该页面下还没有字段配置' : '请先选择模块和页面'}</p>
        </div>
      ) : (
        <div className="border rounded-md overflow-auto">
          <Table>
            <TableHeader>
              <TableRow>
                <TableHead className="w-[50px]">排序</TableHead>
                <TableHead>字段代码</TableHead>
                <TableHead>标签</TableHead>
                <TableHead>类型</TableHead>
                <TableHead>分组</TableHead>
                <TableHead>可见</TableHead>
                <TableHead>可编辑</TableHead>
                <TableHead>必填</TableHead>
                <TableHead className="w-[140px]">操作</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {items.map((f) => (
                <TableRow key={f.id}>
                  <TableCell className="text-muted-foreground text-sm">{f.sort_order}</TableCell>
                  <TableCell><code className="text-xs bg-muted px-1.5 py-0.5 rounded">{f.field_key}</code></TableCell>
                  <TableCell className="font-medium">{f.label_zh}</TableCell>
                  <TableCell><Badge variant="outline" className="text-xs">{FIELD_TYPE_LABELS[f.field_type] || f.field_type}</Badge></TableCell>
                  <TableCell className="text-muted-foreground text-sm">{f.group_name || '-'}</TableCell>
                  <TableCell><Badge variant={f.is_visible ? 'default' : 'secondary'} className={`text-xs cursor-pointer ${f.is_visible ? 'bg-green-100 text-green-700' : ''}`} onClick={() => handleToggle(f, 'is_visible')}>{f.is_visible ? '是' : '否'}</Badge></TableCell>
                  <TableCell><Badge variant={f.is_editable ? 'default' : 'secondary'} className={`text-xs cursor-pointer ${f.is_editable ? 'bg-blue-100 text-blue-700' : ''}`} onClick={() => handleToggle(f, 'is_editable')}>{f.is_editable ? '是' : '否'}</Badge></TableCell>
                  <TableCell><Badge variant={f.is_required ? 'default' : 'secondary'} className="text-xs">{f.is_required ? '是' : '否'}</Badge></TableCell>
                  <TableCell>
                    <div className="flex items-center gap-1">
                      <Button variant="ghost" size="icon" className="h-8 w-8" onClick={() => openEdit(f)} title="编辑"><Edit className="h-4 w-4" /></Button>
                      <Button variant="ghost" size="icon" className="h-8 w-8 text-destructive" onClick={() => setDeleteTarget(f)} title="删除"><Trash2 className="h-4 w-4" /></Button>
                    </div>
                  </TableCell>
                </TableRow>
              ))}
            </TableBody>
          </Table>
        </div>
      )}

      {totalPages > 1 && (
        <div className="flex items-center justify-between text-sm">
          <span className="text-muted-foreground">共 {total} 条</span>
          <div className="flex items-center gap-1">
            <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
            <span className="px-3">{page} / {totalPages}</span>
            <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
          </div>
        </div>
      )}

      {/* 新增/编辑弹窗 */}
      <Dialog open={dialogOpen} onOpenChange={setDialogOpen}>
        <DialogContent className="max-w-[560px] max-h-[85vh] overflow-y-auto">
          <DialogHeader><DialogTitle>{editing ? '编辑字段' : '新增字段'}</DialogTitle></DialogHeader>
          <div className="grid gap-4 py-4">
            <div className="grid grid-cols-2 gap-4">
              <div className="grid gap-2">
                <Label>字段代码 <span className="text-destructive">*</span></Label>
                <Input value={form.field_key} onChange={(e) => setForm({ ...form, field_key: e.target.value })} placeholder="如 username" disabled={!!editing} />
              </div>
              <div className="grid gap-2">
                <Label>字段类型 <span className="text-destructive">*</span></Label>
                <select className="h-9 w-full rounded-md border border-input bg-transparent px-3 py-1 text-sm" value={form.field_type} onChange={(e) => setForm({ ...form, field_type: e.target.value })}>
                  {FIELD_TYPES.map(t => <option key={t.value} value={t.value}>{t.label}</option>)}
                </select>
              </div>
            </div>
            <div className="grid gap-2">
              <Label>中文标签 <span className="text-destructive">*</span></Label>
              <Input value={form.label_zh} onChange={(e) => setForm({ ...form, label_zh: e.target.value })} placeholder="用户名" />
            </div>
            <div className="grid grid-cols-3 gap-4">
              <div className="grid gap-2">
                <Label>分组名称</Label>
                <Input value={form.group_name} onChange={(e) => setForm({ ...form, group_name: e.target.value })} placeholder="基本信息" />
              </div>
              <div className="grid gap-2">
                <Label>排序</Label>
                <Input type="number" value={form.sort_order} onChange={(e) => setForm({ ...form, sort_order: Number(e.target.value) })} />
              </div>
              <div className="grid gap-2">
                <Label>默认值</Label>
                <Input value={(form as any).default_value || ''} onChange={(e) => setForm({ ...form, default_value: e.target.value } as any)} placeholder="可选" />
              </div>
            </div>

            {/* 开关行 */}
            <div className="flex items-center gap-6">
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_visible} onChange={(e) => setForm({ ...form, is_visible: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
                可见
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_editable} onChange={(e) => setForm({ ...form, is_editable: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
                可编辑
              </label>
              <label className="flex items-center gap-2 text-sm cursor-pointer">
                <input type="checkbox" checked={form.is_required} onChange={(e) => setForm({ ...form, is_required: e.target.checked })} className="h-4 w-4 rounded border-gray-300" />
                必填
              </label>
            </div>

            {/* JSON 编辑器区域 */}
            <div className="grid gap-2">
              <Label>校验规则 (JSON)</Label>
              <textarea
                className="w-full min-h-[100px] rounded-md border border-input bg-muted/50 px-3 py-2 text-xs font-mono resize-y"
                value={form.validation_rules}
                onChange={(e) => setForm({ ...form, validation_rules: e.target.value })}
                placeholder='{"required": true, "minLength": 2, "maxLength": 200}'
              />
            </div>
            <div className="grid gap-2">
              <Label>扩展配置 (JSON)</Label>
              <textarea
                className="w-full min-h-[80px] rounded-md border border-input bg-muted/50 px-3 py-2 text-xs font-mono resize-y"
                value={form.config}
                onChange={(e) => setForm({ ...form, config: e.target.value })}
                placeholder='{"width": 200, "placeholder": "请输入"}'
              />
            </div>
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setDialogOpen(false)}>取消</Button>
            <Button onClick={handleSubmit} disabled={submitting}>{submitting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}{editing ? '保存' : '创建'}</Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* 删除确认 */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>确认删除</AlertDialogTitle>
            <AlertDialogDescription>确定要删除字段「{deleteTarget?.label_zh}」吗？</AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>取消</AlertDialogCancel>
            <AlertDialogAction onClick={handleDelete} disabled={deleting} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              {deleting && <Loader2 className="h-4 w-4 mr-1 animate-spin" />}删除
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
}
