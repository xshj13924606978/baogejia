import { createServer } from 'http';
import { Server as SocketIOServer } from 'socket.io';

// 全局变量，用于存储 WebSocket 服务器实例
let io: SocketIOServer | null = null;
const onlineUsers = new Map<number, string>(); // userId -> socketId

// 获取或创建 WebSocket 服务器
export function getWebSocketServer() {
  if (!io) {
    const httpServer = createServer();
    
    io = new SocketIOServer(httpServer, {
      cors: {
        origin: process.env.NEXT_PUBLIC_SITE_URL || 'http://localhost:5000',
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['websocket', 'polling'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // 处理连接
    io.on('connection', async (socket) => {
      console.log('[WebSocket] 客户端连接:', socket.id);
      
      const userId = socket.handshake.query.userId as string;
      
      if (!userId) {
        console.warn('[WebSocket] 连接缺少 userId，断开连接');
        socket.disconnect();
        return;
      }

      // 记录用户在线状态（模拟）
      onlineUsers.set(parseInt(userId), socket.id);

      // 广播用户上线
      io?.emit('user:online', { userId: parseInt(userId) });
      
      // 发送给当前用户：在线用户列表
      const onlineUserList = Array.from(onlineUsers.keys()).map(uid => ({
        user_id: uid,
        username: `用户${uid}`
      }));
      
      socket.emit('online_users', onlineUserList);

      // 监听消息已读事件
      socket.on('message:read', async (data: { messageType: string; messageId: string }) => {
        try {
          const { messageType, messageId } = data;
          console.log(`[WebSocket] 消息已读: ${messageType}:${messageId}`);
          
          // 通知其他用户（如聊天场景）
          socket.broadcast.emit('message:read', {
            userId: parseInt(userId),
            messageType,
            messageId,
          });
        } catch (error) {
          console.error('[WebSocket] 消息已读处理失败:', error);
        }
      });

      // 监听通知已读事件
      socket.on('notification:read', async (data: { notificationId: number }) => {
        try {
          const { notificationId } = data;
          console.log(`[WebSocket] 通知已读: ${notificationId}`);
          // 这里可以更新数据库中的通知已读状态
        } catch (error) {
          console.error('[WebSocket] 通知已读处理失败:', error);
        }
      });

      // 监听心跳
      socket.on('ping', () => {
        socket.emit('pong');
        console.log(`[WebSocket] 心跳: ${userId}`);
      });

      // 监听断开连接
      socket.on('disconnect', async () => {
        console.log('[WebSocket] 客户端断开:', socket.id, 'userId:', userId);
        
        // 移除在线状态
        onlineUsers.delete(parseInt(userId));

        // 广播用户离线
        io?.emit('user:offline', { userId: parseInt(userId) });
      });

      // 监听错误
      socket.on('error', (error) => {
        console.error('[WebSocket] Socket 错误:', error);
      });
    });

    // 启动 HTTP 服务器（WebSocket 会绑定到这个服务器）
    const wsPort = process.env.WS_PORT || 6000;
    httpServer.listen(wsPort, () => {
      console.log(`[WebSocket] 服务器运行在端口 ${wsPort}`);
    });
  }

  return io;
}

// 推送通知给指定用户
export async function pushNotification(userId: number, notification: any) {
  const server = getWebSocketServer();
  
  try {
    // 模拟通知数据
    const savedNotification = {
      id: Date.now(),
      user_id: userId,
      title: notification.title,
      content: notification.content,
      type: notification.type || 'info',
      is_read: false,
      created_at: new Date().toISOString(),
    };

    // 推送到客户端
    server.to(`user_${userId}`).emit('notification', savedNotification);
    
    return savedNotification;
  } catch (error) {
    console.error('[WebSocket] 推送通知失败:', error);
    throw error;
  }
}

// 推送消息给指定用户
export async function pushMessage(userId: number, messageType: string, message: any) {
  const server = getWebSocketServer();
  
  try {
    server.to(`user_${userId}`).emit('message', {
      type: messageType,
      ...message,
    });
    
    return { success: true };
  } catch (error) {
    console.error('[WebSocket] 推送消息失败:', error);
    throw error;
  }
}

// 广播消息给所有在线用户
export function broadcastMessage(event: string, data: any) {
  const server = getWebSocketServer();
  server.emit(event, data);
}

// 获取在线用户数
export function getOnlineUsersCount(): number {
  return onlineUsers.size || 0;
}
