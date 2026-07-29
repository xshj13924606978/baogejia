'use client';

import { useState, useEffect } from 'react';
import {
  Card,
  CardContent,
  CardDescription,
  CardHeader,
  CardTitle
} from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import {
  Table,
  TableBody,
  TableCell,
  TableHead,
  TableHeader,
  TableRow
} from '@/components/ui/table';
import { Badge } from '@/components/ui/badge';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';

interface PointRecord {
  id: string;
  type: string;
  points: number;
  balance_after: number;
  description: string;
  created_at: string;
}

interface PointsPanelProps {
  userId: string;
}

const POINT_RULES = [
  { type: '上传文件', points: 5, description: '上传询价单/资料库文件' },
  { type: '注册奖励', points: 100, description: '新用户注册赠送' },
  { type: '每日登录', points: 10, description: '每日首次登录奖励' },
  { type: '产品审核', points: 50, description: '产品通过审核奖励' },
  { type: '数据贡献', points: 20, description: '贡献产品数据' },
  { type: '分享案例', points: 15, description: '分享成功案例' }
];

export default function PointsPanel({ userId }: PointsPanelProps) {
  const [points, setPoints] = useState(0);
  const [records, setRecords] = useState<PointRecord[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    loadPointsData();
  }, [userId]);

  const loadPointsData = async () => {
    try {
      setLoading(true);

      // 获取用户积分
      const userRes = await fetch('/api/points');
      const userData = await userRes.json();

      if (userData.success) {
        setPoints(userData.points || 0);
      }

      // 获取积分记录
      const recordsRes = await fetch(`/api/points?user_id=${userId}`);
      const recordsData = await recordsRes.json();

      if (recordsData.success) {
        setRecords(recordsData.records || []);
      }
    } catch (error) {
      console.error('[PointsPanel] 加载失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const getTypeLabel = (type: string) => {
    const rule = POINT_RULES.find(r => r.type.toLowerCase().replace(' ', '_') === type);
    return rule?.type || type;
  };

  const getTypeColor = (type: string) => {
    if (type.includes('login')) return 'bg-blue-500';
    if (type.includes('upload')) return 'bg-green-500';
    if (type.includes('register')) return 'bg-purple-500';
    if (type.includes('verified') || type.includes('contribution')) return 'bg-orange-500';
    return 'bg-gray-500';
  };

  return (
    <div className="space-y-6">
      {/* 积分概览 */}
      <Card className="border-2 border-brand-secondary">
        <CardHeader className="bg-gradient-to-r from-brand-primary to-brand-secondary text-white">
          <CardTitle>我的积分</CardTitle>
          <CardDescription className="text-white/80">
            积分可用于兑换会员、下载资源等
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="text-5xl font-bold text-brand-secondary mb-4">
            {loading ? '...' : points.toLocaleString()}
          </div>
          <div className="flex gap-2">
            <Badge variant="outline" className="text-sm">
              等级: {points >= 1000 ? '钻石' : points >= 500 ? '黄金' : points >= 100 ? '白银' : '青铜'}
            </Badge>
            <Badge variant="outline" className="text-sm">
              等级进度: {Math.min(100, Math.floor(points / 10))}%
            </Badge>
          </div>
        </CardContent>
      </Card>

      <Tabs defaultValue="rules" className="w-full">
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="rules">积分规则</TabsTrigger>
          <TabsTrigger value="records">积分记录</TabsTrigger>
        </TabsList>

        {/* 积分规则 */}
        <TabsContent value="rules">
          <Card>
            <CardHeader>
              <CardTitle>如何获取积分</CardTitle>
            </CardHeader>
            <CardContent>
              <Table>
                <TableHeader>
                  <TableRow>
                    <TableHead>行为</TableHead>
                    <TableHead>积分</TableHead>
                    <TableHead>说明</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {POINT_RULES.map((rule) => (
                    <TableRow key={rule.type}>
                      <TableCell className="font-medium">{rule.type}</TableCell>
                      <TableCell>
                        <span className="text-brand-accent font-bold">+{rule.points}</span>
                      </TableCell>
                      <TableCell className="text-muted-foreground">{rule.description}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </CardContent>
          </Card>
        </TabsContent>

        {/* 积分记录 */}
        <TabsContent value="records">
          <Card>
            <CardHeader>
              <div className="flex justify-between items-center">
                <CardTitle>积分明细</CardTitle>
                <Button variant="outline" size="sm" onClick={loadPointsData}>
                  刷新
                </Button>
              </div>
            </CardHeader>
            <CardContent>
              {loading ? (
                <div className="text-center py-8 text-muted-foreground">加载中...</div>
              ) : records.length === 0 ? (
                <div className="text-center py-8 text-muted-foreground">暂无积分记录</div>
              ) : (
                <Table>
                  <TableHeader>
                    <TableRow>
                      <TableHead>类型</TableHead>
                      <TableHead>描述</TableHead>
                      <TableHead>时间</TableHead>
                      <TableHead className="text-right">变动</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {records.map((record) => (
                      <TableRow key={record.id}>
                        <TableCell>
                          <Badge className={getTypeColor(record.type)}>
                            {getTypeLabel(record.type)}
                          </Badge>
                        </TableCell>
                        <TableCell className="max-w-xs truncate">
                          {record.description}
                        </TableCell>
                        <TableCell className="text-muted-foreground text-sm">
                          {new Date(record.created_at).toLocaleString('zh-CN')}
                        </TableCell>
                        <TableCell className="text-right font-bold">
                          <span className={record.points > 0 ? 'text-brand-secondary' : 'text-red-500'}>
                            {record.points > 0 ? '+' : ''}{record.points}
                          </span>
                        </TableCell>
                      </TableRow>
                    ))}
                  </TableBody>
                </Table>
              )}
            </CardContent>
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
}
