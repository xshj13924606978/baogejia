import { socketClient } from './socket-client';

// 用于兼容现有的 websocket 相关组件
export class WebSocketAdapter {
  private static instance: WebSocketAdapter;
  private listeners: Map<string, Set<Function>> = new Map();
  private connected = false;

  private constructor() {
    // 初始化时连接 Socket.IO
    socketClient.connect().catch(() => {
      console.warn('[WebSocketAdapter] Initial connection failed');
    });
  }

  static getInstance() {
    if (!WebSocketAdapter.instance) {
      WebSocketAdapter.instance = new WebSocketAdapter();
    }
    return WebSocketAdapter.instance;
  }

  // 连接
  connect(userId?: string) {
    socketClient.connect(userId).then(() => {
      this.connected = true;
    });
  }

  // 断开连接
  disconnect() {
    socketClient.disconnect();
    this.connected = false;
    this.listeners.clear();
  }

  // 发送消息
  send(event: string, data: any) {
    return socketClient.emit(event as any, data);
  }

  // 监听事件
  on(event: string, callback: Function) {
    if (!this.listeners.has(event)) {
      this.listeners.set(event, new Set());
    }
    this.listeners.get(event)?.add(callback);
    
    return socketClient.on(event as any, callback as any);
  }

  // 移除监听
  off(event: string, callback?: Function) {
    if (callback) {
      this.listeners.get(event)?.delete(callback);
      socketClient.off(event as any, callback as any);
    } else {
      this.listeners.delete(event);
      socketClient.off(event as any);
    }
  }

  // 检查是否已连接
  isConnected() {
    return socketClient.isConnected() || this.connected;
  }

  // 获取当前用户ID
  getUserId() {
    return socketClient.getUserId();
  }
}

// 导出单例实例
export const websocket = WebSocketAdapter.getInstance();

// 导出兼容旧的 API
export const websocketService = {
  connect: (userId?: string) => websocket.connect(userId),
  disconnect: () => websocket.disconnect(),
  send: (event: string, data: any) => websocket.send(event, data),
  on: (event: string, callback: Function) => websocket.on(event, callback),
  off: (event: string, callback?: Function) => websocket.off(event, callback),
  isConnected: () => websocket.isConnected(),
  getUserId: () => websocket.getUserId()
};