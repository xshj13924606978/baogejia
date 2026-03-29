'use client';

import { useState, useEffect, useCallback } from 'react';
import { toast } from 'sonner';
import { getClientAuthHeaders } from '@/lib/client-utils';

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

  const fetchCategories = useCallback(async () => {
    setLoading(true);
    try {
      const headers = await getClientAuthHeaders();
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

  const handleCreate = async () => {
    if (!newCatName.trim()) return;
    try {
      const headers = await getClientAuthHeaders();
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
      const headers = await getClientAuthHeaders();
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
    if (!confirm(`确定删除分类"${cat.name}"吗？`)) return;
    try {
      const headers = await getClientAuthHeaders();
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
      const headers = await getClientAuthHeaders();
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

  const typeCategories = categories.filter(c => c.type === activeType);
  const pendingForType = pendingCategories.filter(c => c.type === activeType);

  return (
    <div className="p-6 space-y-6">
      <div>
        <h1 className="text-2xl font-bold">资料分类管理</h1>
        <p className="text-gray-500 mt-1">管理各子库的分类，审核用户提交的分类申请</p>
      </div>

      {/* 子库切换 */}
      <div className="flex gap-2 border-b pb-3">
        {TYPES.map(t => (
          <button
            key={t}
            onClick={() => setActiveType(t)}
            className={`px-4 py-2 rounded-t text-sm font-medium transition-colors ${
              activeType === t
                ? 'bg-blue-50 text-blue-600 border-b-2 border-blue-600'
                : 'text-gray-600 hover:bg-gray-50'
            }`}
          >
            {TYPE_LABELS[t]}
          </button>
        ))}
      </div>

      {/* 待审核提示 */}
      {pendingForType.length > 0 && (
        <div className="bg-amber-50 border border-amber-200 rounded-lg p-4">
          <h3 className="font-medium text-amber-800 mb-2">待审核分类 ({pendingForType.length})</h3>
          <div className="space-y-2">
            {pendingForType.map(cat => (
              <div key={cat.id} className="flex items-center justify-between bg-white rounded p-2">
                <div>
                  <span className="font-medium">{cat.name}</span>
                  <span className="text-xs text-gray-400 ml-2">{cat.created_at?.substring(0, 10)}</span>
                </div>
                <div className="flex gap-2">
                  <button onClick={() => handleAudit(cat.id, 'approve')} className="px-3 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600">通过</button>
                  <button onClick={() => handleAudit(cat.id, 'reject')} className="px-3 py-1 bg-red-500 text-white rounded text-xs hover:bg-red-600">拒绝</button>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* 操作栏 */}
      <div className="flex items-center justify-between">
        <span className="text-sm text-gray-500">{typeCategories.length} 个分类</span>
        <button
          onClick={() => setShowNewForm(!showNewForm)}
          className="px-3 py-1.5 bg-blue-500 text-white rounded text-sm hover:bg-blue-600"
        >
          {showNewForm ? '取消' : '+ 新增分类'}
        </button>
      </div>

      {/* 新增表单 */}
      {showNewForm && (
        <div className="bg-gray-50 rounded-lg p-4 flex items-center gap-3">
          <input
            type="text"
            value={newCatName}
            onChange={e => setNewCatName(e.target.value)}
            placeholder="输入分类名称"
            className="flex-1 border rounded px-3 py-2 text-sm"
            onKeyDown={e => e.key === 'Enter' && handleCreate()}
          />
          <button onClick={handleCreate} className="px-4 py-2 bg-blue-500 text-white rounded text-sm hover:bg-blue-600">确认添加</button>
        </div>
      )}

      {/* 分类列表 */}
      {loading ? (
        <div className="text-center py-8 text-gray-400">加载中...</div>
      ) : (
        <div className="bg-white border rounded-lg overflow-hidden">
          <table className="w-full text-sm">
            <thead className="bg-gray-50">
              <tr>
                <th className="text-left px-4 py-3 font-medium text-gray-600">名称</th>
                <th className="text-left px-4 py-3 font-medium text-gray-600">metadata_key</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">排序</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">状态</th>
                <th className="text-center px-4 py-3 font-medium text-gray-600">默认</th>
                <th className="text-right px-4 py-3 font-medium text-gray-600">操作</th>
              </tr>
            </thead>
            <tbody className="divide-y">
              {typeCategories.map(cat => (
                <tr key={cat.id} className="hover:bg-gray-50">
                  <td className="px-4 py-3">
                    {editingId === cat.id ? (
                      <input
                        type="text"
                        value={editName}
                        onChange={e => setEditName(e.target.value)}
                        className="border rounded px-2 py-1 text-sm w-40"
                        onKeyDown={e => { if (e.key === 'Enter') handleUpdate(cat.id); if (e.key === 'Escape') setEditingId(null); }}
                        autoFocus
                      />
                    ) : (
                      <span className="font-medium">{cat.name}</span>
                    )}
                    {cat.name_en && <span className="text-xs text-gray-400 ml-2">{cat.name_en}</span>}
                  </td>
                  <td className="px-4 py-3 text-xs text-gray-500">{cat.metadata_key}</td>
                  <td className="px-4 py-3 text-center text-gray-500">{cat.sort_order}</td>
                  <td className="px-4 py-3 text-center">
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ${cat.is_active ? 'bg-green-100 text-green-700' : 'bg-gray-100 text-gray-500'}`}>
                      {cat.is_active ? '启用' : '禁用'}
                    </span>
                    <span className={`inline-block px-2 py-0.5 rounded text-xs ml-1 ${cat.status === 'approved' ? 'bg-blue-100 text-blue-700' : cat.status === 'rejected' ? 'bg-red-100 text-red-700' : 'bg-amber-100 text-amber-700'}`}>
                      {cat.status}
                    </span>
                  </td>
                  <td className="px-4 py-3 text-center">
                    {cat.is_default && <span className="text-xs text-gray-400">系统</span>}
                  </td>
                  <td className="px-4 py-3 text-right">
                    <div className="flex items-center justify-end gap-1">
                      {editingId === cat.id ? (
                        <>
                          <button onClick={() => handleUpdate(cat.id)} className="px-2 py-1 text-xs text-green-600 hover:bg-green-50 rounded">保存</button>
                          <button onClick={() => setEditingId(null)} className="px-2 py-1 text-xs text-gray-500 hover:bg-gray-50 rounded">取消</button>
                        </>
                      ) : (
                        <>
                          <button onClick={() => { setEditingId(cat.id); setEditName(cat.name); }} className="px-2 py-1 text-xs text-blue-600 hover:bg-blue-50 rounded">编辑</button>
                          <button onClick={() => handleDelete(cat)} className="px-2 py-1 text-xs text-red-600 hover:bg-red-50 rounded" disabled={cat.is_default}>删除</button>
                        </>
                      )}
                    </div>
                  </td>
                </tr>
              ))}
              {typeCategories.length === 0 && (
                <tr><td colSpan={6} className="px-4 py-8 text-center text-gray-400">暂无分类</td></tr>
              )}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
