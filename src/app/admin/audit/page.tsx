'use client';

import { useState, useEffect } from 'react';

export default function AuditManagement() {
  const [auditItems, setAuditItems] = useState<any[]>([]);
  const [filter, setFilter] = useState('pending');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadAuditItems();
  }, []);

  const loadAuditItems = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/admin/audit?status=${filter}`);
      const data = await res.json();
      setAuditItems(data);
    } catch (error) {
      console.error('加载审核列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleApprove = async (itemId: number, points: number = 0) => {
    if (!confirm('确定要通过审核吗？')) return;
    
    try {
      await fetch(`/api/admin/audit/${itemId}/approve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points })
      });
      loadAuditItems();
    } catch (error) {
      console.error('审核通过失败:', error);
      alert('操作失败，请重试');
    }
  };

  const handleReject = async (itemId: number, reason: string) => {
    if (!confirm('确定要拒绝审核吗？')) return;
    
    try {
      await fetch(`/api/admin/audit/${itemId}/reject`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ reason })
      });
      loadAuditItems();
    } catch (error) {
      console.error('审核拒绝失败:', error);
      alert('操作失败，请重试');
    }
  };

  const handleApproveWithPoints = async (itemId: number) => {
    const pointsStr = prompt('请输入奖励积分（0为不奖励）：');
    if (pointsStr === null) return;
    
    const points = parseInt(pointsStr);
    if (isNaN(points)) {
      alert('请输入有效的积分值');
      return;
    }
    
    await handleApprove(itemId, points);
  };

  const handleRejectWithReason = async (itemId: number) => {
    const reason = prompt('请输入拒绝原因：');
    if (!reason) {
      alert('请输入拒绝原因');
      return;
    }
    
    await handleReject(itemId, reason);
  };

  const filteredItems = auditItems.filter(item => {
    if (filter === 'all') return true;
    return item.status === filter;
  });

  const stats = {
    pending: auditItems.filter(i => i.status === 'pending').length,
    approved: auditItems.filter(i => i.status === 'approved').length,
    rejected: auditItems.filter(i => i.status === 'rejected').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">内容审核</h1>
        <button 
          onClick={loadAuditItems}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          刷新列表
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="flex gap-2">
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-40 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="pending">待审核</option>
          <option value="approved">已通过</option>
          <option value="rejected">已拒绝</option>
          <option value="all">全部</option>
        </select>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-3 gap-4 text-sm">
        <div className="bg-yellow-50 p-3 rounded-lg text-center">
          <div className="text-lg font-bold text-yellow-700">{stats.pending}</div>
          <div className="text-yellow-600">待审核</div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg text-center">
          <div className="text-lg font-bold text-green-700">{stats.approved}</div>
          <div className="text-green-600">已通过</div>
        </div>
        <div className="bg-red-50 p-3 rounded-lg text-center">
          <div className="text-lg font-bold text-red-700">{stats.rejected}</div>
          <div className="text-red-600">已拒绝</div>
        </div>
      </div>

      {/* 审核列表 */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">加载中...</div>
        ) : filteredItems.length === 0 ? (
          <div className="p-8 text-center text-gray-500">暂无数据</div>
        ) : (
          <div className="divide-y">
            {filteredItems.map(item => (
              <div key={item.id} className="p-4 hover:bg-gray-50 transition-colors">
                <div className="flex justify-between items-start mb-2">
                  <div>
                    <div className="font-medium text-gray-900">
                      {item.type === 'product' && '产品上传'}
                      {item.type === 'document' && '文档上传'}
                      {item.type === 'case' && '案例上传'}
                      {item.type === 'other' && '其他内容'}
                    </div>
                    <div className="text-sm text-gray-500 mt-1">
                      提交人：{item.submitter_name} | 时间：{new Date(item.created_at).toLocaleString('zh-CN')}
                    </div>
                  </div>
                  <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                    item.status === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                    item.status === 'approved' ? 'bg-green-100 text-green-700' :
                    'bg-red-100 text-red-700'
                  }`}>
                    {item.status === 'pending' ? '待审核' : item.status === 'approved' ? '已通过' : '已拒绝'}
                  </span>
                </div>
                
                <div className="bg-gray-50 p-3 rounded text-sm text-gray-700 mb-3">
                  <div className="font-medium mb-1">{item.title}</div>
                  <div className="text-gray-600">{item.description}</div>
                </div>

                {item.status === 'pending' && (
                  <div className="flex gap-2">
                    <button
                      onClick={() => handleApprove(item.id)}
                      className="px-3 py-1 bg-green-500 text-white rounded text-sm hover:bg-green-600 transition-colors"
                    >
                      通过
                    </button>
                    <button
                      onClick={() => handleApproveWithPoints(item.id)}
                      className="px-3 py-1 bg-blue-500 text-white rounded text-sm hover:bg-blue-600 transition-colors"
                    >
                      通过并奖励
                    </button>
                    <button
                      onClick={() => handleRejectWithReason(item.id)}
                      className="px-3 py-1 bg-red-500 text-white rounded text-sm hover:bg-red-600 transition-colors"
                    >
                      拒绝
                    </button>
                  </div>
                )}

                {item.status === 'approved' && item.points && (
                  <div className="text-sm text-green-600">
                    奖励积分：{item.points}
                  </div>
                )}

                {item.status === 'rejected' && item.reason && (
                  <div className="text-sm text-red-600">
                    拒绝原因：{item.reason}
                  </div>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
