'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Bell } from 'lucide-react';

interface NotificationsProps {
  user: any;
  onUnreadChange?: (count: number) => void;
}

export default function Notifications({ user, onUnreadChange }: NotificationsProps) {
  const [notifications, setNotifications] = useState<any[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadNotifications();
  }, [user?.id]);

  const loadNotifications = async () => {
    try {
      setLoading(true);
      const res = await fetch(`/api/notifications?user_id=${user.id}`);
      const data = await res.json();
      if (data.success) {
        setNotifications(data.notifications || []);
        const unread = (data.notifications || []).filter((n: any) => !n.is_read).length;
        setUnreadCount(unread);
        onUnreadChange?.(unread);
      }
    } catch (error) {
      console.error('[Notifications] 加载失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const markAsRead = async (id: number) => {
    try {
      const res = await fetch('/api/notifications/read', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ notification_id: id }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: true } : n)));
        setUnreadCount((prev) => Math.max(0, prev - 1));
        onUnreadChange?.(Math.max(0, unreadCount - 1));
      }
    } catch (error) {
      console.error('[Notifications] 标记失败:', error);
    }
  };

  const markAllAsRead = async () => {
    try {
      const res = await fetch('/api/notifications/read-all', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: true })));
        setUnreadCount(0);
        onUnreadChange?.(0);
      }
    } catch (error) {
      console.error('[Notifications] 标记全部失败:', error);
    }
  };

  const getIcon = (type: string) => {
    switch (type) {
      case 'system':
        return '🔔';
      case 'points':
        return '💰';
      case 'audit':
        return '✅';
      case 'invite':
        return '🤝';
      case 'exchange':
        return '🎁';
      default:
        return '📌';
    }
  };

  const getTypeBadge = (type: string) => {
    switch (type) {
      case 'system':
        return <Badge variant="secondary">系统</Badge>;
      case 'points':
        return <Badge className="bg-yellow-500">积分</Badge>;
      case 'audit':
        return <Badge className="bg-green-500">审核</Badge>;
      case 'invite':
        return <Badge className="bg-blue-500">邀请</Badge>;
      case 'exchange':
        return <Badge className="bg-purple-500">兑换</Badge>;
      default:
        return null;
    }
  };

  const formatTime = (time: string) => {
    const date = new Date(time);
    const now = new Date();
    const diff = now.getTime() - date.getTime();
    const minutes = Math.floor(diff / 60000);
    const hours = Math.floor(diff / 3600000);
    const days = Math.floor(diff / 86400000);

    if (minutes < 1) return '刚刚';
    if (minutes < 60) return `${minutes}分钟前`;
    if (hours < 24) return `${hours}小时前`;
    if (days < 7) return `${days}天前`;
    return date.toLocaleDateString('zh-CN');
  };

  if (loading) {
    return <div className="text-center py-8 text-gray-500">加载中...</div>;
  }

  return (
    <div className="space-y-4">
      {/* 头部 */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Bell className="h-5 w-5 text-blue-600" />
          <span className="font-medium">消息通知</span>
          {unreadCount > 0 && <Badge className="bg-red-500">{unreadCount} 条未读</Badge>}
        </div>
        {unreadCount > 0 && (
          <Button variant="ghost" size="sm" onClick={markAllAsRead} className="text-xs">
            全部已读
          </Button>
        )}
      </div>

      {/* 通知列表 */}
      {notifications.length === 0 ? (
        <Card>
          <CardContent className="p-8">
            <div className="text-center text-gray-400">
              <Bell className="h-12 w-12 mx-auto mb-2 opacity-30" />
              <div>暂无消息通知</div>
            </div>
          </CardContent>
        </Card>
      ) : (
        <ScrollArea className="h-[500px]">
          <div className="space-y-2 pr-2">
            {notifications.map((notify) => (
              <Card
                key={notify.id}
                className={`cursor-pointer hover:shadow-md transition-all ${
                  !notify.is_read ? 'bg-blue-50 border-blue-200' : 'bg-gray-50'
                }`}
                onClick={() => !notify.is_read && markAsRead(notify.id)}
              >
                <CardContent className="p-3">
                  <div className="flex items-start gap-3">
                    <span className="text-2xl">{getIcon(notify.type)}</span>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div className="flex-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-medium text-sm">{notify.title}</span>
                            {getTypeBadge(notify.type)}
                          </div>
                          <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                            {notify.content}
                          </div>
                        </div>
                        {!notify.is_read && (
                          <div className="w-2 h-2 bg-blue-500 rounded-full flex-shrink-0 mt-1" />
                        )}
                      </div>
                      <div className="text-xs text-gray-400 mt-2">
                        {formatTime(notify.created_at)}
                      </div>
                    </div>
                  </div>
                </CardContent>
              </Card>
            ))}
          </div>
        </ScrollArea>
      )}
    </div>
  );
}
