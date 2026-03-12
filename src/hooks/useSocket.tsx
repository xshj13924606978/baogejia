'use client';

import { useEffect, useRef, useState, useCallback } from "react";
import io, { Socket } from "socket.io-client";
import { useUser } from "@/contexts/UserContext";

// 类型定义
interface OnlineUser {
  userId: string | number;
  username?: string;
  status?: 'online' | 'busy' | 'away' | 'offline';
  avatar?: string;
}

export function useSocket(options?: { userId?: number }) {
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<OnlineUser[]>([]);
  const [onlineCount, setOnlineCount] = useState(0);
  const [error, setError] = useState<string | null>(null);
  
  const { user } = useUser();
  const socketRef = useRef<Socket | null>(null);
  const reconnectAttemptsRef = useRef(0);
  const maxReconnectAttempts = 5;

  // 连接 Socket
  const connect = useCallback(() => {
    if (socketRef.current?.connected) return;

    try {
      const url = process.env.NEXT_PUBLIC_APP_URL || 
        (typeof window !== "undefined" ? window.location.origin : "http://localhost:5000");

      console.log("[useSocket] 正在连接到:", url);

      const socket = io(url, {
        path: "/api/socket",
        transports: ["polling", "websocket"],
        reconnectionAttempts: maxReconnectAttempts,
        reconnectionDelay: 1000,
        timeout: 20000,
      });

      socketRef.current = socket;
      setSocket(socket);

      socket.on("connect", () => {
        console.log("[useSocket] 连接成功，ID:", socket.id);
        setIsConnected(true);
        setError(null);
        reconnectAttemptsRef.current = 0;
        
        // 如果有用户，发送认证
        if (user?.id) {
          console.log("[useSocket] 发送认证，用户ID:", user.id);
          socket.emit("authenticate", user.id);
        } else {
          console.log("[useSocket] 等待用户登录...");
        }
      });

      socket.on("connect_error", (err) => {
        console.error("[useSocket] 连接错误:", err.message);
        setError(err.message);
        reconnectAttemptsRef.current++;
        
        if (reconnectAttemptsRef.current >= maxReconnectAttempts) {
          console.log("[useSocket] 达到最大重连次数");
          socket.disconnect();
        }
      });

      socket.on("disconnect", (reason) => {
        console.log("[useSocket] 断开连接:", reason);
        setIsConnected(false);
      });

      // 用户状态事件
      socket.on("users:online", (data) => {
        // 将字符串数组转换为对象数组
        const users = data.userIds.map((id: string) => ({
          userId: id,
          status: 'online' as const,
        }));
        setOnlineUsers(users);
        setOnlineCount(data.count);
      });

      socket.on("user:online", (data) => {
        setOnlineCount(data.onlineCount);
        setOnlineUsers(prev => {
          // 检查是否已存在
          if (prev.find(u => u.userId === data.userId)) {
            return prev;
          }
          return [...prev, { userId: data.userId, status: 'online' }];
        });
      });

      socket.on("user:offline", (data) => {
        setOnlineCount(data.onlineCount);
        setOnlineUsers(prev => prev.filter(user => user.userId !== data.userId));
      });

      // 错误处理
      socket.on("error", (data) => {
        console.error("[useSocket] 服务器错误:", data);
        setError(data.message);
      });

    } catch (err: any) {
      console.error("[useSocket] 连接失败:", err);
      setError(err.message);
    }
  }, [user]);

  // 当用户变化时重新认证
  useEffect(() => {
    if (socketRef.current?.connected && user?.id) {
      console.log("[useSocket] 用户已登录，发送认证:", user.id);
      socketRef.current.emit("authenticate", user.id);
    }
  }, [user]);

  // 自动连接
  useEffect(() => {
    connect();

    return () => {
      if (socketRef.current) {
        socketRef.current.disconnect();
        socketRef.current = null;
      }
    };
  }, [connect]);

  // 发送消息
  const emit = useCallback((event: string, ...args: any[]) => {
    if (!socketRef.current?.connected) {
      console.warn("[useSocket] 无法发送消息: 未连接");
      return false;
    }
    socketRef.current.emit(event, ...args);
    return true;
  }, []);

  // 监听事件
  const on = useCallback((event: string, callback: (...args: any[]) => void) => {
    socketRef.current?.on(event, callback);
    return () => socketRef.current?.off(event, callback);
  }, []);

  const off = useCallback((event: string, callback?: (...args: any[]) => void) => {
    socketRef.current?.off(event, callback);
  }, []);

  // 更新用户状态
  const updateUserStatus = useCallback((status: 'online' | 'busy' | 'away') => {
    if (!socketRef.current?.connected) {
      console.warn("[useSocket] 无法更新状态: 未连接");
      return;
    }
    socketRef.current.emit("user:status", { status });
  }, []);

  return {
    socket: socketRef.current,
    isConnected,
    onlineUsers,
    onlineCount,
    error,
    emit,
    on,
    off,
    updateUserStatus,
  };
}
