'use client';

import { useWebSocket } from '@/hooks/useWebSocket';

interface OnlineIndicatorProps {
  userId?: number;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
}

export function OnlineIndicator({
  userId,
  size = 'md',
  showText = false,
  className = '',
}: OnlineIndicatorProps) {
  const { isConnected, onlineUsers } = useWebSocket({
    userId,
  });

  const isOnline = userId ? onlineUsers.some((u) => u.user_id === userId) : isConnected;

  const sizeClasses = {
    sm: 'w-2 h-2',
    md: 'w-3 h-3',
    lg: 'w-4 h-4',
  };

  const textSizeClasses = {
    sm: 'text-xs',
    md: 'text-sm',
    lg: 'text-base',
  };

  return (
    <div className={`flex items-center gap-1.5 ${className}`}>
      <div className={`relative ${sizeClasses[size]}`} title={isOnline ? '在线' : '离线'}>
        <div
          className={`absolute inset-0 rounded-full ${
            isOnline ? 'bg-green-500 animate-pulse' : 'bg-gray-400'
          }`}
        />
        {isOnline && (
          <div className={`absolute inset-0 rounded-full bg-green-500 opacity-75 animate-ping`} />
        )}
      </div>

      {showText && (
        <span
          className={`${textSizeClasses[size]} ${isOnline ? 'text-green-600' : 'text-gray-400'}`}
        >
          {isOnline ? '在线' : '离线'}
        </span>
      )}
    </div>
  );
}

// 用户列表在线状态组件
interface UserOnlineStatusProps {
  userId: number;
  username: string;
  avatar?: string;
  className?: string;
}

export function UserOnlineStatus({
  userId,
  username,
  avatar,
  className = '',
}: UserOnlineStatusProps) {
  const { onlineUsers } = useWebSocket();

  const _isOnline = onlineUsers.some((u) => u.user_id === userId);

  return (
    <div className={`flex items-center gap-2 ${className}`}>
      {avatar && (
        <div className="relative">
          <img src={avatar} alt={username} className="w-8 h-8 rounded-full" />
          <OnlineIndicator userId={userId} size="sm" className="absolute -bottom-0.5 -right-0.5" />
        </div>
      )}
      <span className="text-sm">{username}</span>
    </div>
  );
}

// 在线用户统计组件
export function OnlineUsersCount() {
  const { onlineUsers, isConnected } = useWebSocket();

  return (
    <div className="flex items-center gap-2">
      <OnlineIndicator size="sm" />
      <span className="text-sm text-gray-600">在线用户: {onlineUsers.length}</span>
    </div>
  );
}
