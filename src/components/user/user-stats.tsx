'use client';

import { useState, useEffect } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';

interface UserStatsProps {
  user: any;
}

interface StatsData {
  inviteCount: number;
  uploadCount: number;
  quoteCount: number;
  viewCount: number;
  contribution: number;
  rank: number;
  pointsTrend: number[];
}

interface Achievement {
  icon: string;
  name: string;
  desc: string;
  progress: number;
  target: number;
  unlocked: boolean;
}

export default function UserStats({ user }: UserStatsProps) {
  const [stats, setStats] = useState<StatsData>({
    inviteCount: 0,
    uploadCount: 0,
    quoteCount: 0,
    viewCount: 0,
    contribution: 0,
    rank: 0,
    pointsTrend: [],
  });

  const [achievements, setAchievements] = useState<Achievement[]>([]);

  useEffect(() => {
    loadStats();
  }, [user?.id]);

  const loadStats = async () => {
    try {
      const res = await fetch(`/api/user/stats?user_id=${user.id}`);
      const data = await res.json();
      if (data.success) {
        setStats(data.stats);
        setAchievements(data.achievements || []);
      } else {
        // 使用模拟数据
        setStats({
          inviteCount: 3,
          uploadCount: 8,
          quoteCount: 24,
          viewCount: 156,
          contribution: 245,
          rank: 23,
          pointsTrend: [10, 25, 40, 65, 80, 95, user.points || 120],
        });
        setAchievements([
          {
            icon: '🤝',
            name: '邀请达人',
            desc: '邀请3位好友',
            progress: 3,
            target: 3,
            unlocked: true,
          },
          {
            icon: '📤',
            name: '上传能手',
            desc: '上传10次',
            progress: 8,
            target: 10,
            unlocked: false,
          },
          {
            icon: '💎',
            name: '高级会员',
            desc: '累计500积分',
            progress: user.points || 120,
            target: 500,
            unlocked: false,
          },
          {
            icon: '🔥',
            name: '连续签到',
            desc: '连续7天登录',
            progress: 3,
            target: 7,
            unlocked: false,
          },
        ]);
      }
    } catch (error) {
      console.error('[UserStats] 加载失败:', error);
    }
  };

  const getLevelInfo = (points: number) => {
    let level = 1;
    let color = 'bg-gray-100 text-gray-700';
    let nextPoints = 100;

    if (points >= 2000) {
      level = 5;
      color = 'bg-purple-100 text-purple-700';
      nextPoints = 3000;
    } else if (points >= 1000) {
      level = 4;
      color = 'bg-blue-100 text-blue-700';
      nextPoints = 2000;
    } else if (points >= 500) {
      level = 3;
      color = 'bg-green-100 text-green-700';
      nextPoints = 1000;
    } else if (points >= 100) {
      level = 2;
      color = 'bg-yellow-100 text-yellow-700';
      nextPoints = 500;
    }

    return { level, color, nextPoints };
  };

  const levelInfo = getLevelInfo(user.points || 0);
  const progressPercent = Math.min(((user.points || 0) / levelInfo.nextPoints) * 100, 100);

  return (
    <div className="space-y-4">
      {/* 等级信息 */}
      <Card className="bg-gradient-to-r from-purple-50 to-pink-50 border-purple-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between mb-2">
            <div className="flex items-center gap-2">
              <span className="text-2xl">⭐</span>
              <div>
                <div className="font-bold text-purple-700">Lv{levelInfo.level}</div>
                <div className="text-xs text-purple-600">
                  距离 Lv{levelInfo.level + 1} 还需 {levelInfo.nextPoints - (user.points || 0)} 积分
                </div>
              </div>
            </div>
            <Badge className={levelInfo.color}>当前等级</Badge>
          </div>
          <div className="w-full bg-purple-200 rounded-full h-2">
            <div
              className="bg-purple-500 h-2 rounded-full transition-all"
              style={{ width: `${progressPercent}%` }}
            />
          </div>
        </CardContent>
      </Card>

      {/* 核心数据 */}
      <div className="grid grid-cols-2 gap-2">
        <Card className="bg-gradient-to-br from-blue-50 to-blue-100 border-blue-200">
          <CardContent className="p-3">
            <div className="text-xs text-blue-600">邀请人数</div>
            <div className="text-xl font-bold text-blue-700">{stats.inviteCount}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-green-50 to-green-100 border-green-200">
          <CardContent className="p-3">
            <div className="text-xs text-green-600">上传次数</div>
            <div className="text-xl font-bold text-green-700">{stats.uploadCount}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-purple-50 to-purple-100 border-purple-200">
          <CardContent className="p-3">
            <div className="text-xs text-purple-600">报价次数</div>
            <div className="text-xl font-bold text-purple-700">{stats.quoteCount}</div>
          </CardContent>
        </Card>

        <Card className="bg-gradient-to-br from-orange-50 to-orange-100 border-orange-200">
          <CardContent className="p-3">
            <div className="text-xs text-orange-600">被查看</div>
            <div className="text-xl font-bold text-orange-700">{stats.viewCount}</div>
          </CardContent>
        </Card>
      </div>

      {/* 贡献排名 */}
      <Card className="bg-gradient-to-r from-yellow-50 to-red-50 border-yellow-200">
        <CardContent className="p-4">
          <div className="flex items-center justify-between">
            <div>
              <div className="text-xs text-yellow-600">贡献值</div>
              <div className="text-2xl font-bold text-yellow-700">{stats.contribution}</div>
            </div>
            <div className="text-right">
              <div className="text-xs text-red-600">全站排名</div>
              <div className="text-2xl font-bold text-red-700">#{stats.rank}</div>
            </div>
          </div>
        </CardContent>
      </Card>

      {/* 积分趋势 */}
      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-medium mb-3">📈 近7天积分趋势</div>
          {stats.pointsTrend.length > 0 ? (
            <div className="h-24 flex items-end gap-2">
              {stats.pointsTrend.map((value, i) => {
                const maxValue = Math.max(...stats.pointsTrend);
                const height = (value / maxValue) * 80;
                return (
                  <div key={i} className="flex-1 flex flex-col items-center">
                    <div
                      className="w-full bg-gradient-to-t from-blue-500 to-blue-300 rounded-t"
                      style={{ height: `${height}px` }}
                    />
                    <div className="text-[10px] text-gray-500 mt-1">D{i + 1}</div>
                  </div>
                );
              })}
            </div>
          ) : (
            <div className="text-center text-gray-400 text-sm py-4">暂无数据</div>
          )}
        </CardContent>
      </Card>

      {/* 成就徽章 */}
      <Card>
        <CardContent className="p-4">
          <div className="text-sm font-medium mb-3">🏆 成就徽章</div>
          <div className="grid grid-cols-2 gap-2">
            {achievements.map((achievement, idx) => (
              <div
                key={idx}
                className={`p-3 rounded border ${
                  achievement.unlocked
                    ? 'bg-yellow-50 border-yellow-200'
                    : 'bg-gray-50 border-gray-200 opacity-50'
                }`}
              >
                <div className="text-center">
                  <div className="text-2xl mb-1">{achievement.icon}</div>
                  <div className="text-xs font-medium">{achievement.name}</div>
                  <div className="text-[10px] text-gray-500">{achievement.desc}</div>
                  <div className="mt-1 text-[10px]">
                    <span className={achievement.unlocked ? 'text-green-600' : 'text-gray-400'}>
                      {achievement.unlocked
                        ? '已解锁'
                        : `${achievement.progress}/${achievement.target}`}
                    </span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
