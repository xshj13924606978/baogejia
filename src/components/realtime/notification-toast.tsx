'use client';

import { useState, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { X, Bell, Info, AlertCircle, CheckCircle, AlertTriangle } from 'lucide-react';

interface NotificationData {
  id: number;
  user_id: number;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'error';
  is_read: boolean;
  read_at?: string;
  action_url?: string;
  metadata: any;
  created_at: string;
}

export function NotificationToast() {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);
  const userId = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}')?.id : null;

  const { markNotificationAsRead } = useWebSocket({
    userId,
    onNotification: (notification: NotificationData) => {
      // 新通知添加到顶部
      setNotifications((prev) => [notification, ...prev]);
      setUnreadCount((prev) => prev + 1);
      
      // 播放通知声音
      playNotificationSound();
    },
  });

  // 加载历史通知（模拟）
  useEffect(() => {
    if (!userId) return;

    loadNotifications();
  }, [userId]);

  const loadNotifications = async () => {
    // 模拟历史通知数据
    const mockNotifications: NotificationData[] = [
      {
        id: 1,
        user_id: userId,
        title: '欢迎使用报个价',
        content: '感谢您使用报个价系统，如有任何问题请联系客服。',
        type: 'info',
        is_read: false,
        metadata: {},
        created_at: new Date(Date.now() - 3600000).toISOString(),
      },
      {
        id: 2,
        user_id: userId,
        title: '报价单已生成',
        content: '您的报价单已生成成功，请及时查看。',
        type: 'success',
        is_read: true,
        read_at: new Date(Date.now() - 7200000).toISOString(),
        metadata: {},
        created_at: new Date(Date.now() - 7200000).toISOString(),
      },
    ];

    setNotifications(mockNotifications);
    setUnreadCount(mockNotifications.filter((n) => !n.is_read).length);
  };

  const playNotificationSound = () => {
    try {
      // 模拟通知声音（不实际播放，避免浏览器限制）
      console.log('[通知] 播放通知声音');
    } catch (error) {
      console.error('播放通知声音失败:', error);
    }
  };

  const handleMarkAsRead = async (notificationId: number) => {
    setNotifications((prev) =>
      prev.map((n) =>
        n.id === notificationId ? { ...n, is_read: true, read_at: new Date().toISOString() } : n
      )
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    // 通知服务器
    markNotificationAsRead(notificationId);
  };

  const handleMarkAllAsRead = async () => {
    setNotifications((prev) =>
      prev.map((n) => ({ ...n, is_read: true, read_at: new Date().toISOString() }))
    );
    setUnreadCount(0);
  };

  const handleDeleteNotification = async (notificationId: number) => {
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
  };

  const getNotificationIcon = (type: string) => {
    switch (type) {
      case 'success':
        return <CheckCircle className="w-5 h-5 text-green-500" />;
      case 'warning':
        return <AlertTriangle className="w-5 h-5 text-yellow-500" />;
      case 'error':
        return <AlertCircle className="w-5 h-5 text-red-500" />;
      default:
        return <Info className="w-5 h-5 text-blue-500" />;
    }
  };

  const getNotificationStyle = (type: string) => {
    switch (type) {
      case 'success':
        return 'border-l-4 border-green-500';
      case 'warning':
        return 'border-l-4 border-yellow-500';
      case 'error':
        return 'border-l-4 border-red-500';
      default:
        return 'border-l-4 border-blue-500';
    }
  };

  return (
    <div className="relative">
      {/* 通知按钮 */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className="relative p-2 rounded-lg hover:bg-gray-100 transition-colors"
        aria-label="通知"
      >
        <Bell className="w-6 h-6 text-gray-700" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 通知面板 */}
      {showPanel && (
        <>
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setShowPanel(false)}
          />
          <div className="absolute right-0 top-12 w-96 bg-white rounded-lg shadow-xl z-50 max-h-[600px] flex flex-col">
            {/* 头部 */}
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">通知</h3>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <button
                    onClick={handleMarkAllAsRead}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    全部已读
                  </button>
                )}
                <button
                  onClick={() => setShowPanel(false)}
                  className="p-1 hover:bg-gray-100 rounded"
                >
                  <X className="w-4 h-4 text-gray-500" />
                </button>
              </div>
            </div>

            {/* 通知列表 */}
            <div className="flex-1 overflow-y-auto p-2">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-gray-500">
                  暂无通知
                </div>
              ) : (
                notifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={`p-3 mb-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors ${getNotificationStyle(
                      notification.type
                    )} ${!notification.is_read ? 'font-medium' : ''}`}
                    onClick={() => {
                      handleMarkAsRead(notification.id);
                      if (notification.action_url) {
                        window.location.href = notification.action_url;
                      }
                    }}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0">
                        {getNotificationIcon(notification.type)}
                      </div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900">{notification.title}</div>
                        <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {notification.content}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(notification.created_at).toLocaleString('zh-CN')}
                        </div>
                      </div>
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          handleDeleteNotification(notification.id);
                        }}
                        className="flex-shrink-0 p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>
          </div>
        </>
      )}
    </div>
  );
}
