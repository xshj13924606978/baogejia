'use client';

import { useSocket } from '@/hooks/useSocket';
import { cn } from '@/lib/utils';
import { Circle } from 'lucide-react';

/**
 * 在线指示器组件
 */
export interface OnlineIndicatorProps {
  userId?: number;
  size?: 'sm' | 'md' | 'lg';
  showText?: boolean;
  className?: string;
  showPulse?: boolean;
}

export function OnlineIndicator({
  userId,
  size = 'md',
  showText = false,
  className = '',
  showPulse = true,
}: OnlineIndicatorProps) {
  const { isConnected, onlineUsers } = useSocket({ userId });

  const isOnline = userId ? onlineUsers.some(u => u.userId === userId) : isConnected;

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

  const colorClass = isOnline ? 'bg-green-500' : 'bg-gray-400';

  return (
    <div className={cn('flex items-center gap-1.5', className)}>
      <div
        className={cn('relative', sizeClasses[size])}
        title={isOnline ? '在线' : '离线'}
      >
        <div className={cn('rounded-full', colorClass)} />
        {showPulse && isOnline && (
          <div className={cn(
            'absolute inset-0 rounded-full bg-green-500 animate-ping',
            sizeClasses[size]
          )} />
        )}
      </div>

      {showText && (
        <span className={cn(
          textSizeClasses[size],
          isOnline ? 'text-green-600' : 'text-gray-400'
        )}>
          {isOnline ? '在线' : '离线'}
        </span>
      )}
    </div>
  );
}

/**
 * 用户在线状态组件
 */
export interface UserOnlineStatusProps {
  userId: number;
  username: string;
  avatar?: string;
  size?: 'sm' | 'md' | 'lg';
  className?: string;
  showText?: boolean;
}

export function UserOnlineStatus({
  userId,
  username,
  avatar,
  size = 'md',
  className = '',
  showText = false,
}: UserOnlineStatusProps) {
  const { onlineUsers } = useSocket();

  const user = onlineUsers.find(u => u.userId === userId);
  const isOnline = !!user;
  const status = user?.status || 'offline';

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {avatar && (
        <div className="relative">
          <img
            src={avatar}
            alt={username}
            className="rounded-full object-cover"
            style={{
              width: size === 'sm' ? '24px' : size === 'md' ? '32px' : '40px',
              height: size === 'sm' ? '24px' : size === 'md' ? '32px' : '40px',
            }}
          />
          <OnlineIndicator
            userId={userId}
            size="sm"
            className="absolute -bottom-0.5 -right-0.5"
          />
        </div>
      )}
      <span className="text-sm">{username}</span>
      {showText && (
        <span className={cn(
          'text-xs',
          isOnline ? 'text-green-600' : 'text-gray-400'
        )}>
          {status === 'busy' ? '忙碌' : status === 'away' ? '离开' : isOnline ? '在线' : '离线'}
        </span>
      )}
    </div>
  );
}

/**
 * 在线用户统计组件
 */
export interface OnlineUsersCountProps {
  className?: string;
}

export function OnlineUsersCount({ className }: OnlineUsersCountProps) {
  const { onlineUsers, isConnected } = useSocket();

  return (
    <div className={cn('flex items-center gap-2', className)}>
      <OnlineIndicator size="sm" />
      <span className="text-sm text-gray-600">
        {isConnected ? `${onlineUsers.length} 人在线` : '未连接'}
      </span>
    </div>
  );
}

/**
 * 在线用户列表组件
 */
export interface OnlineUsersListProps {
  maxCount?: number;
  className?: string;
  onItemClick?: (userId: number) => void;
}

export function OnlineUsersList({
  maxCount = 10,
  className = '',
  onItemClick,
}: OnlineUsersListProps) {
  const { onlineUsers, isConnected } = useSocket();

  const displayUsers = onlineUsers.slice(0, maxCount);

  if (!isConnected) {
    return (
      <div className={cn('text-center py-4 text-gray-500 text-sm', className)}>
        正在连接...
      </div>
    );
  }

  if (displayUsers.length === 0) {
    return (
      <div className={cn('text-center py-4 text-gray-500 text-sm', className)}>
        暂无在线用户
      </div>
    );
  }

  return (
    <div className={cn('space-y-2', className)}>
      {displayUsers.map((user) => (
        <div
          key={user.userId}
          onClick={() => onItemClick?.(typeof user.userId === 'number' ? user.userId : Number(user.userId))}
          className={cn(
            'flex items-center gap-2 p-2 rounded-lg hover:bg-gray-100 cursor-pointer transition-colors',
            onItemClick && 'cursor-pointer'
          )}
        >
          <OnlineIndicator userId={typeof user.userId === 'number' ? user.userId : Number(user.userId)} size="sm" />
          <div className="flex-1 min-w-0">
            <div className="text-sm font-medium truncate">
              {user.username || `用户${user.userId}`}
            </div>
            <div className={cn(
              'text-xs',
              user.status === 'busy' ? 'text-yellow-600' :
              user.status === 'away' ? 'text-orange-600' :
              'text-green-600'
            )}>
              {user.status === 'busy' ? '忙碌' :
               user.status === 'away' ? '离开' :
               '在线'}
            </div>
          </div>
        </div>
      ))}
      {onlineUsers.length > maxCount && (
        <div className="text-center text-xs text-gray-500 py-2">
          还有 {onlineUsers.length - maxCount} 人在线
        </div>
      )}
    </div>
  );
}

/**
 * 状态选择器组件
 */
export interface StatusSelectorProps {
  userId: number;
  className?: string;
  onStatusChange?: (status: 'online' | 'busy' | 'away') => void;
}

export function StatusSelector({
  userId,
  className = '',
  onStatusChange,
}: StatusSelectorProps) {
  const { onlineUsers, updateUserStatus } = useSocket({ userId });

  const currentUser = onlineUsers.find(u => u.userId === userId);
  const currentStatus = currentUser?.status || 'offline';

  const handleStatusChange = (newStatus: 'online' | 'busy' | 'away') => {
    updateUserStatus(newStatus);
    onStatusChange?.(newStatus);
  };

  const statuses = [
    { value: 'online', label: '在线', color: 'bg-green-500' },
    { value: 'busy', label: '忙碌', color: 'bg-yellow-500' },
    { value: 'away', label: '离开', color: 'bg-orange-500' },
  ] as const;

  return (
    <div className={cn('flex items-center gap-2', className)}>
      {statuses.map((status) => (
        <button
          key={status.value}
          onClick={() => handleStatusChange(status.value)}
          className={cn(
            'flex items-center gap-1.5 px-3 py-1.5 rounded-full text-sm transition-colors',
            currentStatus === status.value
              ? 'bg-gray-100 text-gray-900'
              : 'text-gray-500 hover:bg-gray-50'
          )}
          title={status.label}
        >
          <div className={cn('w-2 h-2 rounded-full', status.color)} />
          {status.label}
        </button>
      ))}
    </div>
  );
}

export default OnlineIndicator;
