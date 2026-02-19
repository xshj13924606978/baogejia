'use client';

import { useState, useEffect } from 'react';

export default function UserManagement() {
  const [users, setUsers] = useState<any[]>([]);
  const [search, setSearch] = useState('');
  const [filter, setFilter] = useState('all');
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    loadUsers();
  }, []);

  const loadUsers = async () => {
    try {
      setLoading(true);
      const res = await fetch('/api/admin/users');
      const data = await res.json();
      setUsers(data);
    } catch (error) {
      console.error('加载用户列表失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handleDisable = async (userId: number) => {
    if (!confirm('确定要禁用该用户吗？')) return;
    
    try {
      await fetch(`/api/admin/users/${userId}/disable`, { method: 'POST' });
      loadUsers();
    } catch (error) {
      console.error('禁用用户失败:', error);
      alert('操作失败，请重试');
    }
  };

  const handleAddPoints = async (userId: number) => {
    const points = prompt('输入要增加的积分（正数为增加，负数为减少）：');
    if (!points) return;

    try {
      await fetch(`/api/admin/users/${userId}/points`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ points: parseInt(points) })
      });
      loadUsers();
    } catch (error) {
      console.error('分配积分失败:', error);
      alert('操作失败，请重试');
    }
  };

  const handleSetRole = async (userId: number) => {
    const roles = ['user', 'vip', 'manufacturer', 'super_admin'];
    const newRole = prompt(`请选择角色（${roles.join('/')}）：`);
    if (!newRole || !roles.includes(newRole)) {
      alert('无效的角色');
      return;
    }

    try {
      await fetch(`/api/admin/users/${userId}/role`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ role: newRole })
      });
      loadUsers();
    } catch (error) {
      console.error('设置角色失败:', error);
      alert('操作失败，请重试');
    }
  };

  const filteredUsers = users.filter(user => {
    const matchesSearch = search === '' || 
      user.username?.toLowerCase().includes(search.toLowerCase()) || 
      user.email?.toLowerCase().includes(search.toLowerCase());
    
    const matchesFilter = filter === 'all' || user.role === filter || 
      (filter === 'pending' && user.role === 'pending');
    
    return matchesSearch && matchesFilter;
  });

  const stats = {
    total: users.length,
    vip: users.filter(u => u.role === 'vip').length,
    manufacturer: users.filter(u => u.role === 'manufacturer').length,
    pending: users.filter(u => u.role === 'pending').length,
    disabled: users.filter(u => u.status === 'disabled').length,
  };

  return (
    <div className="space-y-4">
      <div className="flex justify-between items-center">
        <h1 className="text-2xl font-bold">用户管理</h1>
        <button 
          onClick={loadUsers}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
        >
          刷新列表
        </button>
      </div>

      {/* 筛选栏 */}
      <div className="flex gap-2">
        <input
          type="text"
          placeholder="搜索用户名/邮箱"
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="flex-1 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        />
        <select
          value={filter}
          onChange={(e) => setFilter(e.target.value)}
          className="w-40 p-2 border rounded-lg focus:outline-none focus:ring-2 focus:ring-blue-500"
        >
          <option value="all">全部用户</option>
          <option value="super_admin">管理员</option>
          <option value="vip">高级用户</option>
          <option value="manufacturer">厂家</option>
          <option value="user">普通用户</option>
          <option value="pending">待审核</option>
        </select>
      </div>

      {/* 统计卡片 */}
      <div className="grid grid-cols-5 gap-2 text-sm">
        <div className="bg-blue-50 p-3 rounded-lg text-center">
          <div className="text-lg font-bold text-blue-700">{stats.total}</div>
          <div className="text-blue-600">总数</div>
        </div>
        <div className="bg-purple-50 p-3 rounded-lg text-center">
          <div className="text-lg font-bold text-purple-700">{stats.vip}</div>
          <div className="text-purple-600">高级</div>
        </div>
        <div className="bg-green-50 p-3 rounded-lg text-center">
          <div className="text-lg font-bold text-green-700">{stats.manufacturer}</div>
          <div className="text-green-600">厂家</div>
        </div>
        <div className="bg-yellow-50 p-3 rounded-lg text-center">
          <div className="text-lg font-bold text-yellow-700">{stats.pending}</div>
          <div className="text-yellow-600">待审</div>
        </div>
        <div className="bg-red-50 p-3 rounded-lg text-center">
          <div className="text-lg font-bold text-red-700">{stats.disabled}</div>
          <div className="text-red-600">禁用</div>
        </div>
      </div>

      {/* 用户列表 */}
      <div className="bg-white rounded-lg shadow-sm overflow-hidden">
        {loading ? (
          <div className="p-8 text-center text-gray-500">加载中...</div>
        ) : filteredUsers.length === 0 ? (
          <div className="p-8 text-center text-gray-500">暂无数据</div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead className="bg-gray-50 border-b">
                <tr>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">ID</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">用户名</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">邮箱</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">角色</th>
                  <th className="px-4 py-3 text-right font-medium text-gray-700">积分</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">状态</th>
                  <th className="px-4 py-3 text-left font-medium text-gray-700">注册时间</th>
                  <th className="px-4 py-3 text-center font-medium text-gray-700">操作</th>
                </tr>
              </thead>
              <tbody>
                {filteredUsers.map(user => (
                  <tr key={user.id} className="border-t hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3 text-gray-900">{user.id}</td>
                    <td className="px-4 py-3 text-gray-900">{user.username}</td>
                    <td className="px-4 py-3 text-gray-600">{user.email}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.role === 'super_admin' ? 'bg-red-100 text-red-700' :
                        user.role === 'vip' ? 'bg-purple-100 text-purple-700' :
                        user.role === 'manufacturer' ? 'bg-green-100 text-green-700' :
                        user.role === 'pending' ? 'bg-yellow-100 text-yellow-700' :
                        'bg-gray-100 text-gray-700'
                      }`}>
                        {user.role}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-right text-gray-900">{user.points || 0}</td>
                    <td className="px-4 py-3">
                      <span className={`px-2 py-1 rounded-full text-xs font-medium ${
                        user.status === 'active' ? 'bg-green-100 text-green-700' : 'bg-red-100 text-red-700'
                      }`}>
                        {user.status || 'active'}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-gray-600 text-xs">
                      {new Date(user.created_at).toLocaleDateString('zh-CN')}
                    </td>
                    <td className="px-4 py-3 text-center">
                      <button 
                        onClick={() => handleSetRole(user.id)}
                        className="text-xs text-purple-600 hover:underline mr-2"
                      >
                        角色
                      </button>
                      <button 
                        onClick={() => handleAddPoints(user.id)}
                        className="text-xs text-green-600 hover:underline mr-2"
                      >
                        积分
                      </button>
                      <button 
                        onClick={() => handleDisable(user.id)}
                        className="text-xs text-red-600 hover:underline"
                      >
                        {user.status === 'active' ? '禁用' : '启用'}
                      </button>
                    </td>
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
