'use client';

import { useState, useRef, useEffect } from 'react';
import { QRCodeCanvas as QRCode } from 'qrcode.react';
import PosterGenerator from './poster-generator';

export default function InviteFriends({ user }: any) {
  const [activeTab, setActiveTab] = useState('link');
  const [inviteCode, setInviteCode] = useState(`INVITE${user?.id || 0}${Date.now().toString(36)}`);
  const [copied, setCopied] = useState(false);
  const [posterStyle, setPosterStyle] = useState('simple');
  const [rankPeriod, setRankPeriod] = useState('week');
  const [showPosterGenerator, setShowPosterGenerator] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);
  const [newInvite, setNewInvite] = useState<any>(null);

  const inviteLink = `${typeof window !== 'undefined' ? window.location.origin : 'https://baojia.com'}/register?code=${inviteCode}`;

  // 复制文本
  const copyText = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    alert(msg);
  };

  // 下载二维码
  const downloadQRCode = () => {
    const canvas = qrRef.current?.querySelector('canvas');
    if (canvas) {
      const url = canvas.toDataURL('image/png');
      const a = document.createElement('a');
      a.href = url;
      a.download = `邀请二维码-${user?.username || 'user'}.png`;
      a.click();
    }
  };

  // 生成新口令
  const generateNewCode = () => {
    setInviteCode(`INVITE${user?.id || 0}${Date.now().toString(36)}`);
  };

  // 邀请统计
  const stats = {
    totalInvites: 8,
    todayInvites: 2,
    weekInvites: 5,
    monthInvites: 8,
    totalPoints: 240,
    level1Count: 5,
    level2Count: 2,
    level3Count: 1,
    rank: 23,
  };

  // 邀请记录
  const invites = [
    { name: '张三', level: 1, time: '10分钟前', points: 30, avatar: '👤' },
    { name: '李四', level: 1, time: '1小时前', points: 30, avatar: '👤' },
    { name: '王五', level: 2, time: '昨天', points: 10, avatar: '👤' },
    { name: '赵六', level: 2, time: '昨天', points: 10, avatar: '👤' },
    { name: '钱七', level: 3, time: '前天', points: 5, avatar: '👤' },
  ];

  // 邀请排行榜
  const rankings = {
    day: [
      { name: '张三', count: 5 },
      { name: '李四', count: 3 },
      { name: '王五', count: 2 },
      { name: '您', count: 2 },
    ],
    week: [
      { name: '张三', count: 45 },
      { name: '李四', count: 32 },
      { name: '王五', count: 28 },
      { name: '您', count: 23 },
    ],
    month: [
      { name: '张三', count: 120 },
      { name: '李四', count: 95 },
      { name: '王五', count: 88 },
      { name: '您', count: 76 },
    ],
    total: [
      { name: '张三', count: 520 },
      { name: '李四', count: 430 },
      { name: '王五', count: 380 },
      { name: '您', count: 350 },
    ],
  };

  // 模拟实时通知（实际应该通过WebSocket或轮询获取）
  useEffect(() => {
    const timer = setTimeout(() => {
      if (invites[0]) {
        setNewInvite(invites[0]);
      }
    }, 3000);

    return () => clearTimeout(timer);
  }, []);

  return (
    <div className="space-y-4">
      {/* 邀请统计卡片 */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-gradient-to-br from-blue-500 to-blue-600 text-white p-2 rounded">
          <div className="text-xs opacity-90">总邀请</div>
          <div className="text-xl font-bold">{stats.totalInvites}</div>
        </div>
        <div className="bg-gradient-to-br from-green-500 to-green-600 text-white p-2 rounded">
          <div className="text-xs opacity-90">今日</div>
          <div className="text-xl font-bold">{stats.todayInvites}</div>
        </div>
        <div className="bg-gradient-to-br from-purple-500 to-purple-600 text-white p-2 rounded">
          <div className="text-xs opacity-90">本周</div>
          <div className="text-xl font-bold">{stats.weekInvites}</div>
        </div>
        <div className="bg-gradient-to-br from-orange-500 to-orange-600 text-white p-2 rounded">
          <div className="text-xs opacity-90">积分</div>
          <div className="text-xl font-bold">{stats.totalPoints}</div>
        </div>
      </div>

      {/* 多级奖励说明 */}
      <div className="p-3 bg-gradient-to-r from-yellow-50 to-red-50 rounded border border-yellow-200">
        <div className="flex items-center gap-2 mb-2">
          <span className="text-xl">🎁</span>
          <span className="font-medium text-sm">多级奖励</span>
        </div>
        <div className="grid grid-cols-3 gap-2 text-center text-xs">
          <div className="bg-white p-2 rounded">
            <div className="font-bold text-blue-600">一级</div>
            <div className="text-gray-600">30积分</div>
          </div>
          <div className="bg-white p-2 rounded">
            <div className="font-bold text-green-600">二级</div>
            <div className="text-gray-600">10积分</div>
          </div>
          <div className="bg-white p-2 rounded">
            <div className="font-bold text-purple-600">三级</div>
            <div className="text-gray-600">5积分</div>
          </div>
        </div>
      </div>

      {/* 邀请方式切换 */}
      <div className="flex border-b">
        <button
          onClick={() => setActiveTab('link')}
          className={`flex-1 py-2 text-sm ${activeTab === 'link' ? 'border-b-2 border-blue-500 text-blue-600' : ''}`}
        >
          🔗 邀请链接
        </button>
        <button
          onClick={() => setActiveTab('qrcode')}
          className={`flex-1 py-2 text-sm ${activeTab === 'qrcode' ? 'border-b-2 border-blue-500 text-blue-600' : ''}`}
        >
          📱 邀请二维码
        </button>
        <button
          onClick={() => setActiveTab('poster')}
          className={`flex-1 py-2 text-sm ${activeTab === 'poster' ? 'border-b-2 border-blue-500 text-blue-600' : ''}`}
        >
          🖼️ 邀请海报
        </button>
        <button
          onClick={() => setActiveTab('password')}
          className={`flex-1 py-2 text-sm ${activeTab === 'password' ? 'border-b-2 border-blue-500 text-blue-600' : ''}`}
        >
          🔑 邀请口令
        </button>
      </div>

      {/* 邀请链接 */}
      {activeTab === 'link' && (
        <div className="p-3 bg-gray-50 rounded space-y-3">
          <div className="flex gap-2">
            <input
              type="text"
              value={inviteLink}
              readOnly
              className="flex-1 p-2 text-xs bg-white border rounded"
            />
            <button
              onClick={() => copyText(inviteLink, '链接已复制，快去分享吧！')}
              className="px-3 py-2 bg-blue-500 text-white rounded text-sm"
            >
              {copied ? '已复制' : '复制'}
            </button>
          </div>
          <div className="grid grid-cols-3 gap-2">
            <button className="py-1.5 bg-green-500 text-white rounded text-xs">
              微信
            </button>
            <button className="py-1.5 bg-blue-500 text-white rounded text-xs">
              QQ
            </button>
            <button className="py-1.5 bg-gray-500 text-white rounded text-xs">
              更多
            </button>
          </div>
        </div>
      )}

      {/* 邀请二维码 */}
      {activeTab === 'qrcode' && (
        <div className="p-3 bg-gray-50 rounded text-center space-y-3">
          <div ref={qrRef} className="inline-block p-3 bg-white rounded">
            <QRCode value={inviteLink} size={160} level="H" includeMargin />
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={downloadQRCode}
              className="py-1.5 bg-blue-500 text-white rounded text-sm"
            >
              保存二维码
            </button>
            <button
              onClick={() => copyText(inviteLink, '链接已复制')}
              className="py-1.5 bg-green-500 text-white rounded text-sm"
            >
              复制链接
            </button>
          </div>
          <div className="text-xs text-gray-500">
            扫码或保存图片分享给好友
          </div>
        </div>
      )}

      {/* 邀请海报 */}
      {activeTab === 'poster' && (
        <div className="space-y-3">
          {/* 快速预览 */}
          <div
            className={`relative rounded-lg p-4 text-white ${
              posterStyle === 'simple'
                ? 'bg-gradient-to-br from-blue-600 to-purple-600'
                : posterStyle === 'festival'
                ? 'bg-gradient-to-br from-red-500 to-pink-500'
                : 'bg-gradient-to-br from-gray-700 to-gray-900'
            }`}
          >
            <div className="absolute top-2 right-2 w-16 h-16 bg-white p-1 rounded">
              <QRCode value={inviteLink} size={60} level="H" />
            </div>
            <div className="text-lg font-bold mb-1">智能报价系统</div>
            <div className="text-xs opacity-90 mb-3">
              {posterStyle === 'simple'
                ? '让报价更简单'
                : posterStyle === 'festival'
                ? '邀请好友 共享红利'
                : '专业报价 高效管理'}
            </div>
            <div className="flex items-center gap-2 mb-2">
              <div className="w-8 h-8 bg-white text-blue-600 rounded-full flex items-center justify-center">
                {user?.username?.[0]?.toUpperCase() || 'U'}
              </div>
              <div className="text-xs">邀请您加入</div>
            </div>
            <div className="text-xs bg-white bg-opacity-20 p-2 rounded">
              扫码注册 领取30积分
            </div>
          </div>

          {/* 操作按钮 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => setShowPosterGenerator(true)}
              className="py-1.5 bg-purple-500 text-white rounded text-sm"
            >
              🎨 生成海报
            </button>
            <button className="py-1.5 bg-green-500 text-white rounded text-sm">
              📤 快速分享
            </button>
          </div>
        </div>
      )}

      {/* 邀请口令 */}
      {activeTab === 'password' && (
        <div className="p-3 bg-gray-50 rounded text-center space-y-3">
          <div className="text-3xl font-mono bg-white p-3 rounded border-2 border-dashed">
            {inviteCode}
          </div>
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => copyText(inviteCode, '口令已复制')}
              className="py-1.5 bg-blue-500 text-white rounded text-sm"
            >
              复制口令
            </button>
            <button
              onClick={generateNewCode}
              className="py-1.5 bg-green-500 text-white rounded text-sm"
            >
              生成新口令
            </button>
          </div>
          <div className="text-xs text-gray-500">
            好友在注册时输入此口令即可绑定关系
          </div>
        </div>
      )}

      {/* 渠道绑定 */}
      <div className="p-3 bg-gray-50 rounded">
        <h4 className="text-sm font-medium mb-2">🔗 社交账号绑定</h4>
        <div className="space-y-2">
          <div className="flex items-center justify-between p-2 bg-white rounded">
            <div className="flex items-center gap-2">
              <span className="text-xl">📱</span>
              <div>
                <div className="text-sm">微信</div>
                <div className="text-xs text-gray-500">未绑定</div>
              </div>
            </div>
            <button className="px-3 py-1 bg-green-500 text-white rounded text-xs">
              立即绑定
            </button>
          </div>

          <div className="flex items-center justify-between p-2 bg-white rounded">
            <div className="flex items-center gap-2">
              <span className="text-xl">🐧</span>
              <div>
                <div className="text-sm">QQ</div>
                <div className="text-xs text-gray-500">未绑定</div>
              </div>
            </div>
            <button className="px-3 py-1 bg-blue-500 text-white rounded text-xs">
              立即绑定
            </button>
          </div>

          <div className="flex items-center justify-between p-2 bg-white rounded">
            <div className="flex items-center gap-2">
              <span className="text-xl">📞</span>
              <div>
                <div className="text-sm">手机号</div>
                <div className="text-xs text-green-600">已绑定 138****8888</div>
              </div>
            </div>
            <button className="px-3 py-1 bg-gray-500 text-white rounded text-xs">
              更换
            </button>
          </div>

          <div className="flex items-center justify-between p-2 bg-white rounded">
            <div className="flex items-center gap-2">
              <span className="text-xl">📧</span>
              <div>
                <div className="text-sm">邮箱</div>
                <div className="text-xs text-green-600">已绑定 user@example.com</div>
              </div>
            </div>
            <button className="px-3 py-1 bg-gray-500 text-white rounded text-xs">
              更换
            </button>
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">
          绑定后邀请关系永久有效，好友注册自动关联
        </div>
      </div>

      {/* 邀请排行榜 */}
      <div className="p-3 bg-gradient-to-r from-yellow-50 to-red-50 rounded">
        <div className="flex items-center justify-between mb-2">
          <h4 className="text-sm font-medium">🏆 邀请排行榜</h4>
          <div className="flex gap-1 text-xs">
            <button
              onClick={() => setRankPeriod('day')}
              className={`px-2 py-0.5 rounded ${
                rankPeriod === 'day' ? 'bg-blue-500 text-white' : 'bg-white'
              }`}
            >
              日榜
            </button>
            <button
              onClick={() => setRankPeriod('week')}
              className={`px-2 py-0.5 rounded ${
                rankPeriod === 'week' ? 'bg-blue-500 text-white' : 'bg-white'
              }`}
            >
              周榜
            </button>
            <button
              onClick={() => setRankPeriod('month')}
              className={`px-2 py-0.5 rounded ${
                rankPeriod === 'month' ? 'bg-blue-500 text-white' : 'bg-white'
              }`}
            >
              月榜
            </button>
            <button
              onClick={() => setRankPeriod('total')}
              className={`px-2 py-0.5 rounded ${
                rankPeriod === 'total' ? 'bg-blue-500 text-white' : 'bg-white'
              }`}
            >
              总榜
            </button>
          </div>
        </div>
        <div className="space-y-1 text-sm">
          {rankings[rankPeriod as keyof typeof rankings].map(
            (item: any, idx: number) => (
              <div
                key={idx}
                className="flex items-center justify-between p-1"
              >
                <div className="flex items-center gap-2">
                  {idx === 0 ? (
                    <span className="w-5 text-center text-yellow-600">🥇</span>
                  ) : idx === 1 ? (
                    <span className="w-5 text-center text-gray-400">🥈</span>
                  ) : idx === 2 ? (
                    <span className="w-5 text-center text-amber-700">🥉</span>
                  ) : (
                    <span className="w-5 text-center">{idx + 1}</span>
                  )}
                  <span>{item.name}</span>
                </div>
                <span className="text-blue-600">{item.count}人</span>
              </div>
            )
          )}
        </div>
      </div>

      {/* 邀请记录 */}
      <div>
        <h4 className="text-sm font-medium mb-2">📋 最新邀请</h4>
        <div className="space-y-2">
          {invites.map((invite, idx) => (
            <div
              key={idx}
              className="flex items-center justify-between p-2 bg-gray-50 rounded"
            >
              <div className="flex items-center gap-2">
                <span className="text-xl">{invite.avatar}</span>
                <div>
                  <div className="text-sm">{invite.name}</div>
                  <div className="text-xs text-gray-500">{invite.time}</div>
                </div>
              </div>
              <div className="flex items-center gap-2">
                <span
                  className={`text-xs px-2 py-0.5 rounded ${
                    invite.level === 1
                      ? 'bg-blue-100 text-blue-700'
                      : invite.level === 2
                      ? 'bg-green-100 text-green-700'
                      : 'bg-purple-100 text-purple-700'
                  }`}
                >
                  {invite.level}级
                </span>
                <span className="text-xs text-green-600">+{invite.points}</span>
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* 实时通知提示 */}
      {newInvite && (
        <div className="fixed bottom-4 left-4 animate-bounce bg-blue-500 text-white p-2 rounded-lg shadow-lg text-sm max-w-[200px]">
          🤝 好友"{newInvite.name}"刚刚加入，获得{newInvite.points}积分
        </div>
      )}

      {/* 海报生成器 */}
      {showPosterGenerator && (
        <PosterGenerator
          user={user}
          inviteCode={inviteCode}
          onClose={() => setShowPosterGenerator(false)}
        />
      )}
    </div>
  );
}
