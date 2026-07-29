import { Server as SocketIOServer } from 'socket.io';

/**
 * Socket.IO 服务器配置
 *
 * 注意：这是一个独立的 WebSocket 服务器实现。
 * 在生产环境中，您应该：
 * 1. 将此服务器作为独立进程运行
 * 2. 使用 Redis 作为适配器实现多实例支持
 * 3. 实现更完善的身份验证和权限控制
 */

export interface SocketServerOptions {
  port?: number;
  cors?: {
    origin: string | string[];
    credentials?: boolean;
  };
}

export interface OnlineUser {
  userId: number;
  socketId: string;
  username?: string;
  avatar?: string;
  status: 'online' | 'busy' | 'away';
  lastSeen: Date;
}

export interface NotificationPayload {
  id: number;
  userId: number;
  title: string;
  content: string;
  type: 'info' | 'success' | 'warning' | 'error';
  actionUrl?: string;
  metadata?: Record<string, any>;
  createdAt: Date;
}

export interface MessageReadPayload {
  messageType: string;
  messageId: string;
  userId: number;
  readAt: Date;
}

class SocketServer {
  private io: SocketIOServer | null = null;
  private onlineUsers: Map<number, OnlineUser> = new Map();
  private port: number = 6000;
  private heartbeatInterval: NodeJS.Timeout | null = null;

  /**
   * 初始化 Socket.IO 服务器
   */
  init(options: SocketServerOptions = {}) {
    const {
      port = 6000,
      cors = {
        origin: [
          process.env.NEXT_PUBLIC_BASE_URL || 'http://localhost:5000',
          'http://localhost:3000',
        ],
        credentials: true,
      },
    } = options;

    this.port = port;

    // 创建 Socket.IO 服务器
    this.io = new SocketIOServer(port, {
      cors,
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    this.setupEventHandlers();
    this.startHeartbeat();

  }

  /**
   * 设置事件处理器
   */
  private setupEventHandlers() {
    if (!this.io) return;

    this.io.on('connection', (socket) => {

      // 用户加入
      socket.on('join', (data: { userId: number; username?: string; avatar?: string }) => {
        const { userId, username, avatar } = data;

        if (!userId) {
          console.warn('[Socket Server] 用户ID为空，拒绝加入');
          return;
        }

        // 记录在线用户
        this.onlineUsers.set(userId, {
          userId,
          socketId: socket.id,
          username,
          avatar,
          status: 'online',
          lastSeen: new Date(),
        });

        // 加入用户专属房间
        socket.join(`user:${userId}`);

        // 广播用户上线
        this.io?.emit('user:online', { userId, username });

        // 发送在线用户列表
        this.sendOnlineUsersList();

      });

      // 用户状态更新
      socket.on('user:status', (data: { status: 'online' | 'busy' | 'away' }) => {
        const user = this.getUserBySocketId(socket.id);
        if (user) {
          user.status = data.status;
          user.lastSeen = new Date();
          this.onlineUsers.set(user.userId, user);

          // 广播状态更新
          this.io?.emit('user:status:update', {
            userId: user.userId,
            status: user.status,
          });

        }
      });

      // 消息发送
      socket.on('message', (data: { to?: number; type: string; payload: any }) => {
        const { to, type, payload } = data;
        const sender = this.getUserBySocketId(socket.id);

        if (!sender) {
          console.warn('[Socket Server] 未找到发送者');
          return;
        }

        if (to) {
          // 私发消息
          this.io?.to(`user:${to}`).emit('message', {
            from: sender.userId,
            type,
            payload,
            timestamp: new Date(),
          });
        } else {
          // 广播消息
          socket.broadcast.emit('message', {
            from: sender.userId,
            type,
            payload,
            timestamp: new Date(),
          });
        }
      });

      // 消息已读
      socket.on('message:read', (data: { messageType: string; messageId: string }) => {
        const user = this.getUserBySocketId(socket.id);
        if (!user) return;

        // 广播消息已读
        this.io?.emit('message:read', {
          messageType: data.messageType,
          messageId: data.messageId,
          userId: user.userId,
          readAt: new Date(),
        });
      });

      // 通知已读
      socket.on('notification:read', (data: { notificationId: number }) => {
        const user = this.getUserBySocketId(socket.id);
        if (!user) return;

        // 广播通知已读（主要给发送方）
        this.io?.emit('notification:read', {
          notificationId: data.notificationId,
          userId: user.userId,
          readAt: new Date(),
        });

      });

      // 加入房间
      socket.on('room:join', (data: { roomId: string }) => {
        socket.join(data.roomId);
      });

      // 离开房间
      socket.on('room:leave', (data: { roomId: string }) => {
        socket.leave(data.roomId);
      });

      // 心跳响应
      socket.on('pong', () => {
        // 更新用户最后活跃时间
        const user = this.getUserBySocketId(socket.id);
        if (user) {
          user.lastSeen = new Date();
          this.onlineUsers.set(user.userId, user);
        }
      });

      // 断开连接
      socket.on('disconnect', (reason) => {
        const user = this.getUserBySocketId(socket.id);
        if (user) {
          // 从在线用户列表中移除
          this.onlineUsers.delete(user.userId);

          // 广播用户离线
          this.io?.emit('user:offline', { userId: user.userId });

          // 发送在线用户列表
          this.sendOnlineUsersList();

        } else {
        }
      });
    });
  }

  /**
   * 启动心跳检测
   */
  private startHeartbeat() {
    this.heartbeatInterval = setInterval(() => {
      if (!this.io) return;

      const now = new Date();
      const timeout = 60000; // 60秒超时

      // 检查超时用户
      for (const [userId, user] of this.onlineUsers.entries()) {
        const inactiveTime = now.getTime() - user.lastSeen.getTime();
        if (inactiveTime > timeout) {

          // 发送断开指令
          this.io.to(user.socketId).emit('disconnect');

          // 从在线列表中移除
          this.onlineUsers.delete(userId);

          // 广播用户离线
          this.io.emit('user:offline', { userId });
        }
      }

      // 发送心跳
      this.io.emit('ping', { timestamp: now });

      // 更新在线用户列表
      this.sendOnlineUsersList();
    }, 30000); // 每30秒检查一次
  }

  /**
   * 发送在线用户列表
   */
  private sendOnlineUsersList() {
    if (!this.io) return;

    const usersList = Array.from(this.onlineUsers.values()).map((user) => ({
      userId: user.userId,
      username: user.username,
      avatar: user.avatar,
      status: user.status,
    }));

    this.io.emit('online_users', usersList);
  }

  /**
   * 根据Socket ID获取用户
   */
  private getUserBySocketId(socketId: string): OnlineUser | undefined {
    for (const user of this.onlineUsers.values()) {
      if (user.socketId === socketId) {
        return user;
      }
    }
    return undefined;
  }

  /**
   * 发送通知给指定用户
   */
  sendNotification(userId: number, notification: NotificationPayload) {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit('notification', notification);
  }

  /**
   * 广播通知给所有用户
   */
  broadcastNotification(notification: NotificationPayload) {
    if (!this.io) return;

    this.io.emit('notification', notification);
  }

  /**
   * 发送消息给指定用户
   */
  sendMessageToUser(userId: number, message: any) {
    if (!this.io) return;

    this.io.to(`user:${userId}`).emit('message', message);
  }

  /**
   * 广播消息
   */
  broadcastMessage(message: any) {
    if (!this.io) return;

    this.io.emit('message', message);
  }

  /**
   * 获取在线用户列表
   */
  getOnlineUsers(): OnlineUser[] {
    return Array.from(this.onlineUsers.values());
  }

  /**
   * 检查用户是否在线
   */
  isUserOnline(userId: number): boolean {
    return this.onlineUsers.has(userId);
  }

  /**
   * 获取在线用户数量
   */
  getOnlineUserCount(): number {
    return this.onlineUsers.size;
  }

  /**
   * 关闭服务器
   */
  close() {
    if (this.heartbeatInterval) {
      clearInterval(this.heartbeatInterval);
      this.heartbeatInterval = null;
    }

    if (this.io) {
      this.io.close();
      this.io = null;
    }

  }
}

// 导出单例
export const socketServer = new SocketServer();

// 自动启动服务器（仅在非测试环境）
if (typeof window === 'undefined' && process.env.NODE_ENV !== 'test') {
  socketServer.init();
}
