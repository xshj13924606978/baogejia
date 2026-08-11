'use client';

import React, { useState, useEffect, useCallback } from 'react';
import { useRouter } from 'next/navigation';
import { ArrowLeft, Tag, Plus, Trash2, RefreshCw, Clock, AlertCircle } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';

interface CollectionCategory {
  id: string;
  name: string;
  keywords: string[];
  enabled: boolean;
  created_at: string;
}

interface CollectionLog {
  id: string;
  executed_at: string;
  total_collected: number;
  new_products: number;
  updated_products: number;
  status: string;
  error_message?: string;
  duration_ms: number;
}

export default function CategoriesPage() {
  const router = useRouter();
  const [categories, setCategories] = useState<CollectionCategory[]>([]);
  const [logs, setLogs] = useState<CollectionLog[]>([]);
  const [loading, setLoading] = useState(true);
  const [collecting, setCollecting] = useState(false);
  const [newName, setNewName] = useState('');
  const [newKeywords, setNewKeywords] = useState('');
  const [showAdd, setShowAdd] = useState(false);

  const fetchCategories = useCallback(async () => {
    try {
      const res = await fetch('/api/categories');
      if (res.ok) {
        const json = await res.json();
        setCategories(json.data || []);
      }
    } catch (err) {
      console.error('[Categories] 获取类别失败:', err);
    }
  }, []);

  const fetchLogs = useCallback(async () => {
    try {
      const res = await fetch('/api/collection/history?limit=5');
      if (res.ok) {
        const json = await res.json();
        setLogs(json.data || []);
      }
    } catch (err) {
      console.error('[Categories] 获取日志失败:', err);
    }
  }, []);

  useEffect(() => {
    Promise.all([fetchCategories(), fetchLogs()]).finally(() => setLoading(false));
  }, [fetchCategories, fetchLogs]);

  const handleAdd = async () => {
    if (!newName.trim() || !newKeywords.trim()) return;

    try {
      const keywords = newKeywords.split(',').map((k) => k.trim()).filter(Boolean);
      const res = await fetch('/api/categories', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: newName.trim(), keywords }),
      });

      if (res.ok) {
        setNewName('');
        setNewKeywords('');
        setShowAdd(false);
        await fetchCategories();
      } else {
        const json = await res.json();
        alert(json.error || '添加失败');
      }
    } catch (err) {
      console.error('[Categories] 添加失败:', err);
      alert('添加失败，请重试');
    }
  };

  const handleDelete = async (id: string) => {
    if (!confirm('确定要删除此类别吗？')) return;

    try {
      const res = await fetch(`/api/categories?id=${id}`, { method: 'DELETE' });
      if (res.ok) {
        await fetchCategories();
      } else {
        alert('删除失败');
      }
    } catch (err) {
      console.error('[Categories] 删除失败:', err);
    }
  };

  const handleToggleEnabled = async (category: CollectionCategory) => {
    try {
      const res = await fetch('/api/categories', {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ id: category.id, enabled: !category.enabled }),
      });

      if (res.ok) {
        await fetchCategories();
      }
    } catch (err) {
      console.error('[Categories] 更新失败:', err);
    }
  };

  const handleManualCollect = async () => {
    setCollecting(true);
    try {
      const res = await fetch('/api/collection/manual', { method: 'POST' });
      const json = await res.json();

      if (json.success) {
        alert(`采集完成！新增 ${json.data.newProducts} 条，更新 ${json.data.updatedProducts} 条`);
      } else {
        alert(`采集失败: ${json.data?.error || '未知错误'}`);
      }

      await fetchLogs();
    } catch (err) {
      console.error('[Categories] 手动采集失败:', err);
      alert('采集请求失败，请检查网络连接');
    } finally {
      setCollecting(false);
    }
  };

  const formatTime = (timeStr: string) => {
    const d = new Date(timeStr);
    return d.toLocaleString('zh-CN', {
      month: '2-digit',
      day: '2-digit',
      hour: '2-digit',
      minute: '2-digit',
    });
  };

  if (loading) {
    return (
      <div className="min-h-screen bg-gray-50 flex items-center justify-center">
        <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-blue-500"></div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-gray-50">
      {/* 顶部导航 */}
      <div className="sticky top-0 z-10 bg-white border-b border-gray-200 px-6 py-3 flex items-center gap-4">
        <Button variant="ghost" size="sm" onClick={() => router.push('/')}>
          <ArrowLeft className="h-4 w-4 mr-1" />
          返回对话
        </Button>
        <div className="flex items-center gap-2">
          <Tag className="h-5 w-5 text-blue-500" />
          <h1 className="text-lg font-semibold">产品采集类别管理</h1>
        </div>
      </div>

      <div className="max-w-4xl mx-auto px-4 py-6 space-y-6">
        {/* 操作栏 */}
        <div className="bg-white rounded-xl border border-gray-200 p-4 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <Button onClick={() => setShowAdd(!showAdd)} size="sm">
              <Plus className="h-4 w-4 mr-1" />
              新增类别
            </Button>
            <Button
              variant="outline"
              size="sm"
              onClick={handleManualCollect}
              disabled={collecting}
            >
              <RefreshCw className={`h-4 w-4 mr-1 ${collecting ? 'animate-spin' : ''}`} />
              {collecting ? '采集中...' : '手动采集'}
            </Button>
          </div>
          {logs.length > 0 && logs[0].status === 'success' && (
            <div className="flex items-center gap-4 text-sm text-gray-500">
              <span className="flex items-center gap-1">
                <Clock className="h-3.5 w-3.5" />
                上次采集: {formatTime(logs[0].executed_at)}
              </span>
              <span className="text-green-600">+{logs[0].new_products} 新增</span>
              <span className="text-blue-600">{logs[0].updated_products} 更新</span>
            </div>
          )}
          {logs.length > 0 && logs[0].status === 'failed' && (
            <div className="flex items-center gap-1 text-sm text-red-500">
              <AlertCircle className="h-3.5 w-3.5" />
              上次采集失败: {logs[0].error_message || '未知错误'}
            </div>
          )}
        </div>

        {/* 新增类别表单 */}
        {showAdd && (
          <div className="bg-white rounded-xl border border-blue-200 p-4 space-y-3">
            <h3 className="text-sm font-semibold text-gray-700">新增采集类别</h3>
            <div className="flex gap-3">
              <Input
                placeholder="类别名称（如：五金）"
                value={newName}
                onChange={(e) => setNewName(e.target.value)}
                className="w-48"
              />
              <Input
                placeholder="搜索关键词，用逗号分隔"
                value={newKeywords}
                onChange={(e) => setNewKeywords(e.target.value)}
                className="flex-1"
              />
              <Button onClick={handleAdd} size="sm">
                添加
              </Button>
              <Button variant="ghost" size="sm" onClick={() => setShowAdd(false)}>
                取消
              </Button>
            </div>
          </div>
        )}

        {/* 类别列表 */}
        <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
          {categories.length === 0 ? (
            <div className="p-12 text-center text-gray-400">
              <Tag className="h-8 w-8 mx-auto mb-2 opacity-50" />
              <p>暂无采集类别，请点击"新增类别"开始配置</p>
            </div>
          ) : (
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500 bg-gray-50/50">
                  <th className="px-4 py-3 font-medium">类别名称</th>
                  <th className="px-4 py-3 font-medium">关键词</th>
                  <th className="px-4 py-3 font-medium">状态</th>
                  <th className="px-4 py-3 font-medium w-24">操作</th>
                </tr>
              </thead>
              <tbody>
                {categories.map((cat) => (
                  <tr key={cat.id} className="border-b border-gray-50 hover:bg-gray-50/50 text-sm">
                    <td className="px-4 py-3 font-medium text-gray-800">{cat.name}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-1">
                        {cat.keywords.map((kw, i) => (
                          <Badge key={i} variant="secondary" className="text-xs">
                            {kw}
                          </Badge>
                        ))}
                      </div>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleToggleEnabled(cat)}
                        className={`text-xs px-2 py-0.5 rounded-full transition-colors ${
                          cat.enabled
                            ? 'bg-green-100 text-green-700 hover:bg-green-200'
                            : 'bg-gray-100 text-gray-400 hover:bg-gray-200'
                        }`}
                      >
                        {cat.enabled ? '● 启用' : '○ 禁用'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        onClick={() => handleDelete(cat.id)}
                        className="p-1 hover:bg-red-50 rounded text-red-400 hover:text-red-600"
                        title="删除"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>

        {/* 采集历史 */}
        {logs.length > 0 && (
          <div className="bg-white rounded-xl border border-gray-200 overflow-hidden">
            <div className="px-4 py-3 border-b border-gray-100 flex items-center gap-2">
              <Clock className="h-4 w-4 text-gray-400" />
              <h3 className="text-sm font-semibold text-gray-700">采集历史</h3>
            </div>
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 text-left text-xs text-gray-500 bg-gray-50/50">
                  <th className="px-4 py-2 font-medium">执行时间</th>
                  <th className="px-4 py-2 font-medium">采集总数</th>
                  <th className="px-4 py-2 font-medium">新增</th>
                  <th className="px-4 py-2 font-medium">更新</th>
                  <th className="px-4 py-2 font-medium">状态</th>
                  <th className="px-4 py-2 font-medium">耗时</th>
                </tr>
              </thead>
              <tbody>
                {logs.map((log) => (
                  <tr key={log.id} className="border-b border-gray-50">
                    <td className="px-4 py-2 text-gray-600">{formatTime(log.executed_at)}</td>
                    <td className="px-4 py-2">{log.total_collected}</td>
                    <td className="px-4 py-2 text-green-600">{log.new_products}</td>
                    <td className="px-4 py-2 text-blue-600">{log.updated_products}</td>
                    <td className="px-4 py-2">
                      <span
                        className={`text-xs px-2 py-0.5 rounded-full ${
                          log.status === 'success'
                            ? 'bg-green-100 text-green-700'
                            : 'bg-red-100 text-red-700'
                        }`}
                      >
                        {log.status === 'success' ? '成功' : '失败'}
                      </span>
                    </td>
                    <td className="px-4 py-2 text-gray-400">{log.duration_ms}ms</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
