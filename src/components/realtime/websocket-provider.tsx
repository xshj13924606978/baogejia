'use client';

import { useEffect, useState } from 'react';
import { useWebSocket } from '@/hooks/useWebSocket';
import { NotificationToast } from '@/components/realtime/notification-toast';

interface WebSocketProviderProps {
  children: React.ReactNode;
}

export function WebSocketProvider({ children }: WebSocketProviderProps) {
  const [userId, setUserId] = useState<number | null>(null);

  useEffect(() => {
    // 从 localStorage 获取用户信息
    const userStr = localStorage.getItem('user');
    if (userStr) {
      try {
        const user = JSON.parse(userStr);
        setUserId(user.id);
      } catch (error) {
        console.error('解析用户信息失败:', error);
      }
    }
  }, []);

  // 使用 WebSocket hook，但不直接渲染任何内容
  // 这里的 WebSocketProvider 主要是为了在全局初始化 WebSocket 连接
  useWebSocket({
    userId: userId || undefined,
  });

  return <>{children}</>;
}
