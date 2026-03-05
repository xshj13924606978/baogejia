'use client';

import { useEffect, useRef, useState, useCallback } from "react";
import io, { Socket } from "socket.io-client";
import { useUser } from "@/contexts/UserContext";

export function useSocket() {
  const [isConnected, setIsConnected] = useState(false);
  const [socket, setSocket] = useState<Socket | null>(null);
  const [onlineUsers, setOnlineUsers] = useState<string[]>([]);
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
        setOnlineUsers(data.userIds);
        setOnlineCount(data.count);
      });

      socket.on("user:online", (data) => {
        setOnlineCount(data.onlineCount);
        setOnlineUsers(prev => [...new Set([...prev, data.userId])]);
      });

      socket.on("user:offline", (data) => {
        setOnlineCount(data.onlineCount);
        setOnlineUsers(prev => prev.filter(id => id !== data.userId));
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

  return {
    socket: socketRef.current,
    isConnected,
    onlineUsers,
    onlineCount,
    error,
    emit,
    on,
    off,
  };
}
