# 实时通信功能实现文档

## 概述

本文档描述了"报个价"项目中实现的实时通信功能，包括 WebSocket 连接、在线状态显示、消息已读回执和实时通知推送。

## 功能列表

### 1. WebSocket 连接 (Socket.IO)

**文件**: `src/lib/socket.ts`

**功能**:
- 基于 Socket.IO 的 WebSocket 服务器
- 支持多房间管理
- 用户加入/离开房间
- 心跳机制（30秒间隔）
- 自动超时检测（60秒）
- 消息广播和私发
- 跨域支持（CORS）

**主要方法**:
- `init()` - 初始化服务器
- `sendNotification(userId, notification)` - 发送通知给指定用户
- `broadcastNotification(notification)` - 广播通知
- `sendMessageToUser(userId, message)` - 发送消息给指定用户
- `broadcastMessage(message)` - 广播消息
- `getOnlineUsers()` - 获取在线用户列表
- `isUserOnline(userId)` - 检查用户是否在线

### 2. WebSocket Hook

**文件**: `src/hooks/useSocket.ts`

**功能**:
- 在 React 组件中使用 WebSocket 连接
- 自动连接/重连（最多5次）
- 事件监听和消息处理
- 播放通知声音
- 心跳响应

**主要方法**:
- `connect()` - 连接 WebSocket
- `disconnect()` - 断开连接
- `sendMessage(type, payload, to?)` - 发送消息
- `markMessageAsRead(messageType, messageId)` - 标记消息已读
- `markNotificationAsRead(notificationId)` - 标记通知已读
- `updateUserStatus(status)` - 更新用户状态
- `joinRoom(roomId)` - 加入房间
- `leaveRoom(roomId)` - 离开房间

**状态**:
- `isConnected` - 是否已连接
- `isConnecting` - 是否正在连接
- `onlineUsers` - 在线用户列表
- `connectionError` - 连接错误

### 3. 在线状态组件

**文件**: `src/components/online-status/online-indicator.tsx`

**组件**:
- `OnlineIndicator` - 在线指示器
- `UserOnlineStatus` - 用户在线状态
- `OnlineUsersCount` - 在线用户统计
- `OnlineUsersList` - 在线用户列表
- `StatusSelector` - 状态选择器

**功能**:
- 显示用户在线/离线状态
- 支持多种状态：在线、忙碌、离开
- 实时更新在线用户列表
- 状态切换功能

### 4. 消息已读回执组件

**文件**: `src/components/message-read-receipt/message-read-receipt.tsx`

**组件**:
- `MessageReadReceipt` - 消息已读回执
- `BatchMessageReadReceipt` - 批量消息已读回执
- `ChatMessageReadReceipt` - 聊天消息已读回执
- `MessageDeliveryStatus` - 消息发送状态

**功能**:
- 显示消息已读/未读状态
- 统计已读人数
- 显示已读用户列表
- 支持批量消息状态

### 5. 实时通知推送组件

**文件**: `src/components/notification-panel/notification-panel.tsx`

**组件**:
- `NotificationPanel` - 通知面板
- `NotificationBadge` - 通知徽章
- `NotificationList` - 通知列表

**功能**:
- 实时接收通知
- 通知分类显示（info、success、warning、error）
- 未读通知计数
- 标记已读/全部已读
- 删除通知
- 清空通知
- 播放通知声音

### 6. WebSocket Provider

**文件**: `src/components/websocket/websocket-provider.tsx`

**功能**:
- 在全局初始化 WebSocket 连接
- 从 localStorage 读取用户信息
- 自动连接/断开处理
- 连接状态日志

### 7. 演示页面

**文件**: `src/app/realtime-demo/page.tsx`

**功能**:
- 完整的实时通信功能演示
- WebSocket 连接状态显示
- 在线状态演示
- 实时通知测试
- 消息已读回执测试
- 状态选择器演示

## 使用方法

### 1. 在布局中启用 WebSocket

在 `src/app/layout.tsx` 中：

```tsx
import { WebSocketProvider } from '@/components/websocket/websocket-provider';

export default function RootLayout({ children }) {
  return (
    <html>
      <body>
        <WebSocketProvider>
          {children}
        </WebSocketProvider>
      </body>
    </html>
  );
}
```

### 2. 在组件中使用 WebSocket

```tsx
import { useSocket } from '@/hooks/useSocket';

function MyComponent() {
  const { isConnected, sendMessage, markMessageAsRead } = useSocket({
    userId: 1,
    username: 'test',
    onMessage: (message) => {
      console.log('收到消息:', message);
    },
    onNotification: (notification) => {
      console.log('收到通知:', notification);
    },
  });

  const handleSendMessage = () => {
    sendMessage('test', { text: 'Hello' });
  };

  return (
    <div>
      <div>连接状态: {isConnected ? '已连接' : '未连接'}</div>
      <button onClick={handleSendMessage}>发送消息</button>
    </div>
  );
}
```

### 3. 在页面中添加通知面板

```tsx
import { NotificationPanel } from '@/components/notification-panel/notification-panel';

function MyPage() {
  const userId = 1;

  return (
    <div>
      <NotificationPanel userId={userId} />
    </div>
  );
}
```

### 4. 显示在线状态

```tsx
import { OnlineIndicator, UserOnlineStatus, OnlineUsersCount } from '@/components/online-status/online-indicator';

function MyPage() {
  return (
    <div>
      <OnlineIndicator userId={1} size="sm" showText />
      <OnlineUsersCount />
      <UserOnlineStatus userId={1} username="用户1" />
    </div>
  );
}
```

### 5. 显示消息已读回执

```tsx
import { MessageReadReceipt } from '@/components/message-read-receipt/message-read-receipt';

function MyPage() {
  return (
    <div>
      <MessageReadReceipt
        userId={1}
        messageType="chat"
        messageId="msg-123"
        recipients={[1, 2, 3]}
        showCount
      />
    </div>
  );
}
```

## WebSocket 事件

### 客户端发送事件

- `join` - 加入用户房间
  ```typescript
  { userId: number; username?: string; avatar?: string }
  ```

- `user:status` - 更新用户状态
  ```typescript
  { status: 'online' | 'busy' | 'away' }
  ```

- `message` - 发送消息
  ```typescript
  { to?: number; type: string; payload: any }
  ```

- `message:read` - 标记消息已读
  ```typescript
  { messageType: string; messageId: string }
  ```

- `notification:read` - 标记通知已读
  ```typescript
  { notificationId: number }
  ```

- `room:join` - 加入房间
  ```typescript
  { roomId: string }
  ```

- `room:leave` - 离开房间
  ```typescript
  { roomId: string }
  ```

- `pong` - 心跳响应
  ```typescript
  { timestamp: Date }
  ```

### 服务器推送事件

- `connect` - 连接成功

- `disconnect` - 断开连接

- `connect_error` - 连接错误

- `message` - 接收消息
  ```typescript
  {
    from: number;
    type: string;
    payload: any;
    timestamp: Date;
  }
  ```

- `notification` - 接收通知
  ```typescript
  {
    id: number;
    userId: number;
    title: string;
    content: string;
    type: 'info' | 'success' | 'warning' | 'error';
    actionUrl?: string;
    metadata?: Record<string, any>;
    createdAt: Date;
  }
  ```

- `user:online` - 用户上线
  ```typescript
  { userId: number; username?: string }
  ```

- `user:offline` - 用户离线
  ```typescript
  { userId: number }
  ```

- `user:status:update` - 用户状态更新
  ```typescript
  {
    userId: number;
    status: 'online' | 'busy' | 'away';
  }
  ```

- `message:read` - 消息已读
  ```typescript
  {
    messageType: string;
    messageId: string;
    userId: number;
    readAt: Date;
  }
  ```

- `notification:read` - 通知已读
  ```typescript
  {
    notificationId: number;
    userId: number;
    readAt: Date;
  }
  ```

- `online_users` - 在线用户列表
  ```typescript
  Array<{
    userId: number;
    username?: string;
    avatar?: string;
    status: 'online' | 'busy' | 'away';
  }>
  ```

- `ping` - 心跳请求
  ```typescript
  { timestamp: Date }
  ```

## 配置

### 环境变量

- `NEXT_PUBLIC_WS_PORT` - WebSocket 服务器端口（默认：6000）
- `NEXT_PUBLIC_SITE_URL` - 站点 URL

### CORS 配置

在 `src/lib/socket.ts` 中配置允许的源：

```typescript
{
  origin: [
    'http://localhost:5000',
    'http://localhost:3000',
    'https://eea906de-e74a-496b-a0fb-ee58e7165f0d.dev.coze.site'
  ],
  credentials: true
}
```

## 测试

### 访问演示页面

```
https://eea906de-e74a-496b-a0fb-ee58e7165f0d.dev.coze.site/realtime-demo
```

### 功能测试

1. **连接测试**: 页面加载时自动建立连接
2. **在线状态测试**: 打开多个浏览器窗口，观察在线用户列表
3. **通知测试**: 点击"发送测试通知"按钮
4. **消息已读测试**: 发送消息并查看已读状态
5. **状态切换测试**: 使用状态选择器更改在线状态

## 注意事项

1. **独立服务器**: Socket.IO 服务器作为独立进程运行，需要单独启动
2. **Redis 适配器**: 生产环境建议使用 Redis 实现多实例支持
3. **身份验证**: 当前实现未包含完整的身份验证逻辑
4. **权限控制**: 需要根据业务需求添加权限控制
5. **错误处理**: 建议添加更完善的错误处理和重试机制
6. **性能优化**: 大量用户时需要优化心跳和通知推送逻辑

## 扩展建议

1. **持久化存储**: 将在线状态存储到 Redis 或数据库
2. **消息队列**: 使用消息队列处理通知推送
3. **消息加密**: 实现端到端消息加密
4. **离线消息**: 支持离线消息存储和推送
5. **文件传输**: 支持文件传输和分享
6. **语音/视频**: 集成 WebRTC 实现音视频通话
7. **群聊功能**: 实现群组和频道功能
8. **消息搜索**: 实现历史消息搜索功能

## 版本信息

- **实现日期**: 2026-02-19
- **Next.js**: 16.1.1
- **Socket.IO**: 4.8.3
- **React**: 19.2.3
- **TypeScript**: 5.x

## 联系支持

如有问题或建议，请联系开发团队。
