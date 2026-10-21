'use client';

import { useState, useEffect, useCallback } from 'react';
import { useWebSocket as useSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';
import {
  X,
  Bell,
  Info,
  AlertCircle,
  CheckCircle,
  AlertTriangle,
  Trash2,
  CheckCheck,
} from 'lucide-react';
import { Button } from '@/components/ui/button';

/**
 * 通知数据类型
 */
export interface NotificationData {
  id: number;
  userId: number;
  title: string;
  content: string;
  type: 'info' | 'warning' | 'success' | 'error';
  isRead: boolean;
  readAt?: Date;
  actionUrl?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

/**
 * 通知面板组件
 */
export interface NotificationPanelProps {
  userId?: number;
  maxDisplayCount?: number;
  className?: string;
  onNotificationClick?: (notification: NotificationData) => void;
  onNotificationDelete?: (notificationId: number) => void;
}

export function NotificationPanel({
  userId,
  maxDisplayCount = 10,
  className = '',
  onNotificationClick,
  onNotificationDelete,
}: NotificationPanelProps) {
  const [notifications, setNotifications] = useState<NotificationData[]>([]);
  const [showPanel, setShowPanel] = useState(false);
  const [unreadCount, setUnreadCount] = useState(0);

  const currentUserId =
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}')?.id : userId;

  const { markNotificationAsRead } = useSocket({
    userId: currentUserId,
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
    if (!currentUserId) return;

    loadNotifications();
  }, [currentUserId]);

  const loadNotifications = useCallback(async () => {
    // 模拟历史通知数据
    const mockNotifications: NotificationData[] = [
      {
        id: 1,
        userId: currentUserId || 0,
        title: '欢迎使用报个价',
        content: '感谢您使用报个价系统，如有任何问题请联系客服。',
        type: 'info',
        isRead: false,
        metadata: {},
        createdAt: new Date(Date.now() - 3600000),
      },
      {
        id: 2,
        userId: currentUserId || 0,
        title: '报价单已生成',
        content: '您的报价单已生成成功，请及时查看。',
        type: 'success',
        isRead: true,
        readAt: new Date(Date.now() - 7200000),
        metadata: {},
        createdAt: new Date(Date.now() - 7200000),
      },
      {
        id: 3,
        userId: currentUserId || 0,
        title: '系统维护通知',
        content: '系统将于今晚 24:00 进行维护，预计耗时 2 小时。',
        type: 'warning',
        isRead: true,
        readAt: new Date(Date.now() - 86400000),
        metadata: {},
        createdAt: new Date(Date.now() - 86400000),
      },
    ];

    setNotifications(mockNotifications);
    setUnreadCount(mockNotifications.filter((n) => !n.isRead).length);
  }, [currentUserId]);

  const playNotificationSound = useCallback(() => {
    try {
      // 使用 Web Audio API 播放提示音
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.3);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.3);
    } catch (error) {
      console.error('[Notification] 播放通知声音失败:', error);
    }
  }, []);

  const handleMarkAsRead = (notificationId: number) => {
    setNotifications((prev) =>
      prev.map((n) => (n.id === notificationId ? { ...n, isRead: true, readAt: new Date() } : n))
    );
    setUnreadCount((prev) => Math.max(0, prev - 1));

    // 通知服务器
    markNotificationAsRead(notificationId);
  };

  const handleMarkAllAsRead = () => {
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true, readAt: new Date() })));
    setUnreadCount(0);
  };

  const handleDeleteNotification = (notificationId: number, event: React.MouseEvent) => {
    event.stopPropagation();
    setNotifications((prev) => prev.filter((n) => n.id !== notificationId));
    onNotificationDelete?.(notificationId);
  };

  const handleClearAll = () => {
    setNotifications([]);
    setUnreadCount(0);
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

  const displayNotifications = notifications.slice(0, maxDisplayCount);

  return (
    <div className="relative">
      {/* 通知按钮 */}
      <button
        onClick={() => setShowPanel(!showPanel)}
        className={cn('relative p-2 rounded-lg hover:bg-gray-100 transition-colors', className)}
        aria-label="通知"
      >
        <Bell className="w-6 h-6 text-gray-700" />
        {unreadCount > 0 && (
          <span className="absolute -top-1 -right-1 w-5 h-5 bg-red-500 text-white text-xs rounded-full flex items-center justify-center font-medium">
            {unreadCount > 99 ? '99+' : unreadCount}
          </span>
        )}
      </button>

      {/* 通知面板 */}
      {showPanel && (
        <>
          {/* 遮罩层 */}
          <div
            className="fixed inset-0 bg-black bg-opacity-50 z-40"
            onClick={() => setShowPanel(false)}
          />

          {/* 通知面板内容 */}
          <div className="absolute right-0 top-12 w-96 bg-white rounded-lg shadow-xl z-50 max-h-[600px] flex flex-col">
            {/* 头部 */}
            <div className="p-4 border-b flex justify-between items-center">
              <h3 className="font-semibold text-gray-900">通知</h3>
              <div className="flex gap-2">
                {unreadCount > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleMarkAllAsRead}
                    className="text-sm text-blue-600 hover:text-blue-700"
                  >
                    <CheckCheck className="w-4 h-4 mr-1" />
                    全部已读
                  </Button>
                )}
                {notifications.length > 0 && (
                  <Button
                    variant="ghost"
                    size="sm"
                    onClick={handleClearAll}
                    className="text-sm text-gray-500 hover:text-gray-700"
                  >
                    <Trash2 className="w-4 h-4 mr-1" />
                    清空
                  </Button>
                )}
                <Button variant="ghost" size="icon" onClick={() => setShowPanel(false)}>
                  <X className="w-4 h-4 text-gray-500" />
                </Button>
              </div>
            </div>

            {/* 通知列表 */}
            <div className="flex-1 overflow-y-auto p-2">
              {notifications.length === 0 ? (
                <div className="text-center py-8 text-gray-500">暂无通知</div>
              ) : (
                displayNotifications.map((notification) => (
                  <div
                    key={notification.id}
                    className={cn(
                      'p-3 mb-2 rounded-lg bg-gray-50 hover:bg-gray-100 transition-colors cursor-pointer',
                      getNotificationStyle(notification.type),
                      !notification.isRead && 'font-medium'
                    )}
                    onClick={() => {
                      handleMarkAsRead(notification.id);
                      onNotificationClick?.(notification);
                      if (notification.actionUrl) {
                        window.location.href = notification.actionUrl;
                      }
                      setShowPanel(false);
                    }}
                  >
                    <div className="flex gap-3">
                      <div className="flex-shrink-0">{getNotificationIcon(notification.type)}</div>
                      <div className="flex-1 min-w-0">
                        <div className="text-sm text-gray-900">{notification.title}</div>
                        <div className="text-xs text-gray-600 mt-1 line-clamp-2">
                          {notification.content}
                        </div>
                        <div className="text-xs text-gray-400 mt-1">
                          {new Date(notification.createdAt).toLocaleString('zh-CN', {
                            year: 'numeric',
                            month: '2-digit',
                            day: '2-digit',
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </div>
                      </div>
                      <button
                        onClick={(e) => handleDeleteNotification(notification.id, e)}
                        className="flex-shrink-0 p-1 hover:bg-gray-200 rounded opacity-0 group-hover:opacity-100 transition-opacity"
                      >
                        <X className="w-4 h-4 text-gray-400" />
                      </button>
                    </div>
                  </div>
                ))
              )}
            </div>

            {/* 底部 */}
            {notifications.length > maxDisplayCount && (
              <div className="p-3 border-t text-center">
                <button
                  onClick={() => setShowPanel(false)}
                  className="text-sm text-blue-600 hover:text-blue-700"
                >
                  查看全部 {notifications.length} 条通知
                </button>
              </div>
            )}
          </div>
        </>
      )}
    </div>
  );
}

/**
 * 通知徽章组件
 */
export interface NotificationBadgeProps {
  count: number;
  maxCount?: number;
  className?: string;
}

export function NotificationBadge({
  count,
  maxCount = 99,
  className = '',
}: NotificationBadgeProps) {
  if (count === 0) return null;

  const displayCount = count > maxCount ? `${maxCount}+` : count;

  return (
    <span
      className={cn(
        'inline-flex items-center justify-center px-2 py-0.5 text-xs font-bold leading-none text-white bg-red-500 rounded-full',
        className
      )}
    >
      {displayCount}
    </span>
  );
}

/**
 * 通知列表组件（用于页面内嵌显示）
 */
export interface NotificationListProps {
  notifications: NotificationData[];
  maxDisplayCount?: number;
  className?: string;
  onNotificationClick?: (notification: NotificationData) => void;
}

export function NotificationList({
  notifications,
  maxDisplayCount = 20,
  className = '',
  onNotificationClick,
}: NotificationListProps) {
  const displayNotifications = notifications.slice(0, maxDisplayCount);

  if (displayNotifications.length === 0) {
    return <div className={cn('text-center py-8 text-gray-500', className)}>暂无通知</div>;
  }

  return (
    <div className={cn('space-y-2', className)}>
      {displayNotifications.map((notification) => (
        <div
          key={notification.id}
          className={cn(
            'p-4 rounded-lg bg-white border hover:shadow-md transition-shadow cursor-pointer',
            !notification.isRead && 'border-l-4 border-l-blue-500'
          )}
          onClick={() => onNotificationClick?.(notification)}
        >
          <div className="flex items-start gap-3">
            <div className="flex-shrink-0 mt-0.5">
              {notification.type === 'success' && (
                <CheckCircle className="w-5 h-5 text-green-500" />
              )}
              {notification.type === 'warning' && (
                <AlertTriangle className="w-5 h-5 text-yellow-500" />
              )}
              {notification.type === 'error' && <AlertCircle className="w-5 h-5 text-red-500" />}
              {notification.type === 'info' && <Info className="w-5 h-5 text-blue-500" />}
            </div>
            <div className="flex-1 min-w-0">
              <div className="flex items-start justify-between gap-2">
                <h4 className={cn('text-sm font-medium', !notification.isRead && 'font-semibold')}>
                  {notification.title}
                </h4>
                {!notification.isRead && (
                  <span className="flex-shrink-0 w-2 h-2 rounded-full bg-blue-500" />
                )}
              </div>
              <p className="text-sm text-gray-600 mt-1 line-clamp-2">{notification.content}</p>
              <div className="text-xs text-gray-400 mt-2">
                {new Date(notification.createdAt).toLocaleString('zh-CN', {
                  year: 'numeric',
                  month: '2-digit',
                  day: '2-digit',
                  hour: '2-digit',
                  minute: '2-digit',
                })}
              </div>
            </div>
          </div>
        </div>
      ))}
    </div>
  );
}

export default NotificationPanel;
