'use client';

import { useSocket } from '@/lib/socket-client';
import { useUser } from '@/hooks/use-user';
import { useState, useEffect } from 'react';

export default function TestSocketPage() {
  const { user, loading: userLoading } = useUser();
  const [messages, setMessages] = useState<string[]>([]);
  
  const {
    isConnected,
    onlineCount,
    joinConversation,
    sendMessage,
    on
  } = useSocket(user?.id);

  // 监听消息
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribe = on('message:received', (data) => {
      setMessages(prev => [...prev, `收到消息: ${JSON.stringify(data)}`]);
    });

    return unsubscribe;
  }, [isConnected, on]);

  // 监听用户状态
  useEffect(() => {
    if (!isConnected) return;

    const unsubscribeOnline = on('user:online', (data) => {
      setMessages(prev => [...prev, `用户上线: ${data.userId}`]);
    });

    const unsubscribeOffline = on('user:offline', (data) => {
      setMessages(prev => [...prev, `用户下线: ${data.userId}`]);
    });

    return () => {
      unsubscribeOnline();
      unsubscribeOffline();
    };
  }, [isConnected, on]);

  const handleJoinConversation = () => {
    joinConversation(1);
    setMessages(prev => [...prev, '加入对话 1']);
  };

  const handleSendMessage = () => {
    sendMessage(1, {
      content: '测试消息 ' + new Date().toLocaleTimeString(),
      type: 'text'
    }, Date.now().toString());
    setMessages(prev => [...prev, '发送测试消息']);
  };

  if (userLoading) {
    return <div className="p-8">加载中...</div>;
  }

  return (
    <div className="p-8 max-w-2xl mx-auto">
      <h1 className="text-2xl font-bold mb-4">Socket.IO 测试页面</h1>
      
      <div className="mb-4 p-4 bg-gray-100 rounded">
        <p><strong>连接状态:</strong> {isConnected ? '✅ 已连接' : '❌ 未连接'}</p>
        <p><strong>当前用户:</strong> {user?.name || '未登录'} (ID: {user?.id || '无'})</p>
        <p><strong>在线用户数:</strong> {onlineCount}</p>
      </div>

      <div className="space-x-2 mb-4">
        <button
          onClick={handleJoinConversation}
          className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
        >
          加入对话
        </button>
        <button
          onClick={handleSendMessage}
          className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
        >
          发送消息
        </button>
      </div>

      <div className="border rounded p-4">
        <h2 className="font-semibold mb-2">消息记录:</h2>
        <div className="space-y-1">
          {messages.map((msg, i) => (
            <div key={i} className="text-sm border-b pb-1">{msg}</div>
          ))}
        </div>
      </div>
    </div>
  );
}