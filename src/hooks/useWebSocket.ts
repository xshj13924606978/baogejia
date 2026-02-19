import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

interface UseWebSocketOptions {
  userId?: number;
  onConnect?: () => void;
  onDisconnect?: () => void;
  onError?: (error: Error) => void;
  onNotification?: (notification: any) => void;
  onMessage?: (message: any) => void;
  onUserOnline?: (userId: number) => void;
  onUserOffline?: (userId: number) => void;
  onMessageRead?: (data: { userId: number; messageType: string; messageId: string }) => void;
  onOnlineUsers?: (users: any[]) => void;
}

export function useWebSocket(options: UseWebSocketOptions = {}) {
  const {
    userId,
    onConnect,
    onDisconnect,
    onError,
    onNotification,
    onMessage,
    onUserOnline,
    onUserOffline,
    onMessageRead,
    onOnlineUsers,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<any[]>([]);
  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  // 连接 WebSocket
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('[WebSocket] 已经连接，跳过重复连接');
      return;
    }

    // 获取 WebSocket 服务器地址
    const wsPort = process.env.NEXT_PUBLIC_WS_PORT || 6000;
    const wsUrl = typeof window !== 'undefined' 
      ? `${window.location.protocol === 'https:' ? 'wss:' : 'ws:'}//${window.location.hostname}:${wsPort}`
      : `ws://localhost:${wsPort}`;

    console.log('[WebSocket] 连接到:', wsUrl);

    const socket = io(wsUrl, {
      query: userId ? { userId: userId.toString() } : undefined,
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
    });

    socketRef.current = socket;

    // 连接成功
    socket.on('connect', () => {
      console.log('[WebSocket] 连接成功:', socket.id);
      setIsConnected(true);
      onConnect?.();
      
      // 加入用户房间
      if (userId) {
        socket.emit('join', { userId: userId.toString() });
      }
    });

    // 连接断开
    socket.on('disconnect', (reason) => {
      console.log('[WebSocket] 连接断开:', reason);
      setIsConnected(false);
      onDisconnect?.();
    });

    // 连接错误
    socket.on('connect_error', (error) => {
      console.error('[WebSocket] 连接错误:', error);
      onError?.(error);
    });

    // 接收通知
    socket.on('notification', (notification) => {
      console.log('[WebSocket] 收到通知:', notification);
      onNotification?.(notification);
    });

    // 接收消息
    socket.on('message', (message) => {
      console.log('[WebSocket] 收到消息:', message);
      onMessage?.(message);
    });

    // 用户上线
    socket.on('user:online', (data) => {
      console.log('[WebSocket] 用户上线:', data);
      setOnlineUsers((prev) => {
        if (!prev.find(u => u.user_id === data.userId)) {
          return [...prev, { user_id: data.userId }];
        }
        return prev;
      });
      onUserOnline?.(data.userId);
    });

    // 用户离线
    socket.on('user:offline', (data) => {
      console.log('[WebSocket] 用户离线:', data);
      setOnlineUsers((prev) => prev.filter(u => u.user_id !== data.userId));
      onUserOffline?.(data.userId);
    });

    // 消息已读
    socket.on('message:read', (data) => {
      console.log('[WebSocket] 消息已读:', data);
      onMessageRead?.(data);
    });

    // 在线用户列表
    socket.on('online_users', (users) => {
      console.log('[WebSocket] 在线用户列表:', users);
      setOnlineUsers(users);
      onOnlineUsers?.(users);
    });

    // 心跳响应
    socket.on('pong', () => {
      console.log('[WebSocket] 心跳响应');
    });

    // 启动心跳
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
    }
    heartbeatIntervalRef.current = setInterval(() => {
      if (socket.connected) {
        socket.emit('ping');
      }
    }, 30000); // 30秒心跳
  }, [userId, onConnect, onDisconnect, onError, onNotification, onMessage, onUserOnline, onUserOffline, onMessageRead, onOnlineUsers]);

  // 断开连接
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('[WebSocket] 主动断开连接');
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
    }
    
    if (reconnectTimeoutRef.current) {
      clearTimeout(reconnectTimeoutRef.current);
      reconnectTimeoutRef.current = null;
    }
    
    if (heartbeatIntervalRef.current) {
      clearInterval(heartbeatIntervalRef.current);
      heartbeatIntervalRef.current = null;
    }
  }, []);

  // 标记消息已读
  const markMessageAsRead = useCallback((messageType: string, messageId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message:read', { messageType, messageId });
    }
  }, []);

  // 标记通知已读
  const markNotificationAsRead = useCallback((notificationId: number) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('notification:read', { notificationId });
    }
  }, []);

  // 发送消息
  const sendMessage = useCallback((event: string, data: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit(event, data);
      return true;
    }
    console.warn('[WebSocket] 未连接，无法发送消息');
    return false;
  }, []);

  // 自动连接和清理
  useEffect(() => {
    if (userId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [userId, connect, disconnect]);

  return {
    isConnected,
    onlineUsers,
    socket: socketRef.current,
    connect,
    disconnect,
    markMessageAsRead,
    markNotificationAsRead,
    sendMessage,
  };
}
