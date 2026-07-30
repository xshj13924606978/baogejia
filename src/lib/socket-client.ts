import { io, Socket } from 'socket.io-client';

// 类型定义
interface OnlineUser {
  userId: string | number;
  username?: string;
  status?: 'online' | 'busy' | 'away' | 'offline';
  avatar?: string;
}

interface Message {
  id?: number;
  tempId?: string;
  content: string;
  type?: string;
  userId?: string;
  user?: {
    id: number;
    name: string;
    email: string;
  };
  created_at?: string;
}

interface SocketEvents {
  // 连接事件
  connect: () => void;
  disconnect: (reason: string) => void;
  connect_error: (error: Error) => void;

  // 认证事件
  authenticate: (token: string) => void;

  // 用户状态事件
  'user:online': (data: { userId: string; onlineCount: number }) => void;
  'user:offline': (data: { userId: string; onlineCount: number }) => void;
  'users:online': (data: { userIds: string[]; count: number }) => void;
  'user:joined': (data: {
    userId: string;
    socketId: string;
    conversationId: number | string;
  }) => void;
  'user:left': (data: {
    userId: string;
    socketId: string;
    conversationId: number | string;
  }) => void;

  // 对话房间事件
  'join:conversation': (conversationId: number | string) => void;
  'leave:conversation': (conversationId: number | string) => void;

  // 消息事件
  'message:send': (data: {
    conversationId: number | string;
    message: Message;
    tempId?: string;
  }) => void;
  'message:sent': (data: Message & { tempId?: string }) => void;
  'message:received': (data: Message & { tempId?: string }) => void;
  'message:read': (data: {
    messageId: string;
    userId: string;
    conversationId: number | string;
    readAt: string;
  }) => void;
  'message:error': (data: { error: string; tempId?: string }) => void;

  // 输入状态事件
  'typing:start': (data: { conversationId: number | string; userName?: string }) => void;
  'typing:stop': (data: { conversationId: number | string }) => void;
  'typing:started': (data: {
    userId: string;
    userName: string;
    conversationId: number | string;
    timestamp: string;
  }) => void;
  'typing:stopped': (data: {
    userId: string;
    conversationId: number | string;
    timestamp: string;
  }) => void;

  // 心跳事件
  ping: (callback: (data: { time: number; onlineUsers: number }) => void) => void;

  // 错误事件
  error: (data: { message: string }) => void;
}

class SocketClient {
  private socket: Socket | null = null;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 5;
  private reconnectDelay = 1000;
  private listeners: Map<string, Set<Function>> = new Map();
  private connectionPromise: Promise<Socket> | null = null;
  private userId: string | null = null;

  // 连接 Socket
  connect(userId?: string): Promise<Socket> {
    if (this.connectionPromise) {
      return this.connectionPromise;
    }

    this.connectionPromise = new Promise((resolve, reject) => {
      try {
        const socketUrl =
          process.env.NEXT_PUBLIC_APP_URL ||
          (typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000');


        this.socket = io(socketUrl, {
          path: '/api/socket',
          transports: ['polling', 'websocket'],
          reconnectionAttempts: this.maxReconnectAttempts,
          reconnectionDelay: this.reconnectDelay,
          reconnectionDelayMax: 5000,
          timeout: 20000,
          autoConnect: true,
          forceNew: true,
        });

        // 设置连接成功处理
        this.socket.on('connect', () => {
          this.reconnectAttempts = 0;

          // 发送认证信息（使用 session token）
          if (userId) {
            this.userId = userId;
            const token = typeof window !== 'undefined' ? localStorage.getItem('session_token') : null;
            if (token) {
              this.socket?.emit('authenticate', token);
            }
          }

          // 触发所有连接监听器
          this.emitToListeners('connect');
          resolve(this.socket!);
        });

        // 设置连接错误处理
        this.socket.on('connect_error', (error) => {
          console.error('[SocketClient] Connection error:', error.message);
          this.reconnectAttempts++;

          if (this.reconnectAttempts >= this.maxReconnectAttempts) {
            this.disconnect();
            reject(error);
          }
        });

        // 设置断开连接处理
        this.socket.on('disconnect', (reason) => {
          this.connectionPromise = null;

          if (reason === 'io server disconnect') {
            // 服务器主动断开，尝试重连
            setTimeout(() => {
              this.socket?.connect();
            }, this.reconnectDelay);
          }

          this.emitToListeners('disconnect', reason);
        });

        // 转发所有事件到监听器
        this.setupEventForwarding();
      } catch (error) {
        console.error('[SocketClient] Connection setup error:', error);
        this.connectionPromise = null;
        reject(error);
      }
    });

    return this.connectionPromise;
  }

  // 设置事件转发
  private setupEventForwarding() {
    if (!this.socket) return;

    // 定义需要转发的系统事件
    const systemEvents = [
      'connect',
      'disconnect',
      'connect_error',
      'user:online',
      'user:offline',
      'users:online',
      'user:joined',
      'user:left',
      'message:sent',
      'message:received',
      'message:read',
      'message:error',
      'typing:started',
      'typing:stopped',
      'error',
    ];

    systemEvents.forEach((event) => {
      this.socket!.on(event, (...args) => {
        this.emitToListeners(event, ...args);
      });
    });
  }

  // 触发监听器
  private emitToListeners(event: string, ...args: any[]) {
    const callbacks = this.listeners.get(event);
    if (callbacks) {
      callbacks.forEach((callback) => {
        try {
          callback(...args);
        } catch (error) {
          console.error(`[SocketClient] Error in ${event} listener:`, error);
        }
      });
    }
  }

  // 断开连接
  disconnect() {
    if (this.socket) {
      this.socket.disconnect();
      this.socket = null;
    }
    this.connectionPromise = null;
    this.userId = null;
    this.reconnectAttempts = 0;
  }

  // 获取 Socket 实例
  getSocket() {
    return this.socket;
  }

  // 检查是否已连接
  isConnected() {
    return this.socket?.connected || false;
  }

  // 获取当前用户ID
  getUserId() {
    return this.userId;
  }

  // 通用发送方法
  emit<K extends keyof SocketEvents>(event: K, ...args: Parameters<SocketEvents[K]>): boolean {
    if (!this.socket?.connected) {
      console.warn(`[SocketClient] Cannot emit ${event}: not connected`);
      return false;
    }

    this.socket.emit(event as string, ...args);
    return true;
  }

  // 通用监听方法
  on<K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]): () => void {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }

    this.listeners.get(event)!.add(callback as Function);

    // 返回取消监听的函数
    return () => {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback as Function);
        if (callbacks.size === 0) {
          this.listeners.delete(event);
        }
      }
    };
  }

  // 移除监听
  off<K extends keyof SocketEvents>(event: K, callback?: SocketEvents[K]) {
    if (callback) {
      const callbacks = this.listeners.get(event);
      if (callbacks) {
        callbacks.delete(callback as Function);
        if (callbacks.size === 0) {
          this.listeners.delete(event);
        }
      }
    } else {
      this.listeners.delete(event);
    }
  }

  // 加入对话房间
  joinConversation(conversationId: number | string) {
    return this.emit('join:conversation', conversationId);
  }

  // 离开对话房间
  leaveConversation(conversationId: number | string) {
    return this.emit('leave:conversation', conversationId);
  }

  // 发送消息
  sendMessage(conversationId: number | string, message: Message, tempId?: string) {
    return this.emit('message:send', { conversationId, message, tempId });
  }

  // 标记消息已读
  markMessageRead(messageId: string, conversationId: number | string) {
    if (!this.userId) return false;
    return this.emit('message:read', {
      messageId,
      userId: this.userId,
      conversationId,
      readAt: new Date().toISOString(),
    });
  }

  // 开始输入
  startTyping(conversationId: number | string, userName?: string) {
    return this.emit('typing:start', { conversationId, userName });
  }

  // 停止输入
  stopTyping(conversationId: number | string) {
    return this.emit('typing:stop', { conversationId });
  }

  // 发送心跳
  ping(): Promise<{ time: number; onlineUsers: number }> {
    return new Promise((resolve) => {
      this.emit('ping', (data: { time: number; onlineUsers: number }) => {
        resolve(data);
      });
    });
  }
}

// 创建单例实例
export const socketClient = new SocketClient();

// React Hook
import { useState, useEffect, useCallback, useRef } from 'react';

export function useSocket(userId?: string) {
  const [isConnected, setIsConnected] = useState(false);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const socketRef = useRef(socketClient);

  useEffect(() => {
    const client = socketRef.current;

    // 连接 Socket
    client.connect(userId).catch((error) => {
      console.error('Failed to connect socket:', error);
    });

    // 设置连接状态监听
    const unsubscribeConnect = client.on('connect', () => {
      setIsConnected(true);
    });

    const unsubscribeDisconnect = client.on('disconnect', () => {
      setIsConnected(false);
    });

    // 设置在线用户监听
    const unsubscribeUsersOnline = client.on('users:online', (data) => {
      // 将字符串数组转换为对象数组
      const users = data.userIds.map((id: string) => ({
        userId: id,
        status: 'online' as const,
      }));
      setOnlineUsers(users);
      setOnlineCount(data.count);
    });

    const unsubscribeUserOnline = client.on('user:online', (data) => {
      setOnlineCount(data.onlineCount);
      setOnlineUsers((prev) => {
        // 检查是否已存在
        if (prev.find((u) => u.userId === data.userId)) {
          return prev;
        }
        return [...prev, { userId: data.userId, status: 'online' }];
      });
    });

    const unsubscribeUserOffline = client.on('user:offline', (data) => {
      setOnlineCount(data.onlineCount);
      setOnlineUsers((prev) => prev.filter((user) => user.userId !== data.userId));
    });

    // 清理函数
    return () => {
      unsubscribeConnect();
      unsubscribeDisconnect();
      unsubscribeUsersOnline();
      unsubscribeUserOnline();
      unsubscribeUserOffline();

      // 注意：不要断开连接，保持单例
    };
  }, [userId]);

  // 包装方法
  const joinConversation = useCallback((conversationId: number | string) => {
    return socketRef.current.joinConversation(conversationId);
  }, []);

  const leaveConversation = useCallback((conversationId: number | string) => {
    return socketRef.current.leaveConversation(conversationId);
  }, []);

  const sendMessage = useCallback(
    (conversationId: number | string, message: Message, tempId?: string) => {
      return socketRef.current.sendMessage(conversationId, message, tempId);
    },
    []
  );

  const markMessageRead = useCallback((messageId: string, conversationId: number | string) => {
    return socketRef.current.markMessageRead(messageId, conversationId);
  }, []);

  const startTyping = useCallback((conversationId: number | string, userName?: string) => {
    return socketRef.current.startTyping(conversationId, userName);
  }, []);

  const stopTyping = useCallback((conversationId: number | string) => {
    return socketRef.current.stopTyping(conversationId);
  }, []);

  const ping = useCallback(() => {
    return socketRef.current.ping();
  }, []);

  const on = useCallback(<K extends keyof SocketEvents>(event: K, callback: SocketEvents[K]) => {
    return socketRef.current.on(event, callback);
  }, []);

  const off = useCallback(<K extends keyof SocketEvents>(event: K, callback?: SocketEvents[K]) => {
    return socketRef.current.off(event, callback);
  }, []);

  return {
    socket: socketRef.current.getSocket(),
    isConnected,
    onlineUsers,
    onlineCount,
    joinConversation,
    leaveConversation,
    sendMessage,
    markMessageRead,
    startTyping,
    stopTyping,
    ping,
    on,
    off,
  };
}
