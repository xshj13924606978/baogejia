'use client';

import { confirmDialog } from '@/components/ui/confirm-dialog';
import { useState, useEffect } from 'react';
import { useKnowledgeList } from '@/hooks/useKnowledgeList';
import { Button } from '@/components/ui/button';
import { RefreshCw } from 'lucide-react';
import { KnowledgeListSkeleton } from './skeleton';
import { toast } from 'sonner';
import { getClientAuthHeaders } from '@/lib/client-utils';
import { useUser } from '@/contexts/UserContext';
import type { KnowledgeEntry } from '@/types/knowledge';
import { useKnowledgeHighlight } from '@/hooks/useKnowledgeHighlight';

const STATUS_CONFIG: Record<string, { label: string; color: string }> = {
  pending: { label: '待审核', color: 'bg-yellow-100 text-yellow-700' },
  approved: { label: '已通过', color: 'bg-green-100 text-green-700' },
  rejected: { label: '已拒绝', color: 'bg-red-100 text-red-700' },
};

const TYPE_LABELS: Record<string, string> = {
  document: '技术文档',
  case: '案例',
  standard: '标准规范',
  drawing: '图纸图片',
  quota: '定额',
  price: '产品价格',
  other: '其他',
};

interface MyUploadsProps {
  /** 空状态时跳转到资料库 tab 上传（可选） */
  onJump?: (type: string) => void;
  /** 需要高亮定位的目标文件 id */
  highlightId?: string;
}

export default function MyUploads({ onJump, highlightId }: MyUploadsProps) {
  const highlight = useKnowledgeHighlight(highlightId);
  const [statusFilter, setStatusFilter] = useState('all');
  const [searchTerm, setSearchTerm] = useState('');
  const [isLoggedIn, setIsLoggedIn] = useState<boolean | null>(null);
  // 编辑弹窗状态
  const [editTarget, setEditTarget] = useState<KnowledgeEntry | null>(null);
  const [editTitle, setEditTitle] = useState('');
  const [editDescription, setEditDescription] = useState('');
  const [saving, setSaving] = useState(false);
  const { user } = useUser();
  const isAdmin = !!user && (user.role === 'super_admin' || user.role === 'admin');

  const { items, loading, total, page, setPage, totalPages, authenticated, refresh } = useKnowledgeList('', {
    scope: 'mine',
    keyword: searchTerm || undefined,
  });

  // 使用 API 返回的 authenticated 字段判断登录状态（而非数据量推断）
  useEffect(() => {
    if (!loading) {
      setIsLoggedIn(authenticated);
    }
  }, [loading, authenticated]);

  // 客户端状态过滤
  const filteredItems = items.filter((item) => {
    if (statusFilter === 'all') return true;
    return item.status === statusFilter;
  });

  // 编辑（仅本人，编辑后重新进入待审核状态）
  const openEditDialog = (item: KnowledgeEntry) => {
    setEditTarget(item);
    setEditTitle(item.title || '');
    setEditDescription(item.description || '');
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    if (!editTitle.trim()) {
      toast.error('标题不能为空');
      return;
    }
    setSaving(true);
    try {
      const res = await fetch(`/api/knowledge/${editTarget.id}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json', ...getClientAuthHeaders() },
        body: JSON.stringify({ title: editTitle.trim(), description: editDescription }),
      });
      const data = await res.json();
      if (data.success) {
        toast.success(data.message || '已保存');
        setEditTarget(null);
        refresh();
      } else {
        toast.error(data.error || '保存失败');
      }
    } catch {
      toast.error('网络错误');
    } finally {
      setSaving(false);
    }
  };

  // 删除（仅管理员）
  const handleDelete = async (item: KnowledgeEntry) => {
    if (!await confirmDialog({ title: `确定删除「${item.title}」？删除后不可恢复。`, destructive: true })) return;
    try {
      const res = await fetch(`/api/knowledge/${item.id}`, {
        method: 'DELETE',
        headers: { ...getClientAuthHeaders() },
      });
      const data = await res.json();
      if (data.success) {
        toast.success('已删除');
        refresh();
      } else {
        toast.error(data.error || '删除失败');
      }
    } catch {
      toast.error('网络错误');
    }
  };

  return (
    <div>
      {/* 工具栏 */}
      <div className="flex justify-between items-center mb-4">
        <h3 className="text-lg font-bold flex items-center gap-2">
          <span>📁</span> 我的上传
          {isLoggedIn !== false && <span className="text-sm font-normal text-gray-500 ml-2">{total}个文件</span>}
        </h3>
        <Button size="sm" variant="outline" onClick={() => refresh()} disabled={loading}>
          <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          刷新
        </Button>
      </div>

      {/* 未登录提示 */}
      {isLoggedIn === false && !loading && (
        <div className="text-center py-12 text-gray-500">
          <div className="text-5xl mb-3">🔒</div>
          <div className="font-medium">请先登录</div>
          <p className="text-sm text-gray-400 mt-1">登录后可查看自己的上传记录和审核进度</p>
        </div>
      )}

      {/* 已登录内容 */}
      {isLoggedIn !== false && (
        <>
          {/* 状态筛选标签 */}
          <div className="flex gap-2 mb-4">
            {[
              { key: 'all', label: '全部' },
              { key: 'pending', label: '待审核' },
              { key: 'approved', label: '已通过' },
              { key: 'rejected', label: '已拒绝' },
            ].map((s) => (
              <button
                key={s.key}
                onClick={() => setStatusFilter(s.key)}
                className={`px-3 py-1 rounded-full text-sm whitespace-nowrap ${
                  statusFilter === s.key ? 'bg-blue-500 text-white' : 'bg-gray-100 hover:bg-gray-200'
                }`}
              >
                {s.label}
              </button>
            ))}
          </div>

          {/* 搜索栏 */}
          <div className="flex gap-2 mb-4">
            <input
              type="text"
              placeholder="搜索文件名称..."
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="flex-1 p-2 border rounded"
            />
            {searchTerm && (
              <Button size="sm" variant="ghost" onClick={() => setSearchTerm('')}>清除</Button>
            )}
          </div>

          {/* 骨架屏 */}
          {loading && <KnowledgeListSkeleton variant="wide" count={3} />}

          {/* 文件列表 */}
          {!loading && filteredItems.length > 0 && (
            <div className="space-y-3">
              {filteredItems.map((item) => {
                const statusCfg = STATUS_CONFIG[item.status] || STATUS_CONFIG.pending;
                return (
                  <div
                    key={item.id}
                    className={`border rounded-lg p-4 hover:shadow-sm transition-shadow ${highlight(item.id).active ? 'ring-2 ring-blue-500 bg-blue-50 dark:bg-blue-900/30 border-blue-500' : ''}`}
                    {...highlight(item.id).attrs}
                  >
                    <div className="flex justify-between items-start">
                      <div className="flex-1 min-w-0">
                        <div className="flex items-center gap-2 mb-1">
                          <span className="font-medium truncate">{item.title}</span>
                          <span className={`inline-block px-2 py-0.5 rounded text-xs whitespace-nowrap ${statusCfg.color}`}>
                            {statusCfg.label}
                          </span>
                          <span className="text-xs text-gray-400">
                            {TYPE_LABELS[item.type] || item.type}
                          </span>
                          {item.uploader_name && item.uploader_name !== '未知' && (
                            <span className="text-xs text-gray-400">· {item.uploader_name}</span>
                          )}
                        </div>
                        {item.file_name && (
                          <div className="text-xs text-gray-500">{item.file_name}</div>
                        )}
                        {item.status === 'rejected' && item.reject_reason && (
                          <div className="mt-2 p-2 bg-red-50 border border-red-100 rounded">
                            <div className="text-xs font-medium text-red-600">拒绝原因：</div>
                            <div className="text-xs text-red-500 mt-1">{item.reject_reason}</div>
                          </div>
                        )}
                        {/* 审核信息 */}
                        {item.status === 'approved' && item.reviewed_at && (
                          <div className="text-xs text-green-600 mt-1">
                            审核通过 · {item.reviewed_at?.split('T')[0]}
                          </div>
                        )}
                        {item.status === 'rejected' && item.reviewed_at && (
                          <div className="text-xs text-gray-400 mt-1">
                            审核时间：{item.reviewed_at?.split('T')[0]}
                          </div>
                        )}
                      </div>
                      <div className="flex items-center gap-3 ml-4 shrink-0">
                        {/* 编辑：本人可编辑（编辑后需重新审核） */}
                        <button
                          onClick={() => openEditDialog(item)}
                          className="text-xs text-blue-600 hover:text-blue-800"
                        >
                          编辑
                        </button>
                        {/* 删除：仅管理员 */}
                        {isAdmin && (
                          <button
                            onClick={() => handleDelete(item)}
                            className="text-xs text-red-600 hover:text-red-800"
                          >
                            删除
                          </button>
                        )}
                        <div className="text-xs text-gray-400 whitespace-nowrap">
                          {item.created_at?.split('T')[0]}
                        </div>
                      </div>
                    </div>
                  </div>
                );
              })}
            </div>
          )}

          {/* 分页 */}
          {!loading && totalPages > 1 && (
            <div className="flex items-center justify-between mt-4">
              <span className="text-sm text-gray-500">第 {page}/{totalPages} 页</span>
              <div className="flex gap-2">
                <Button variant="outline" size="sm" disabled={page <= 1} onClick={() => setPage(page - 1)}>上一页</Button>
                <Button variant="outline" size="sm" disabled={page >= totalPages} onClick={() => setPage(page + 1)}>下一页</Button>
              </div>
            </div>
          )}

          {/* 空状态 */}
          {!loading && filteredItems.length === 0 && (
            <div className="text-center py-12 text-gray-500">
              <div className="text-5xl mb-3">📁</div>
              <div>{searchTerm || statusFilter !== 'all' ? '没有匹配的上传记录' : '暂无上传记录'}</div>
              <p className="text-sm mt-2 text-gray-400">
                上传的文件会在这里显示，包括审核状态
              </p>
              {!searchTerm && statusFilter === 'all' && (
                <Button size="sm" className="mt-3" onClick={() => onJump?.('document')}>
                  <span>📤</span> 去上传资料
                </Button>
              )}
            </div>
          )}
        </>
      )}

      {/* 编辑弹窗 */}
      {editTarget && (
        <div className="fixed inset-0 z-[100] flex items-center justify-center bg-black/40 p-4" onClick={() => setEditTarget(null)}>
          <div
            className="bg-white dark:bg-gray-900 rounded-lg w-full max-w-md p-5 shadow-xl"
            onClick={(e) => e.stopPropagation()}
          >
            <h3 className="text-lg font-bold mb-4">编辑资料</h3>
            <div className="space-y-4">
              <div>
                <label className="text-sm font-medium mb-1 block">标题</label>
                <input
                  type="text"
                  value={editTitle}
                  onChange={(e) => setEditTitle(e.target.value)}
                  className="w-full p-2 border rounded"
                  placeholder="请输入标题"
                />
              </div>
              <div>
                <label className="text-sm font-medium mb-1 block">描述</label>
                <textarea
                  value={editDescription}
                  onChange={(e) => setEditDescription(e.target.value)}
                  className="w-full p-2 border rounded min-h-[80px]"
                  placeholder="请输入描述（可选）"
                />
              </div>
              <p className="text-xs text-yellow-600">
                保存后将重新进入审核状态，需管理员审核通过后才能被他人查看/下载。
              </p>
            </div>
            <div className="flex justify-end gap-2 mt-5">
              <Button variant="outline" size="sm" onClick={() => setEditTarget(null)}>取消</Button>
              <Button size="sm" disabled={saving} onClick={handleSaveEdit}>
                {saving ? '保存中...' : '保存'}
              </Button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
