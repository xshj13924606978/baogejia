'use client';

import { useEffect, useState } from 'react';
import { useWebSocket as useSocket } from '@/hooks/useWebSocket';

interface WebSocketProviderProps {
  children: React.ReactNode;
}

/**
 * WebSocket Provider
 *
 * 用于在全局初始化 WebSocket 连接和提供实时通信功能
 */
export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [userId, setUserId] = useState<number | null>(null);
  const [_username, _setUsername] = useState<string>('');
  const [_avatar, _setAvatar] = useState<string>('');

  useEffect(() => {
    // 从 localStorage 获取用户信息
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserId(user.id);
        _setUsername(user.username || '');
        _setAvatar(user.avatar || '');
      } catch (error) {
        console.error('[WebSocketProvider] 解析用户信息失败:', error);
      }
    }
  }, []);

  // 使用 WebSocket hook，但不直接渲染任何内容
  // 这里的 WebSocketProvider 主要是为了在全局初始化 WebSocket 连接
  const { isConnected: _isConnected } = useSocket({
    userId: userId || undefined,
    onConnect: () => {
      console.log('[WebSocketProvider] WebSocket 连接成功');
    },
    onDisconnect: () => {
      console.log('[WebSocketProvider] WebSocket 断开连接');
    },
    onError: (error: Error) => {
      console.error('[WebSocketProvider] WebSocket 连接错误:', error);
    },
  });

  return <>{children}</>;
}

export default WebSocketProvider;
