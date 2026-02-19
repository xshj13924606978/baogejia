import { useEffect, useRef, useState, useCallback } from 'react';
import { io, Socket } from 'socket.io-client';

/**
 * useSocket Hook
 * 
 * 用于在 React 组件中建立和管理 WebSocket 连接
 */

export interface UseSocketOptions {
  userId?: number;
  username?: string;
  avatar?: string;
  autoConnect?: boolean;
  onConnect?: () => void;
  onDisconnect?: (reason: string) => void;
  onError?: (error: Error) => void;
  onMessage?: (message: any) => void;
  onNotification?: (notification: any) => void;
  onUserOnline?: (userId: number, username?: string) => void;
  onUserOffline?: (userId: number) => void;
  onUserStatusUpdate?: (userId: number, status: 'online' | 'busy' | 'away') => void;
  onMessageRead?: (data: { messageType: string; messageId: string; userId: number }) => void;
  onNotificationRead?: (data: { notificationId: number; userId: number }) => void;
  onOnlineUsers?: (users: Array<{ userId: number; username?: string; avatar?: string; status: 'online' | 'busy' | 'away' }>) => void;
}

export function useSocket(options: UseSocketOptions = {}) {
  const {
    userId,
    username,
    avatar,
    autoConnect = true,
    onConnect,
    onDisconnect,
    onError,
    onMessage,
    onNotification,
    onUserOnline,
    onUserOffline,
    onUserStatusUpdate,
    onMessageRead,
    onNotificationRead,
    onOnlineUsers,
  } = options;

  const [isConnected, setIsConnected] = useState(false);
  const [isConnecting, setIsConnecting] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<Array<{ userId: number; username?: string; avatar?: string; status: 'online' | 'busy' | 'away' }>>([]);
  const [connectionError, setConnectionError] = useState<Error | null>(null);

  const socketRef = useRef<Socket | null>(null);
  const reconnectTimeoutRef = useRef<NodeJS.Timeout | null>(null);
  const heartbeatIntervalRef = useRef<NodeJS.Timeout | null>(null);

  /**
   * 获取 WebSocket URL
   */
  const getWebSocketUrl = useCallback((): string => {
    if (typeof window === 'undefined') {
      return 'ws://localhost:6000';
    }

    const protocol = window.location.protocol === 'https:' ? 'wss:' : 'ws:';
    const hostname = window.location.hostname;
    const port = process.env.NEXT_PUBLIC_WS_PORT || '6000';

    return `${protocol}//${hostname}:${port}`;
  }, []);

  /**
   * 连接 WebSocket
   */
  const connect = useCallback(() => {
    if (socketRef.current?.connected) {
      console.log('[useSocket] 已经连接，跳过重复连接');
      return;
    }

    setIsConnecting(true);
    setConnectionError(null);

    const wsUrl = getWebSocketUrl();
    console.log('[useSocket] 正在连接到:', wsUrl);

    const socket = io(wsUrl, {
      transports: ['websocket', 'polling'],
      reconnection: true,
      reconnectionDelay: 1000,
      reconnectionDelayMax: 5000,
      reconnectionAttempts: 5,
      timeout: 10000,
    });

    socketRef.current = socket;

    // 连接成功
    socket.on('connect', () => {
      console.log('[useSocket] 连接成功:', socket.id);
      setIsConnected(true);
      setIsConnecting(false);
      setConnectionError(null);

      // 加入用户房间
      if (userId) {
        socket.emit('join', { userId, username, avatar });
      }

      onConnect?.();
    });

    // 连接断开
    socket.on('disconnect', (reason) => {
      console.log('[useSocket] 连接断开:', reason);
      setIsConnected(false);
      setIsConnecting(false);

      onDisconnect?.(reason);

      // 如果是服务器断开，尝试重连
      if (reason === 'io server disconnect') {
        socket.connect();
      }
    });

    // 连接错误
    socket.on('connect_error', (error) => {
      console.error('[useSocket] 连接错误:', error);
      setIsConnected(false);
      setIsConnecting(false);
      setConnectionError(error as Error);

      onError?.(error as Error);

      // 5秒后尝试重连
      if (!reconnectTimeoutRef.current) {
        reconnectTimeoutRef.current = setTimeout(() => {
          reconnectTimeoutRef.current = null;
          if (!socket.connected) {
            socket.connect();
          }
        }, 5000);
      }
    });

    // 接收消息
    socket.on('message', (message) => {
      console.log('[useSocket] 收到消息:', message);
      onMessage?.(message);
    });

    // 接收通知
    socket.on('notification', (notification) => {
      console.log('[useSocket] 收到通知:', notification);
      onNotification?.(notification);

      // 播放通知声音
      playNotificationSound();
    });

    // 用户上线
    socket.on('user:online', (data: { userId: number; username?: string }) => {
      console.log('[useSocket] 用户上线:', data);
      onUserOnline?.(data.userId, data.username);

      // 更新在线用户列表
      setOnlineUsers((prev) => {
        if (!prev.find(u => u.userId === data.userId)) {
          return [...prev, { userId: data.userId, username: data.username, status: 'online' }];
        }
        return prev;
      });
    });

    // 用户离线
    socket.on('user:offline', (data: { userId: number }) => {
      console.log('[useSocket] 用户离线:', data);
      onUserOffline?.(data.userId);

      // 更新在线用户列表
      setOnlineUsers((prev) => prev.filter(u => u.userId !== data.userId));
    });

    // 用户状态更新
    socket.on('user:status:update', (data: { userId: number; status: 'online' | 'busy' | 'away' }) => {
      console.log('[useSocket] 用户状态更新:', data);
      onUserStatusUpdate?.(data.userId, data.status);

      // 更新在线用户列表
      setOnlineUsers((prev) =>
        prev.map(u =>
          u.userId === data.userId ? { ...u, status: data.status } : u
        )
      );
    });

    // 消息已读
    socket.on('message:read', (data: { messageType: string; messageId: string; userId: number; readAt: Date }) => {
      console.log('[useSocket] 消息已读:', data);
      onMessageRead?.(data);
    });

    // 通知已读
    socket.on('notification:read', (data: { notificationId: number; userId: number; readAt: Date }) => {
      console.log('[useSocket] 通知已读:', data);
      onNotificationRead?.(data);
    });

    // 在线用户列表
    socket.on('online_users', (users: Array<{ userId: number; username?: string; avatar?: string; status: 'online' | 'busy' | 'away' }>) => {
      console.log('[useSocket] 在线用户列表:', users);
      setOnlineUsers(users);
      onOnlineUsers?.(users);
    });

    // 心跳响应
    socket.on('ping', (data: { timestamp: Date }) => {
      socket.emit('pong', { timestamp: new Date() });
    });
  }, [userId, username, avatar, getWebSocketUrl, onConnect, onDisconnect, onError, onMessage, onNotification, onUserOnline, onUserOffline, onUserStatusUpdate, onMessageRead, onNotificationRead, onOnlineUsers]);

  /**
   * 断开连接
   */
  const disconnect = useCallback(() => {
    if (socketRef.current) {
      console.log('[useSocket] 主动断开连接');
      socketRef.current.disconnect();
      socketRef.current = null;
      setIsConnected(false);
      setIsConnecting(false);
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

  /**
   * 发送消息
   */
  const sendMessage = useCallback((type: string, payload: any, to?: number) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message', { type, payload, to });
      return true;
    }
    console.warn('[useSocket] 未连接，无法发送消息');
    return false;
  }, []);

  /**
   * 发送通知（仅用于测试，实际应该通过API）
   */
  const sendNotification = useCallback((notification: any) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('notification', notification);
      return true;
    }
    return false;
  }, []);

  /**
   * 标记消息已读
   */
  const markMessageAsRead = useCallback((messageType: string, messageId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('message:read', { messageType, messageId });
      return true;
    }
    return false;
  }, []);

  /**
   * 标记通知已读
   */
  const markNotificationAsRead = useCallback((notificationId: number) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('notification:read', { notificationId });
      return true;
    }
    return false;
  }, []);

  /**
   * 更新用户状态
   */
  const updateUserStatus = useCallback((status: 'online' | 'busy' | 'away') => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('user:status', { status });
      return true;
    }
    return false;
  }, []);

  /**
   * 加入房间
   */
  const joinRoom = useCallback((roomId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('room:join', { roomId });
      return true;
    }
    return false;
  }, []);

  /**
   * 离开房间
   */
  const leaveRoom = useCallback((roomId: string) => {
    if (socketRef.current?.connected) {
      socketRef.current.emit('room:leave', { roomId });
      return true;
    }
    return false;
  }, []);

  /**
   * 播放通知声音
   */
  const playNotificationSound = useCallback(() => {
    try {
      // 使用 Web Audio API 播放简单的提示音
      const audioContext = new (window.AudioContext || (window as any).webkitAudioContext)();
      const oscillator = audioContext.createOscillator();
      const gainNode = audioContext.createGain();

      oscillator.connect(gainNode);
      gainNode.connect(audioContext.destination);

      oscillator.frequency.value = 800;
      oscillator.type = 'sine';

      gainNode.gain.setValueAtTime(0.3, audioContext.currentTime);
      gainNode.gain.exponentialRampToValueAtTime(0.01, audioContext.currentTime + 0.5);

      oscillator.start(audioContext.currentTime);
      oscillator.stop(audioContext.currentTime + 0.5);
    } catch (error) {
      console.error('[useSocket] 播放通知声音失败:', error);
    }
  }, []);

  /**
   * 自动连接
   */
  useEffect(() => {
    if (autoConnect && userId) {
      connect();
    }

    return () => {
      disconnect();
    };
  }, [autoConnect, userId, connect, disconnect]);

  return {
    isConnected,
    isConnecting,
    onlineUsers,
    connectionError,
    connect,
    disconnect,
    sendMessage,
    sendNotification,
    markMessageAsRead,
    markNotificationAsRead,
    updateUserStatus,
    joinRoom,
    leaveRoom,
  };
}

export default useSocket;
