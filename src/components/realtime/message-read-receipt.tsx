'use client';

import { useState, useEffect } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { Check, CheckCheck } from 'lucide-react';

interface MessageReadReceiptProps {
  userId?: number;
  messageType: string;
  messageId: string;
  recipients?: number[]; // 接收者ID列表
  showCount?: boolean;
  className?: string;
}

interface ReadStatus {
  user_id: number;
  username?: string;
  is_read: boolean;
  read_at?: string;
}

export function MessageReadReceipt({
  userId,
  messageType,
  messageId,
  recipients = [],
  showCount = true,
  className = '',
}: MessageReadReceiptProps) {
  const [readStatuses, setReadStatuses] = useState<ReadStatus[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const currentUserId = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}')?.id : userId;

  const { markMessageAsRead } = useWebSocket({
    userId: currentUserId,
    onMessageRead: (data) => {
      if (
        data.messageType === messageType &&
        data.messageId === messageId
      ) {
        // 更新已读状态
        setReadStatuses((prev) =>
          prev.map((status) =>
            status.user_id === data.userId
              ? { ...status, is_read: true, read_at: new Date().toISOString() }
              : status
          )
        );
      }
    },
  });

  // 加载已读状态（模拟）
  useEffect(() => {
    if (!messageId || !recipients.length) return;

    // 模拟已读状态
    const mockStatuses: ReadStatus[] = recipients.map((uid, index) => ({
      user_id: uid,
      is_read: index < Math.floor(recipients.length / 2), // 模拟一半已读
      read_at: index < Math.floor(recipients.length / 2) ? new Date().toISOString() : undefined,
    }));

    setReadStatuses(mockStatuses);
    setIsLoading(false);
  }, [messageId, messageType, recipients]);

  const handleMarkAsRead = () => {
    if (!currentUserId || !messageId || !messageType) return;

    // 标记为已读
    markMessageAsRead(messageType, messageId);
    
    // 更新本地状态
    setReadStatuses((prev) =>
      prev.map((status) =>
        status.user_id === currentUserId
          ? { ...status, is_read: true, read_at: new Date().toISOString() }
          : status
      )
    );
  };

  // 计算已读人数
  const readCount = readStatuses.filter((s) => s.is_read).length;
  const totalCount = recipients.length || 1;
  const allRead = readCount === totalCount;

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      <button
        onClick={handleMarkAsRead}
        className={`flex items-center gap-1 transition-colors ${
          allRead ? 'text-blue-500' : 'text-gray-400 hover:text-blue-400'
        }`}
        title={allRead ? '已读' : '未读'}
      >
        {isLoading ? (
          <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
        ) : allRead ? (
          <CheckCheck className="w-4 h-4" />
        ) : (
          <Check className="w-4 h-4" />
        )}
      </button>

      {showCount && (
        <span className="text-xs text-gray-500">
          {readCount}/{totalCount}
        </span>
      )}
    </div>
  );
}

// 批量消息已读状态组件
interface BatchMessageReadReceiptProps {
  userId?: number;
  messages: Array<{
    messageType: string;
    messageId: string;
    recipients?: number[];
  }>;
  className?: string;
}

export function BatchMessageReadReceipt({
  userId,
  messages,
  className = '',
}: BatchMessageReadReceiptProps) {
  const [readStatuses, setReadStatuses] = useState<
    Record<string, Record<number, boolean>>
  >({});
  const [isLoading, setIsLoading] = useState(false);
  const currentUserId = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}')?.id : userId;

  const { markMessageAsRead } = useWebSocket({
    userId: currentUserId,
  });

  // 加载批量已读状态（模拟）
  useEffect(() => {
    if (messages.length === 0) return;

    // 模拟批量已读状态
    const statusMap: Record<string, Record<number, boolean>> = {};
    messages.forEach((message, index) => {
      const key = `${message.messageType}:${message.messageId}`;
      statusMap[key] = {};
      const recipients = message.recipients || [currentUserId || 0];
      recipients.forEach((uid) => {
        statusMap[key][uid] = Math.random() > 0.5;
      });
    });

    setReadStatuses(statusMap);
  }, [messages, currentUserId]);

  return (
    <div className={`flex items-center gap-4 ${className}`}>
      {messages.map((message, index) => {
        const key = `${message.messageType}:${message.messageId}`;
        const statuses = readStatuses[key] || {};
        const recipients = message.recipients || [];
        const readCount = Object.values(statuses).filter((r) => r).length;
        const totalCount = recipients.length || 1;
        const allRead = readCount === totalCount;

        return (
          <div
            key={key}
            className="flex items-center gap-2"
          >
            <span className="text-xs text-gray-500">#{index + 1}</span>
            <MessageReadReceipt
              userId={currentUserId}
              messageType={message.messageType}
              messageId={message.messageId}
              recipients={message.recipients}
              showCount
            />
          </div>
        );
      })}
    </div>
  );
}

// 聊天消息已读状态组件
interface ChatMessageReadReceiptProps {
  messageId: string;
  senderId: number;
  recipients: number[];
  showCount?: boolean;
  className?: string;
}

export function ChatMessageReadReceipt({
  messageId,
  senderId,
  recipients,
  showCount = false,
  className = '',
}: ChatMessageReadReceiptProps) {
  const [readUsers, setReadUsers] = useState<number[]>([]);
  const [isLoading, setIsLoading] = useState(false);
  const currentUserId = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}')?.id : null;

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
    <div className={`flex items-center gap-1 ${className}`}>
      {isLoading ? (
        <div className="w-4 h-4 border-2 border-gray-300 border-t-blue-500 rounded-full animate-spin" />
      ) : readCount === totalCount && totalCount > 0 ? (
        <CheckCheck className="w-4 h-4 text-blue-500" />
      ) : readCount > 0 ? (
        <Check className="w-4 h-4 text-gray-400" />
      ) : null}

      {showCount && readCount > 0 && (
        <span className="text-xs text-gray-400">{readCount}</span>
      )}
    </div>
  );
}
