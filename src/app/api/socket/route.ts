import { NextRequest, NextResponse } from 'next/server';
import { Server as SocketIOServer } from 'socket.io';
import { createClient } from '@supabase/supabase-js';

declare global {
  var _socketServer: SocketIOServer | null;
  var _httpServer: any;
}

// 在线用户存储（内存中）
const onlineUsers = new Map<string, { socketId: string; lastSeen: Date }>();

// Supabase 客户端
const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
const supabase = createClient(supabaseUrl, supabaseKey);

export async function GET(req: NextRequest) {
  // 如果服务器已存在，返回状态
  if (global._socketServer) {
    return NextResponse.json({
      success: true,
      message: 'Socket.IO server already running',
      stats: {
        onlineUsers: onlineUsers.size,
        connections: global._socketServer.engine?.clientsCount || 0,
      },
    });
  }

  try {
    const http = await import('http');

    // 创建 HTTP 服务器
    if (!global._httpServer) {
      global._httpServer = http.createServer((req, res) => {
        res.writeHead(200, {
          'Content-Type': 'application/json',
          'Access-Control-Allow-Origin': '*',
        });
        res.end(
          JSON.stringify({
            status: 'ok',
            message: 'Socket.IO HTTP Server',
            onlineUsers: onlineUsers.size,
          })
        );
      });

      await new Promise<void>((resolve) => {
        global._httpServer.listen(0, () => {
          console.log(
            '[Socket.IO] HTTP server listening on port:',
            global._httpServer.address()?.port
          );
          resolve();
        });
      });
    }

    // 初始化 Socket.IO
    const io = new SocketIOServer(global._httpServer, {
      path: '/api/socket',
      cors: {
        origin: [
          'http://localhost:5000',
          'http://localhost:3000',
          process.env.NEXT_PUBLIC_APP_URL || '*',
        ].filter(Boolean),
        methods: ['GET', 'POST'],
        credentials: true,
      },
      transports: ['polling', 'websocket'],
      pingTimeout: 60000,
      pingInterval: 25000,
    });

    // 连接处理
    io.on('connection', (socket) => {
      console.log('[Socket.IO] Client connected:', socket.id);

      // 处理认证 - 接收 UUID 字符串
      socket.on('authenticate', async (userId: string) => {
        try {
          console.log('[Socket.IO] User authenticated:', userId);

          // 验证 userId 格式（应该是 UUID）
          const uuidRegex =
            /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
          if (!uuidRegex.test(userId)) {
            console.log('[Socket.IO] 无效的 UUID 格式:', userId);
            socket.emit('error', { message: 'Invalid user ID format' });
            return;
          }

          socket.data.userId = userId;

          // 更新在线状态（内存中）
          onlineUsers.set(userId, { socketId: socket.id, lastSeen: new Date() });

          // 广播上线
          socket.broadcast.emit('user:online', {
            userId,
            onlineCount: onlineUsers.size,
          });

          // 发送在线列表
          socket.emit('users:online', {
            userIds: Array.from(onlineUsers.keys()),
            count: onlineUsers.size,
          });

          // 尝试更新数据库（使用 UUID）
          try {
            const { error } = await supabase
              .from('users')
              .update({
                last_login: new Date().toISOString(),
              })
              .eq('id', userId);

            if (error) {
              console.log('[Socket.IO] 数据库更新错误:', error.message);
            }
          } catch (dbError) {
            console.log('[Socket.IO] 数据库更新失败:', dbError);
          }
        } catch (error) {
          console.error('[Socket.IO] Auth error:', error);
          socket.emit('error', { message: 'Authentication failed' });
        }
      });

      // 处理心跳
      socket.on('ping', (callback) => {
        if (typeof callback === 'function') {
          callback({
            time: Date.now(),
            onlineUsers: onlineUsers.size,
          });
        }
      });

      // 处理断开连接
      socket.on('disconnect', async () => {
        console.log('[Socket.IO] Client disconnected:', socket.id);

        if (socket.data.userId) {
          const userId = socket.data.userId;
          onlineUsers.delete(userId);

          // 广播下线
          socket.broadcast.emit('user:offline', {
            userId,
            onlineCount: onlineUsers.size,
          });

          // 尝试更新数据库
          try {
            await supabase
              .from('users')
              .update({
                last_login: new Date().toISOString(),
              })
              .eq('id', userId);
          } catch (dbError) {
            // 忽略数据库错误
          }
        }
      });

      // 处理错误
      socket.on('error', (error) => {
        console.error('[Socket.IO] Socket error:', error);
      });
    });

    global._socketServer = io;
    console.log('[Socket.IO] Server initialized successfully');

    return NextResponse.json({
      success: true,
      message: 'Socket.IO server initialized',
      port: global._httpServer.address()?.port,
    });
  } catch (error: any) {
    console.error('[Socket.IO] Init error:', error);
    return NextResponse.json(
      { error: 'Failed to initialize Socket.IO', details: error?.message || String(error) },
      { status: 500 }
    );
  }
}

export async function POST() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function PUT() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}

export async function DELETE() {
  return NextResponse.json({ error: 'Method not allowed' }, { status: 405 });
}