'use client';

import { useState } from 'react';
import { OnlineIndicator, OnlineUsersCount, UserOnlineStatus, StatusSelector } from '@/components/online-status/online-indicator';
import { NotificationPanel } from '@/components/notification-panel/notification-panel';
import { MessageReadReceipt, ChatMessageReadReceipt } from '@/components/message-read-receipt/message-read-receipt';
import { useSocket } from '@/hooks/useSocket';

export default function RealtimeDemoPage() {
  const [testMessageId, setTestMessageId] = useState(`test-${Date.now()}`);
  const [testMessageText, setTestMessageText] = useState('');
  const userId = typeof window !== 'undefined' ? JSON.parse(localStorage.getItem('user') || '{}')?.id : null;

  const { isConnected, onlineUsers, sendMessage } = useSocket({
    userId,
  });

  const handleSendMessage = () => {
    if (!testMessageText.trim()) return;

    sendMessage('test:message', {
      id: testMessageId,
      text: testMessageText,
      timestamp: new Date().toISOString(),
    });

    setTestMessageText('');
    setTestMessageId(`test-${Date.now()}`);
  };

  const handleTestNotification = async () => {
    if (!userId) {
      alert('请先登录');
      return;
    }

    try {
      const res = await fetch('/api/notifications/push', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userIds: [userId],
          title: '测试通知',
          content: `这是一条测试通知，时间：${new Date().toLocaleString()}`,
          type: 'info',
        }),
      });

      const data = await res.json();
      if (data.success) {
        alert('测试通知已发送！');
      } else {
        alert('发送失败：' + data.error);
      }
    } catch (error) {
      console.error('发送测试通知失败:', error);
      alert('发送失败');
    }
  };

  return (
    <div className="max-w-6xl mx-auto p-6 space-y-6">
      {/* 页面标题 */}
      <div className="flex justify-between items-center">
        <div>
          <h1 className="text-3xl font-bold">实时通信功能演示</h1>
          <p className="text-gray-600 mt-2">
            WebSocket连接 · 实时通知 · 在线状态 · 消息已读回执
          </p>
        </div>
        <div className="flex items-center gap-4">
          <OnlineUsersCount />
          <NotificationPanel userId={userId} />
        </div>
      </div>

      {/* 连接状态 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">WebSocket 连接状态</h2>
        <div className="flex items-center gap-4">
          <OnlineIndicator size="lg" showText />
          <div className="flex-1">
            <div className="text-sm font-medium">
              {isConnected ? '已连接' : '未连接'}
            </div>
            <div className="text-xs text-gray-500">
              {isConnected ? 'WebSocket 连接正常' : '正在尝试连接...'}
            </div>
          </div>
          <div className="text-right">
            <div className="text-sm font-medium">{onlineUsers.length}</div>
            <div className="text-xs text-gray-500">在线用户</div>
          </div>
        </div>
      </div>

      {/* 在线状态演示 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">在线状态显示</h2>
        <div className="space-y-4">
          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">在线指示器</h3>
            <div className="flex items-center gap-4">
              <OnlineIndicator size="sm" showText />
              <OnlineIndicator size="md" showText />
              <OnlineIndicator size="lg" showText />
            </div>
          </div>

          <div>
            <h3 className="text-sm font-medium text-gray-700 mb-2">用户列表在线状态</h3>
            <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
              {onlineUsers.slice(0, 8).map((user, index) => (
                <UserOnlineStatus
                  key={user.userId}
                  userId={user.userId}
                  username={`用户${user.userId}`}
                />
              ))}
            </div>
          </div>
        </div>
      </div>

      {/* 实时通知演示 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">实时通知推送</h2>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            点击下方按钮测试实时通知推送功能，通知会立即显示在右上角的通知面板中。
          </p>
          <button
            onClick={handleTestNotification}
            className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600 transition-colors"
          >
            发送测试通知
          </button>
        </div>
      </div>

      {/* 消息已读回执演示 */}
      <div className="bg-white rounded-lg shadow p-6">
        <h2 className="text-xl font-semibold mb-4">消息已读回执</h2>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              消息ID
            </label>
            <input
              type="text"
              value={testMessageId}
              onChange={(e) => setTestMessageId(e.target.value)}
              className="w-full p-2 border rounded-lg"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">
              消息内容
            </label>
            <textarea
              value={testMessageText}
              onChange={(e) => setTestMessageText(e.target.value)}
              className="w-full p-2 border rounded-lg h-24"
              placeholder="输入测试消息..."
            />
          </div>

          <div className="flex items-center gap-4">
            <button
              onClick={handleSendMessage}
              disabled={!testMessageText.trim()}
              className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600 transition-colors disabled:opacity-50"
            >
              发送消息
            </button>
            <MessageReadReceipt
              userId={userId}
              messageType="test"
              messageId={testMessageId}
              recipients={[userId || 0]}
              showCount
            />
          </div>

          <div className="border-t pt-4">
            <h3 className="text-sm font-medium text-gray-700 mb-2">
              单个消息已读回执
            </h3>
            <div className="flex items-center gap-4">
              <MessageReadReceipt
                userId={userId}
                messageType="demo"
                messageId="demo-message-1"
                recipients={[userId || 0, 2, 3, 4, 5]}
                showCount
              />
              <MessageReadReceipt
                userId={userId}
                messageType="demo"
                messageId="demo-message-2"
                recipients={[userId || 0, 2, 3]}
                showCount
              />
              <MessageReadReceipt
                userId={userId}
                messageType="demo"
                messageId="demo-message-3"
                recipients={[userId || 0, 2]}
                showCount
              />
            </div>
          </div>
        </div>
      </div>

      {/* 状态选择器 */}
      {userId && (
        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="text-xl font-semibold mb-4">我的在线状态</h2>
          <div className="space-y-4">
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">当前用户</h3>
              <UserOnlineStatus
                userId={userId}
                username="我"
                showText
              />
            </div>
            <div>
              <h3 className="text-sm font-medium text-gray-700 mb-2">更改状态</h3>
              <StatusSelector
                userId={userId}
                onStatusChange={(status) => {
                  console.log('状态已更改为:', status);
                }}
              />
            </div>
          </div>
        </div>
      )}

      {/* 使用说明 */}
      <div className="bg-blue-50 rounded-lg p-6">
        <h2 className="text-lg font-semibold mb-3 text-blue-900">使用说明</h2>
        <ul className="space-y-2 text-sm text-blue-800">
          <li>
            <strong>WebSocket 连接：</strong> 页面加载时自动建立 WebSocket 连接，
            支持断线自动重连。
          </li>
          <li>
            <strong>在线状态：</strong> 用户上线/离线时会实时更新在线用户列表，
            显示绿色指示灯表示在线。
          </li>
          <li>
            <strong>实时通知：</strong> 管理员可以通过 API 推送通知给指定用户，
            用户会立即收到通知并在右上角显示。
          </li>
          <li>
            <strong>消息已读回执：</strong> 发送消息后可以查看已读人数，
            点击标记按钮可以标记为已读。
          </li>
          <li>
            <strong>心跳机制：</strong> 每 30 秒发送一次心跳保持连接活跃，
            自动更新最后在线时间。
          </li>
        </ul>
      </div>
    </div>
  );
}
