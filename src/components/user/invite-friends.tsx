'use client';

import { toast } from 'sonner';
import { useState, useRef, useEffect, useCallback } from 'react';
import { QRCodeCanvas as QRCode } from 'qrcode.react';
import PosterGenerator from './poster-generator';

interface InviteStats {
  totalInvites: number;
  todayInvites: number;
  weekInvites: number;
  monthInvites: number;
  totalPoints: number;
  level1Count: number;
  level2Count: number;
  level3Count: number;
  rank: number;
}

const EMPTY_STATS: InviteStats = {
  totalInvites: 0,
  todayInvites: 0,
  weekInvites: 0,
  monthInvites: 0,
  totalPoints: 0,
  level1Count: 0,
  level2Count: 0,
  level3Count: 0,
  rank: 0,
};

// 脱敏展示
const maskPhone = (phone?: string) => {
  if (!phone) return '';
  if (phone.length === 11) return `${phone.slice(0, 3)}****${phone.slice(-4)}`;
  return phone.length > 4 ? `${phone.slice(0, 2)}****${phone.slice(-2)}` : phone;
};

export default function InviteFriends({ user }: any) {
  const [activeTab, setActiveTab] = useState('link');
  const [inviteCode, setInviteCode] = useState('');
  const [copied, setCopied] = useState(false);
  const [posterStyle, _setPosterStyle] = useState('simple');
  const [rankPeriod, setRankPeriod] = useState('week');
  const [showPosterGenerator, setShowPosterGenerator] = useState(false);
  const qrRef = useRef<HTMLDivElement>(null);

  // 真实数据状态（替代 Mock）
  const [stats, setStats] = useState<InviteStats>(EMPTY_STATS);
  const [invites, setInvites] = useState<any[]>([]);
  const [rankings, setRankings] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);

  const inviteLink = inviteCode
    ? `${typeof window !== 'undefined' ? window.location.origin : ''}/register?code=${inviteCode}`
    : '';

  // 从后端获取邀请数据（真实 API）
  const loadInviteData = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/invites?user_id=${user.id}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success) {
        setInvites(Array.isArray(data.invites) ? data.invites : []);
        const s = data.stats || {};
        setStats((prev) => ({
          ...prev,
          totalInvites: s.total || 0,
          totalPoints: s.points || 0,
        }));
        if (data.inviteCode) setInviteCode(data.inviteCode);
      }
    } catch (error) {
      console.error('[InviteFriends] 加载邀请数据失败:', error);
    }
  }, [user]);

  // 获取多级邀请统计
  const loadRewardStats = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(`/api/invite-rewards?user_id=${user.id}`, { cache: 'no-store' });
      const data = await res.json();
      if (data.success && data.data) {
        const l1 = Array.isArray(data.data.level1) ? data.data.level1 : [];
        const l2 = Array.isArray(data.data.level2) ? data.data.level2 : [];
        const statsData = data.data.stats || {};
        setStats((prev) => ({
          ...prev,
          level1Count: statsData.level1Count ?? l1.length,
          level2Count: statsData.level2Count ?? l2.length,
          level3Count: 0,
          totalPoints: statsData.totalPoints ?? prev.totalPoints,
        }));
        // 最新邀请记录（一级好友）
        if (l1.length > 0) {
          setInvites((prev) =>
            prev.length > 0 ? prev : l1.map((r: any) => ({ ...r, _source: 'relation' }))
          );
        }
      }
    } catch (error) {
      console.error('[InviteFriends] 加载多级邀请统计失败:', error);
    }
  }, [user]);

  // 加载排行榜（按周期切换）
  const loadRankings = useCallback(async () => {
    if (!user?.id) return;
    try {
      const res = await fetch(
        `/api/invite-rankings?period=${rankPeriod}&user_id=${user.id}`,
        { cache: 'no-store' }
      );
      const data = await res.json();
      if (data.success) {
        setRankings(data.data?.rankings || []);
        setStats((prev) => ({
          ...prev,
          rank: data.data?.userRank?.rank || 0,
        }));
      }
    } catch (error) {
      console.error('[InviteFriends] 加载排行榜失败:', error);
    }
  }, [rankPeriod, user]);

  useEffect(() => {
    let mounted = true;
    (async () => {
      await loadInviteData();
      await loadRewardStats();
      await loadRankings();
      if (mounted) setLoading(false);
    })();
    return () => {
      mounted = false;
    };
  }, [loadInviteData, loadRewardStats, loadRankings]);

  // 切换排行榜周期时重新加载
  useEffect(() => {
    loadRankings();
  }, [loadRankings]);

  // 创建邀请链接/口令（后端持久化，保证与 /api/invites 同源）
  const ensureInviteCode = async () => {
    if (!user?.id) return inviteCode;
    if (inviteCode) return inviteCode;
    try {
      const res = await fetch('/api/invites', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id }),
      });
      const data = await res.json();
      if (data.success && data.inviteCode) {
        setInviteCode(data.inviteCode);
        return data.inviteCode;
      }
    } catch (error) {
      console.error('[InviteFriends] 创建邀请码失败:', error);
    }
    return inviteCode;
  };

  // 生成新口令
  const generateNewCode = async () => {
    if (!user?.id) return;
    try {
      const res = await fetch('/api/invite-codes', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ user_id: user.id, type: 'password' }),
      });
      const data = await res.json();
      if (data.success && data.data?.code) {
        setInviteCode(data.data.code);
      } else {
        console.error('[InviteFriends] 生成新口令失败:', data.error);
      }
    } catch (error) {
      console.error('[InviteFriends] 生成新口令异常:', error);
    }
  };

  // 复制文本
  const copyText = (text: string, msg: string) => {
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
    toast(msg);
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

  // 邀请记录展示（真实数据）
  const displayInvites = invites.map((invite: any, idx: number) => {
    if (invite._source === 'relation') {
      return {
        name: invite.invitee?.username || `好友${idx + 1}`,
        level: invite.level || 1,
        time: invite.created_at ? new Date(invite.created_at).toLocaleString('zh-CN') : '',
        points: invite.points_awarded || 0,
        avatar: '👤',
      };
    }
    return {
      name: `好友${idx + 1}`,
      level: 1,
      time: invite.created_at ? new Date(invite.created_at).toLocaleString('zh-CN') : '',
      points: invite.points_awarded || 0,
      avatar: '👤',
    };
  });

  // 排行榜展示（真实数据）
  const displayRankings = rankings.map((r: any, idx: number) => ({
    name: r.user?.username || `用户${idx + 1}`,
    count: r.invite_count || 0,
  }));

  return (
    <div className="space-y-4">
      {/* 邀请统计卡片 */}
      <div className="grid grid-cols-4 gap-2">
        <div className="bg-gradient-to-br from-brand-primary to-brand-secondary text-white p-2 rounded">
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
          <div className="text-xs opacity-90">总积分</div>
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
            <div className="text-gray-600">50积分</div>
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
          {!inviteCode && loading ? (
            <div className="text-center text-sm text-gray-400 py-2">邀请码加载中...</div>
          ) : (
            <>
              <div className="flex gap-2">
                <input
                  type="text"
                  value={inviteLink}
                  readOnly
                  placeholder="点击下方按钮生成邀请链接"
                  className="flex-1 p-2 text-xs bg-white border rounded"
                />
                <button
                  onClick={() => copyText(inviteLink, '链接已复制，快去分享吧！')}
                  className="px-3 py-2 bg-blue-500 text-white rounded text-sm"
                  disabled={!inviteCode}
                >
                  {copied ? '已复制' : '复制'}
                </button>
              </div>
              <button
                onClick={() => ensureInviteCode()}
                className="w-full py-1.5 bg-brand-primary text-white rounded text-sm"
              >
                {inviteCode ? '刷新邀请链接' : '生成邀请链接'}
              </button>
              <div className="grid grid-cols-3 gap-2">
                <button className="py-1.5 bg-green-500 text-white rounded text-xs">微信</button>
                <button className="py-1.5 bg-blue-500 text-white rounded text-xs">QQ</button>
                <button className="py-1.5 bg-gray-500 text-white rounded text-xs">更多</button>
              </div>
            </>
          )}
        </div>
      )}

      {/* 邀请二维码 */}
      {activeTab === 'qrcode' && (
        <div className="p-3 bg-gray-50 rounded text-center space-y-3">
          {!inviteCode && loading ? (
            <div className="text-sm text-gray-400 py-4">邀请码加载中...</div>
          ) : (
            <>
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
              <button
                onClick={() => ensureInviteCode()}
                className="w-full py-1.5 bg-brand-primary text-white rounded text-sm"
              >
                生成邀请二维码
              </button>
              <div className="text-xs text-gray-500">扫码或保存图片分享给好友</div>
            </>
          )}
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
              <QRCode value={inviteLink || 'placeholder'} size={60} level="H" />
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
            <div className="text-xs bg-white bg-opacity-20 p-2 rounded">扫码注册 领取50积分</div>
          </div>

          {/* 操作按钮 */}
          <div className="grid grid-cols-2 gap-2">
            <button
              onClick={() => {
                ensureInviteCode().then(() => setShowPosterGenerator(true));
              }}
              className="py-1.5 bg-purple-500 text-white rounded text-sm"
            >
              🎨 生成海报
            </button>
            <button className="py-1.5 bg-green-500 text-white rounded text-sm">📤 快速分享</button>
          </div>
        </div>
      )}

      {/* 邀请口令 */}
      {activeTab === 'password' && (
        <div className="p-3 bg-gray-50 rounded text-center space-y-3">
          {!inviteCode && loading ? (
            <div className="text-sm text-gray-400 py-4">口令加载中...</div>
          ) : (
            <>
              <div className="text-3xl font-mono bg-white p-3 rounded border-2 border-dashed">
                {inviteCode || '点击下方按钮生成口令'}
              </div>
              <div className="grid grid-cols-2 gap-2">
                <button
                  onClick={() => copyText(inviteCode, '口令已复制')}
                  className="py-1.5 bg-blue-500 text-white rounded text-sm"
                  disabled={!inviteCode}
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
              <div className="text-xs text-gray-500">好友在注册时输入此口令即可绑定关系</div>
            </>
          )}
        </div>
      )}

      {/* 渠道绑定（使用真实用户资料，移除 Mock 绑定数据） */}
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
            <button className="px-3 py-1 bg-green-500 text-white rounded text-xs">立即绑定</button>
          </div>

          <div className="flex items-center justify-between p-2 bg-white rounded">
            <div className="flex items-center gap-2">
              <span className="text-xl">🐧</span>
              <div>
                <div className="text-sm">QQ</div>
                <div className="text-xs text-gray-500">未绑定</div>
              </div>
            </div>
            <button className="px-3 py-1 bg-blue-500 text-white rounded text-xs">立即绑定</button>
          </div>

          <div className="flex items-center justify-between p-2 bg-white rounded">
            <div className="flex items-center gap-2">
              <span className="text-xl">📞</span>
              <div>
                <div className="text-sm">手机号</div>
                <div className="text-xs text-green-600">
                  {maskPhone(user?.phone) ? `已绑定 ${maskPhone(user?.phone)}` : '未绑定'}
                </div>
              </div>
            </div>
            <button className="px-3 py-1 bg-gray-500 text-white rounded text-xs">更换</button>
          </div>

          <div className="flex items-center justify-between p-2 bg-white rounded">
            <div className="flex items-center gap-2">
              <span className="text-xl">📧</span>
              <div>
                <div className="text-sm">邮箱</div>
                <div className="text-xs text-green-600">{user?.email || '未绑定'}</div>
              </div>
            </div>
            <button className="px-3 py-1 bg-gray-500 text-white rounded text-xs">更换</button>
          </div>
        </div>
        <div className="text-xs text-gray-500 mt-2">绑定后邀请关系永久有效，好友注册自动关联</div>
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
          {displayRankings.length === 0 ? (
            <div className="text-center text-gray-400 text-xs py-2">暂无排行榜数据</div>
          ) : (
            displayRankings.map((item: any, idx: number) => (
              <div key={idx} className="flex items-center justify-between p-1">
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
            ))
          )}
        </div>
      </div>

      {/* 邀请记录 */}
      <div>
        <h4 className="text-sm font-medium mb-2">📋 最新邀请</h4>
        <div className="space-y-2">
          {displayInvites.length === 0 ? (
            <div className="text-center text-gray-400 text-xs py-3">
              暂无邀请记录，快邀请好友吧
            </div>
          ) : (
            displayInvites.map((invite, idx) => (
              <div key={idx} className="flex items-center justify-between p-2 bg-gray-50 rounded">
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
            ))
          )}
        </div>
      </div>

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
