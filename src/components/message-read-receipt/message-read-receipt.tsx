'use client';

import { useState, useEffect } from 'react';
import { useWebSocket as useSocket } from '@/hooks/useWebSocket';
import { cn } from '@/lib/utils';
import { Check, CheckCheck, Clock } from 'lucide-react';

/**
 * 消息已读回执组件
 */
export interface MessageReadReceiptProps {
  userId?: number;
  messageType: string;
  messageId: string;
  recipients?: number[]; // 接收者ID列表
  senderId?: number; // 发送者ID
  showCount?: boolean;
  showDetails?: boolean;
  className?: string;
}

interface ReadStatus {
  user_id: number;
  username?: string;
  avatar?: string;
  is_read: boolean;
  read_at?: Date;
}

export function MessageReadReceipt({
  userId,
  messageType,
  messageId,
  recipients = [],
  senderId,
  showCount = true,
  showDetails = false,
  className = '',
}: MessageReadReceiptProps) {
  const [readStatuses, setReadStatuses] = useState<ReadStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const [showDetailPanel, setShowDetailPanel] = useState(false);

  const currentUserId =
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}')?.id : userId;

  const { markMessageAsRead, isConnected } = useSocket({
    userId: currentUserId,
    onMessageRead: (data: any) => {
      if (data.messageType === messageType && data.messageId === messageId) {
        // 更新已读状态
        setReadStatuses((prev) =>
          prev.map((status) =>
            status.user_id === data.userId
              ? {
                  ...status,
                  is_read: true,
                  read_at: data.readAt ? new Date(data.readAt) : new Date(),
                }
              : status
          )
        );
      }
    },
  });

  // 初始化已读状态（模拟）
  useEffect(() => {
    if (!messageId || recipients.length === 0) return;

    // 模拟已读状态数据
    const mockStatuses: ReadStatus[] = recipients.map((uid, index) => ({
      user_id: uid,
      username: `用户${uid}`,
      is_read: index < Math.floor(recipients.length / 2), // 模拟一半已读
      read_at: index < Math.floor(recipients.length / 2) ? new Date() : undefined,
    }));

    setReadStatuses(mockStatuses);
  }, [messageId, recipients]);

  const handleMarkAsRead = () => {
    if (!currentUserId || !messageId || !messageType) return;

    // 标记为已读
    markMessageAsRead(messageType, messageId);

    // 更新本地状态
    setReadStatuses((prev) =>
      prev.map((status) =>
        status.user_id === currentUserId
          ? { ...status, is_read: true, read_at: new Date() }
          : status
      )
    );
  };

  const readCount = readStatuses.filter((s) => s.is_read).length;
  const totalCount = recipients.length || 1;
  const allRead = readCount === totalCount && totalCount > 0;
  const hasRead = readCount > 0;

  // 只有发送者或已读用户能看到已读回执
  if (senderId && senderId !== currentUserId) {
    return null;
  }

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <button
        onClick={handleMarkAsRead}
        className={cn(
          'flex items-center gap-1 transition-colors',
          allRead ? 'text-blue-500' : hasRead ? 'text-gray-400' : 'text-gray-300'
        )}
        title={allRead ? '已读' : hasRead ? '部分已读' : '未读'}
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        ) : allRead ? (
          <CheckCheck className="w-4 h-4" />
        ) : hasRead ? (
          <Check className="w-4 h-4" />
        ) : (
          <Clock className="w-4 h-4" />
        )}
      </button>

      {showCount && totalCount > 1 && (
        <span className="text-xs text-gray-500">
          {readCount}/{totalCount}
        </span>
      )}

      {showDetails && totalCount > 1 && (
        <button
          onClick={() => setShowDetailPanel(!showDetailPanel)}
          className="text-xs text-blue-500 hover:text-blue-600"
        >
          详情
        </button>
      )}

      {showDetailPanel && showDetails && (
        <div className="absolute right-0 top-8 w-64 bg-white rounded-lg shadow-xl z-50 p-4">
          <div className="font-medium text-sm mb-3">已读状态</div>
          <div className="space-y-2">
            {readStatuses.map((status) => (
              <div key={status.user_id} className="flex items-center justify-between text-sm">
                <span className="text-gray-900">{status.username}</span>
                <div className="flex items-center gap-2">
                  {status.is_read ? (
                    <Check className="w-4 h-4 text-green-500" />
                  ) : (
                    <Clock className="w-4 h-4 text-gray-300" />
                  )}
                  {status.read_at && (
                    <span className="text-xs text-gray-400">
                      {new Date(status.read_at).toLocaleTimeString('zh-CN', {
                        hour: '2-digit',
                        minute: '2-digit',
                      })}
                    </span>
                  )}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}
    </div>
  );
}

/**
 * 批量消息已读状态组件
 */
export interface BatchMessageReadReceiptProps {
  userId?: number;
  messages: Array<{
    messageType: string;
    messageId: string;
    recipients?: number[];
    senderId?: number;
  }>;
  className?: string;
}

export function BatchMessageReadReceipt({
  userId,
  messages,
  className = '',
}: BatchMessageReadReceiptProps) {
  const [readStatuses, setReadStatuses] = useState<Record<string, Record<number, boolean>>>({});

  const currentUserId =
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}')?.id : userId;

  const { markMessageAsRead } = useSocket({ userId: currentUserId });

  // 初始化批量已读状态（模拟）
  useEffect(() => {
    if (messages.length === 0) return;

    const statusMap: Record<string, Record<number, boolean>> = {};
    messages.forEach((message) => {
      const key = `${message.messageType}:${message.messageId}`;
      statusMap[key] = {};
      const recipients = message.recipients || [currentUserId || 0];
      recipients.forEach((uid) => {
        statusMap[key][uid] = Math.random() > 0.5;
      });
    });

    setReadStatuses(statusMap);
  }, [messages, currentUserId]);

  const allReadCount = messages.filter((message) => {
    const key = `${message.messageType}:${message.messageId}`;
    const statuses = readStatuses[key] || {};
    const recipients = message.recipients || [];
    return recipients.every((uid) => statuses[uid]);
  }).length;

  return (
    <div className={cn('flex items-center gap-3', className)}>
      <span className="text-xs text-gray-500">
        {allReadCount}/{messages.length} 条已读
      </span>
      {messages.map((message, index) => {
        const key = `${message.messageType}:${message.messageId}`;
        const statuses = readStatuses[key] || {};
        const recipients = message.recipients || [];
        const readCount = Object.values(statuses).filter((r) => r).length;
        const totalCount = recipients.length || 1;
        const allRead = readCount === totalCount;

        return (
          <MessageReadReceipt
            key={key}
            userId={currentUserId}
            messageType={message.messageType}
            messageId={message.messageId}
            recipients={message.recipients}
            senderId={message.senderId}
            showCount={totalCount > 1}
          />
        );
      })}
    </div>
  );
}

/**
 * 聊天消息已读状态组件
 */
export interface ChatMessageReadReceiptProps {
  messageId: string;
  senderId: number;
  recipients: number[];
  showCount?: boolean;
  className?: string;
  sentTime?: Date;
}

export function ChatMessageReadReceipt({
  messageId,
  senderId,
  recipients,
  showCount = false,
  className = '',
  sentTime,
}: ChatMessageReadReceiptProps) {
  const [readUsers, setReadUsers] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);

  const currentUserId =
    typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}')?.id : null;

  useEffect(() => {
    if (!messageId || recipients.length === 0) return;

    // 模拟已读用户
    setReadUsers(recipients.slice(0, Math.floor(recipients.length / 2)));
  }, [messageId, recipients]);

  // 只有发送者能看到已读回执
  if (currentUserId !== senderId) {
    return null;
  }

  const readCount = readUsers.length;
  const totalCount = recipients.length;

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      {isLoading ? (
        <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
      ) : readCount === totalCount && totalCount > 0 ? (
        <CheckCheck className="w-4 h-4 text-blue-500" />
      ) : readCount > 0 ? (
        <Check className="w-4 h-4 text-gray-400" />
      ) : (
        <Clock className="w-4 h-4 text-gray-300" />
      )}

      {showCount && readCount > 0 && <span className="text-xs text-gray-400">{readCount}</span>}

      {sentTime && readCount > 0 && (
        <span className="text-xs text-gray-400 ml-1">
          {new Date(sentTime).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      )}
    </div>
  );
}

/**
 * 消息发送状态组件
 */
export interface MessageDeliveryStatusProps {
  status: 'sending' | 'sent' | 'delivered' | 'read' | 'failed';
  timestamp?: Date;
  className?: string;
}

export function MessageDeliveryStatus({
  status,
  timestamp,
  className = '',
}: MessageDeliveryStatusProps) {
  const statusConfig = {
    sending: {
      icon: <Clock className="w-4 h-4 text-gray-300" />,
      text: '发送中',
      color: 'text-gray-300',
    },
    sent: {
      icon: <Check className="w-4 h-4 text-gray-400" />,
      text: '已发送',
      color: 'text-gray-400',
    },
    delivered: {
      icon: <CheckCheck className="w-4 h-4 text-gray-400" />,
      text: '已送达',
      color: 'text-gray-400',
    },
    read: {
      icon: <CheckCheck className="w-4 h-4 text-blue-500" />,
      text: '已读',
      color: 'text-blue-500',
    },
    failed: {
      icon: <Clock className="w-4 h-4 text-red-500" />,
      text: '发送失败',
      color: 'text-red-500',
    },
  };

  const config = statusConfig[status];

  return (
    <div className={cn('flex items-center gap-1.5', className, config.color)}>
      {config.icon}
      <span className="text-xs">{config.text}</span>
      {timestamp && (
        <span className="text-xs text-gray-400">
          {new Date(timestamp).toLocaleTimeString('zh-CN', {
            hour: '2-digit',
            minute: '2-digit',
          })}
        </span>
      )}
    </div>
  );
}

export default MessageReadReceipt;
