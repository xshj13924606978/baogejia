'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { Sparkles, Gift, TrendingUp, Clock } from 'lucide-react';

export default function PointsPanel() {
  const points = 1000;
  const nextLevelPoints = 2000;
  const progress = (points / nextLevelPoints) * 100;

  const recentActivity = [
    { id: 1, action: '上传文件', points: '+10', date: '2024-02-26', icon: '📄' },
    { id: 2, action: '生成报价', points: '-5', date: '2024-02-25', icon: '💰' },
    { id: 3, action: '每日登录', points: '+2', date: '2024-02-25', icon: '🎁' },
    { id: 4, action: '邀请好友', points: '+50', date: '2024-02-24', icon: '👥' },
  ];

  return (
    <div className="p-4 space-y-4">
      <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">当前积分</p>
              <p className="text-3xl font-bold">{points}</p>
            </div>
            <Sparkles className="h-8 w-8 opacity-90" />
          </div>
          <div className="mt-4 space-y-2">
            <div className="flex justify-between text-xs">
              <span>距离下一级</span>
              <span>{nextLevelPoints - points} 积分</span>
            </div>
            <Progress
              value={progress}
              className="h-2 bg-white/30 [&_[data-slot=progress-indicator]]:bg-white"
            />
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">积分获取规则</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="grid grid-cols-2 gap-2 text-xs">
            <div className="p-2 bg-green-50 rounded-lg">
              <p className="font-medium text-green-700">上传文件</p>
              <p className="text-green-600">+10 积分</p>
            </div>
            <div className="p-2 bg-blue-50 rounded-lg">
              <p className="font-medium text-blue-700">分享知识</p>
              <p className="text-blue-600">+20 积分</p>
            </div>
            <div className="p-2 bg-purple-50 rounded-lg">
              <p className="font-medium text-purple-700">每日登录</p>
              <p className="text-purple-600">+2 积分</p>
            </div>
            <div className="p-2 bg-amber-50 rounded-lg">
              <p className="font-medium text-amber-700">邀请好友</p>
              <p className="text-amber-600">+50 积分</p>
            </div>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm">最近记录</CardTitle>
        </CardHeader>
        <CardContent>
          <div className="space-y-2">
            {recentActivity.map((item) => (
              <div
                key={item.id}
                className="flex items-center justify-between p-2 hover:bg-gray-50 rounded-lg"
              >
                <div className="flex items-center gap-2">
                  <span className="text-lg">{item.icon}</span>
                  <div>
                    <p className="text-sm font-medium">{item.action}</p>
                    <p className="text-xs text-gray-500">{item.date}</p>
                  </div>
                </div>
                <Badge
                  variant={item.points.startsWith('+') ? 'default' : 'destructive'}
                  className={
                    item.points.startsWith('+')
                      ? 'bg-green-100 text-green-700'
                      : 'bg-red-100 text-red-700'
                  }
                >
                  {item.points}
                </Badge>
              </div>
            ))}
          </div>
        </CardContent>
      </Card>

      <Button className="w-full bg-gradient-to-r from-purple-600 to-purple-700">
        <Gift className="h-4 w-4 mr-2" />
        积分商城
      </Button>
    </div>
  );
}
