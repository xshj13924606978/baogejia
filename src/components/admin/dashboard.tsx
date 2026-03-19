'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  Users,
  FileText,
  Upload,
  CheckCircle,
  Clock,
  AlertCircle,
  TrendingUp,
  DollarSign,
  Package,
  Activity,
  Loader2,
} from 'lucide-react';

interface DashboardStats {
  totalUsers: number;
  activeUsersToday: number;
  totalQuotes: number;
  totalProducts: number;
}

interface AuditItem {
  id: string;
  type: string;
  user_name: string;
  created_at: string;
  status: string;
}

interface UploadItem {
  id: string;
  title: string;
  user_name: string;
  created_at: string;
  file_size?: number;
}

export default function AdminDashboard() {
  const [loading, setLoading] = useState(true);
  const [stats, setStats] = useState<DashboardStats | null>(null);
  const [auditItems, setAuditItems] = useState<AuditItem[]>([]);
  const [recentUploads, setRecentUploads] = useState<UploadItem[]>([]);
  const [error, setError] = useState<string | null>(null);

  // 加载仪表盘数据
  useEffect(() => {
    loadDashboardData();
  }, []);

  const loadDashboardData = async () => {
    setLoading(true);
    setError(null);

    try {
      // 并行请求所有数据
      const [statsRes, auditRes, uploadsRes] = await Promise.all([
        fetch('/api/admin/stats'),
        fetch('/api/admin/audit?limit=5'),
        fetch('/api/knowledge/upload?limit=5'),
      ]);

      // 处理统计数据
      if (statsRes.ok) {
        const statsData = await statsRes.json();
        setStats(statsData);
      }

      // 处理审核数据
      if (auditRes.ok) {
        const auditData = await auditRes.json();
        setAuditItems(auditData.items || auditData.data || []);
      }

      // 处理上传数据
      if (uploadsRes.ok) {
        const uploadsData = await uploadsRes.json();
        setRecentUploads(uploadsData.items || uploadsData.data || []);
      }
    } catch (err) {
      console.error('加载仪表盘数据失败:', err);
      setError('加载数据失败，请刷新重试');
    } finally {
      setLoading(false);
    }
  };

  // 格式化时间
  const formatTime = (dateStr: string) => {
    const date = new Date(dateStr);
    const now = new Date();
    const diffMs = now.getTime() - date.getTime();
    const diffMins = Math.floor(diffMs / 60000);
    const diffHours = Math.floor(diffMins / 60);
    const diffDays = Math.floor(diffHours / 24);

    if (diffMins < 1) return '刚刚';
    if (diffMins < 60) return `${diffMins}分钟前`;
    if (diffHours < 24) return `${diffHours}小时前`;
    return `${diffDays}天前`;
  };

  // 格式化文件大小
  const formatFileSize = (bytes?: number) => {
    if (!bytes) return '-';
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center h-64">
        <Loader2 className="h-8 w-8 animate-spin text-primary" />
        <span className="ml-2">加载中...</span>
      </div>
    );
  }

  if (error) {
    return (
      <div className="space-y-6">
        <div className="text-center py-8 text-red-500">{error}</div>
        <Button onClick={loadDashboardData}>重试</Button>
      </div>
    );
  }

  // 统计卡片数据
  const statsCards = [
    {
      title: '总用户数',
      value: stats?.totalUsers?.toLocaleString() || '0',
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      title: '今日活跃',
      value: stats?.activeUsersToday?.toLocaleString() || '0',
      icon: Activity,
      color: 'bg-green-500',
    },
    {
      title: '报价单数',
      value: stats?.totalQuotes?.toLocaleString() || '0',
      icon: FileText,
      color: 'bg-purple-500',
    },
    {
      title: '产品数量',
      value: stats?.totalProducts?.toLocaleString() || '0',
      icon: Package,
      color: 'bg-orange-500',
    },
  ];

  return (
    <div className="space-y-6">
      {/* 欢迎区域 */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold">欢迎回来，管理员</h1>
          <p className="text-gray-500">这是您的管理后台仪表盘</p>
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={loadDashboardData}>
            <Clock className="h-4 w-4 mr-2" />
            刷新数据
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {statsCards.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                  </div>
                  <div className={`${stat.color} p-3 rounded-lg`}>
                    <Icon className="h-6 w-6 text-white" />
                  </div>
                </div>
              </CardContent>
            </Card>
          );
        })}
      </div>

      {/* 待审核和最近上传 */}
      <div className="grid gap-6 md:grid-cols-2">
        {/* 待审核内容 */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center justify-between">
              <span>待审核内容</span>
              {auditItems.length > 0 && (
                <Badge variant="destructive">{auditItems.length}项待处理</Badge>
              )}
            </CardTitle>
            <CardDescription>需要您审核的用户上传内容</CardDescription>
          </CardHeader>
          <CardContent>
            {auditItems.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <CheckCircle className="h-12 w-12 mx-auto mb-2 text-green-500" />
                <p>暂无待审核内容</p>
              </div>
            ) : (
              <div className="space-y-4">
                {auditItems.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-start gap-3">
                      <AlertCircle className="h-5 w-5 text-yellow-500 mt-0.5" />
                      <div>
                        <p className="font-medium">{item.type || '用户上传'}</p>
                        <p className="text-sm text-gray-500">
                          上传者：{item.user_name} · {formatTime(item.created_at)}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="outline">
                      审核
                    </Button>
                  </div>
                ))}
                <Button variant="link" className="w-full">
                  查看全部审核项
                </Button>
              </div>
            )}
          </CardContent>
        </Card>

        {/* 最近上传 */}
        <Card>
          <CardHeader>
            <CardTitle>最近上传</CardTitle>
            <CardDescription>用户最新上传的文件</CardDescription>
          </CardHeader>
          <CardContent>
            {recentUploads.length === 0 ? (
              <div className="text-center py-8 text-gray-500">
                <FileText className="h-12 w-12 mx-auto mb-2" />
                <p>暂无上传记录</p>
              </div>
            ) : (
              <div className="space-y-4">
                {recentUploads.map((item) => (
                  <div
                    key={item.id}
                    className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg"
                  >
                    <div className="flex items-start gap-3">
                      <FileText className="h-5 w-5 text-blue-500 mt-0.5" />
                      <div>
                        <p className="font-medium">{item.title || '未命名文件'}</p>
                        <p className="text-sm text-gray-500">
                          {item.user_name} · {formatTime(item.created_at)} · {formatFileSize(item.file_size)}
                        </p>
                      </div>
                    </div>
                    <Button size="sm" variant="ghost">
                      预览
                    </Button>
                  </div>
                ))}
                <Button variant="link" className="w-full">
                  查看全部上传
                </Button>
              </div>
            )}
          </CardContent>
        </Card>
      </div>

      {/* 快速操作 */}
      <Card>
        <CardHeader>
          <CardTitle>快速操作</CardTitle>
          <CardDescription>常用管理功能快捷入口</CardDescription>
        </CardHeader>
        <CardContent>
          <div className="grid gap-4 md:grid-cols-4">
            <Button variant="outline" className="h-20 flex-col gap-2">
              <Users className="h-5 w-5" />
              <span>添加用户</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2">
              <Package className="h-5 w-5" />
              <span>新增产品</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2">
              <Upload className="h-5 w-5" />
              <span>批量导入</span>
            </Button>
            <Button variant="outline" className="h-20 flex-col gap-2">
              <TrendingUp className="h-5 w-5" />
              <span>生成报表</span>
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
