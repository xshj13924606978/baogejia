'use client';

import React from 'react';
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
} from 'lucide-react';

export default function AdminDashboard() {
  // 模拟统计数据
  const stats = [
    {
      title: '总用户数',
      value: '1,234',
      change: '+12.3%',
      icon: Users,
      color: 'bg-blue-500',
    },
    {
      title: '今日活跃',
      value: '567',
      change: '+5.2%',
      icon: Activity,
      color: 'bg-green-500',
    },
    {
      title: '报价单数',
      value: '890',
      change: '+8.1%',
      icon: FileText,
      color: 'bg-purple-500',
    },
    {
      title: '总收入',
      value: '¥45.6K',
      change: '+15.3%',
      icon: DollarSign,
      color: 'bg-yellow-500',
    },
  ];

  // 待审核内容
  const pendingItems = [
    {
      id: 1,
      type: '产品价格',
      user: '张三',
      time: '5分钟前',
      priority: '高',
    },
    {
      id: 2,
      type: '技术文档',
      user: '李四',
      time: '15分钟前',
      priority: '中',
    },
    {
      id: 3,
      type: '案例分享',
      user: '王五',
      time: '30分钟前',
      priority: '低',
    },
  ];

  // 最近上传
  const recentUploads = [
    {
      id: 1,
      name: '工业空调产品目录.pdf',
      user: '赵六',
      time: '10分钟前',
      size: '2.3 MB',
    },
    {
      id: 2,
      name: '污水处理设备报价.xlsx',
      user: '钱七',
      time: '25分钟前',
      size: '1.1 MB',
    },
    {
      id: 3,
      name: '技术规范.docx',
      user: '孙八',
      time: '1小时前',
      size: '512 KB',
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
          <Button variant="outline">
            <Clock className="h-4 w-4 mr-2" />
            最近活动
          </Button>
          <Button>
            <Upload className="h-4 w-4 mr-2" />
            上传资料
          </Button>
        </div>
      </div>

      {/* 统计卡片 */}
      <div className="grid gap-4 md:grid-cols-2 lg:grid-cols-4">
        {stats.map((stat, index) => {
          const Icon = stat.icon;
          return (
            <Card key={index}>
              <CardContent className="p-6">
                <div className="flex items-center justify-between">
                  <div>
                    <p className="text-sm font-medium text-gray-500">{stat.title}</p>
                    <p className="text-2xl font-bold mt-1">{stat.value}</p>
                    <p className="text-xs text-green-600 mt-1">{stat.change}</p>
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
              <Badge variant="destructive">3项待处理</Badge>
            </CardTitle>
            <CardDescription>需要您审核的用户上传内容</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {pendingItems.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    {item.priority === '高' ? (
                      <AlertCircle className="h-5 w-5 text-red-500 mt-0.5" />
                    ) : item.priority === '中' ? (
                      <Clock className="h-5 w-5 text-yellow-500 mt-0.5" />
                    ) : (
                      <CheckCircle className="h-5 w-5 text-green-500 mt-0.5" />
                    )}
                    <div>
                      <p className="font-medium">{item.type}</p>
                      <p className="text-sm text-gray-500">
                        上传者：{item.user} · {item.time}
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
          </CardContent>
        </Card>

        {/* 最近上传 */}
        <Card>
          <CardHeader>
            <CardTitle>最近上传</CardTitle>
            <CardDescription>用户最新上传的文件</CardDescription>
          </CardHeader>
          <CardContent>
            <div className="space-y-4">
              {recentUploads.map((item) => (
                <div key={item.id} className="flex items-center justify-between p-3 bg-gray-50 dark:bg-gray-800 rounded-lg">
                  <div className="flex items-start gap-3">
                    <FileText className="h-5 w-5 text-blue-500 mt-0.5" />
                    <div>
                      <p className="font-medium">{item.name}</p>
                      <p className="text-sm text-gray-500">
                        {item.user} · {item.time} · {item.size}
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
