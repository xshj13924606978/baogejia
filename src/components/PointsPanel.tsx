'use client';

import React, { useState, useEffect } from 'react';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import { Sparkles, TrendingUp, Clock, Loader2 } from 'lucide-react';
import { formatDateTime } from '@/lib/date-utils';

export default function PointsPanelNew({ userId }: { userId: string }) {
  const [points, setPoints] = useState(0);
  const [totalPoints, setTotalPoints] = useState(0);
  const [rules, setRules] = useState<any[]>([]);
  const [records, setRecords] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [recordsLoading, setRecordsLoading] = useState(true);
  const [levelInfo, setLevelInfo] = useState<{ level: number; next_level_points: number }>({ level: 1, next_level_points: 2000 });

  useEffect(() => {
    fetch('/api/user/level')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setLevelInfo(d.data);
        }
      })
      .catch(console.error);

    fetch('/api/user/points')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setPoints(d.data?.points || 0);
          setTotalPoints(d.data?.totalPoints || 0);
        }
      })
      .catch(console.error);

    fetch('/api/points/rules')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setRules(d.data || []);
        }
        setLoading(false);
      })
      .catch(() => setLoading(false));

    fetch('/api/user/points/records?limit=20')
      .then(r => r.json())
      .then(d => {
        if (d.success) {
          setRecords(d.data || []);
        }
        setRecordsLoading(false);
      })
      .catch(() => setRecordsLoading(false));
  }, [userId]);

  const earnRules = rules.filter(r => r.base_points > 0);
  const spendRules = rules.filter(r => r.base_points < 0);

  const progress = totalPoints > 0 ? Math.min((points / levelInfo.next_level_points) * 100, 100) : 0;

  return (
    <div className="p-4 space-y-4 max-w-2xl mx-auto">
      <Card className="bg-gradient-to-br from-amber-500 to-orange-600 text-white">
        <CardContent className="pt-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm opacity-90">当前积分</p>
              <p className="text-4xl font-bold">{points}</p>
              <p className="text-xs opacity-75 mt-1">总积分: {totalPoints} 积分</p>
            </div>
            <Sparkles className="h-10 w-10 opacity-90" />
          </div>
          <div className="mt-4">
            <Progress value={progress} className="h-2 bg-white/30" />
            <p className="text-xs opacity-75 mt-1">距离下一级: {Math.max(0, levelInfo.next_level_points - points)} 积分</p>
          </div>
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <TrendingUp className="h-4 w-4" />
            积分规则 <span className="text-xs text-gray-400">({rules.length}条)</span>
          </CardTitle>
        </CardHeader>
        <CardContent>
          {loading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : (
            <div className="space-y-4">
              {earnRules.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-green-600">🟢 获取积分</p>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {earnRules.slice(0, 10).map(r => (
                      <div key={r.id} className="p-2 bg-green-50 rounded-lg text-xs">
                        <span className="font-medium">{r.rule_name}</span>
                        <span className="text-green-600 ml-1">+{r.base_points}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
              {spendRules.length > 0 && (
                <div>
                  <p className="text-xs font-medium text-red-600 mt-3">🔴 消耗积分</p>
                  <div className="grid grid-cols-2 gap-2 mt-1">
                    {spendRules.slice(0, 10).map(r => (
                      <div key={r.id} className="p-2 bg-red-50 rounded-lg text-xs">
                        <span className="font-medium">{r.rule_name}</span>
                        <span className="text-red-600 ml-1">{r.base_points}</span>
                      </div>
                    ))}
                  </div>
                </div>
              )}
            </div>
          )}
        </CardContent>
      </Card>

      <Card>
        <CardHeader>
          <CardTitle className="text-sm flex items-center gap-2">
            <Clock className="h-4 w-4" />
            最近记录
          </CardTitle>
        </CardHeader>
        <CardContent>
          {recordsLoading ? (
            <div className="flex justify-center py-4"><Loader2 className="h-6 w-6 animate-spin" /></div>
          ) : records.length === 0 ? (
            <p className="text-sm text-gray-400 text-center py-4">暂无记录</p>
          ) : (
            <div className="space-y-2 max-h-80 overflow-y-auto">
              {records.slice(0, 10).map(r => (
                <div key={r.id} className="flex justify-between items-center p-2 border-b text-sm">
                  <span>{r.description || r.type}</span>
                  <span className={r.points > 0 ? 'text-green-600' : 'text-red-600'}>
                    {r.points > 0 ? '+' : ''}{r.points}
                  </span>
                </div>
              ))}
            </div>
          )}
        </CardContent>
      </Card>

      {/* #202608292100-P0: 积分商城入口彻底隐藏（保留展示，无商城按钮） */}
    </div>
  );
}
