'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Bell, CheckCheck, Info, Award } from 'lucide-react';

export default function NotificationsPanel() {
  const notifications = [
    {
      id: 1,
      title: '报价单已生成',
      message: '您的搅拌设备报价单已生成',
      time: '5分钟前',
      read: false,
      icon: '📄',
    },
    {
      id: 2,
      title: '积分到账',
      message: '邀请好友获得50积分',
      time: '1小时前',
      read: false,
      icon: '🎁',
    },
    {
      id: 3,
      title: '文件解析完成',
      message: '上传的PDF文件已解析完成',
      time: '2小时前',
      read: true,
      icon: '📁',
    },
    { id: 4, title: '系统通知', message: '新版本功能上线', time: '昨天', read: true, icon: '✨' },
  ];

  const unreadCount = notifications.filter((n) => !n.read).length;

  return (
    <Card>
      <CardHeader className="pb-2">
        <div className="flex items-center justify-between">
          <CardTitle className="text-sm flex items-center gap-2">
            <Bell className="h-4 w-4 text-blue-500" />
            通知中心
          </CardTitle>
          {unreadCount > 0 && (
            <Badge variant="destructive" className="text-xs">
              {unreadCount}条未读
            </Badge>
          )}
        </div>
      </CardHeader>
      <CardContent>
        <div className="space-y-2">
          {notifications.map((item) => (
            <div
              key={item.id}
              className={`flex items-start gap-2 p-2 rounded-lg hover:bg-gray-50 cursor-pointer ${
                !item.read ? 'bg-blue-50/50' : ''
              }`}
            >
              <span className="text-lg">{item.icon}</span>
              <div className="flex-1 min-w-0">
                <div className="flex items-center justify-between">
                  <p className="text-xs font-medium">{item.title}</p>
                  {!item.read && <span className="w-1.5 h-1.5 bg-blue-600 rounded-full" />}
                </div>
                <p className="text-xs text-gray-500 truncate">{item.message}</p>
                <p className="text-[10px] text-gray-400 mt-1">{item.time}</p>
              </div>
            </div>
          ))}
        </div>

        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" className="w-full mt-2 text-xs text-blue-600">
            <CheckCheck className="h-3 w-3 mr-1" />
            全部标记为已读
          </Button>
        )}
      </CardContent>
    </Card>
  );
}
