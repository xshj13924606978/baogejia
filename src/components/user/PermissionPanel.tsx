'use client';

import React, { useState, useEffect } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Progress } from '@/components/ui/progress';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Crown, Rocket, Lock, Check } from 'lucide-react';
import { useUser } from '@/contexts/UserContext';
import { useToast } from '@/components/ui/use-toast';

export const PermissionPanel: React.FC = () => {
  const { user } = useUser();
  const { toast } = useToast();
  const [levelConfig, setLevelConfig] = useState<any>(null);
  const [nextLevelConfig, setNextLevelConfig] = useState<any>(null);
  const [recommendation, setRecommendation] = useState<any>(null);
  const [upgradeModal, setUpgradeModal] = useState(false);
  const [loading, setLoading] = useState(false);
  const [quotaUsed, setQuotaUsed] = useState(0);

  useEffect(() => {
    if (user?.level) {
      fetchLevelConfig();
      fetchRecommendation();
    }
  }, [user]);

  const fetchLevelConfig = async () => {
    try {
      const res = await fetch(`/api/admin/levels/${user?.level}`);
      const data = await res.json();

      if (data.success && data.config) {
        setLevelConfig(data.config);

        // 获取下一等级配置
        if (user?.level && user.level < 5) {
          const nextRes = await fetch(`/api/admin/levels/${user.level + 1}`);
          const nextData = await nextRes.json();
          if (nextData.success && nextData.config) {
            setNextLevelConfig(nextData.config);
          }
        }
      }
    } catch (error) {
      console.error('获取等级配置失败', error);
    }
  };

  const fetchRecommendation = async () => {
    if (!user?.id) return;

    try {
      const res = await fetch(`/api/user/level/recommendation?userId=${user.id}`);
      const data = await res.json();

      if (data.success && data.recommendation) {
        setRecommendation(data.recommendation);
      }
    } catch (error) {
      console.error('获取推荐失败', error);
    }
  };

  const getLevelIcon = (level: number) => {
    if (level >= 4) return <Crown className="h-6 w-6 text-yellow-500" />;
    if (level >= 2) return <Rocket className="h-6 w-6 text-blue-500" />;
    return <Lock className="h-6 w-6 text-gray-500" />;
  };

  const getLevelColor = (level: number) => {
    if (level === 5) return 'bg-yellow-500';
    if (level === 4) return 'bg-purple-500';
    return 'bg-blue-500';
  };

  const handleUpgradeWithPoints = async () => {
    if (!user?.id || !recommendation) return;

    try {
      setLoading(true);
      const res = await fetch('/api/user/level/exchange', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          targetLevel: recommendation.recommendedLevel,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: '升级成功',
          description: `恭喜您升级到 Lv.${recommendation.recommendedLevel}！`,
        });
        setUpgradeModal(false);
      } else {
        toast({
          variant: 'destructive',
          title: '升级失败',
          description: data.error || '积分不足',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '升级失败',
      });
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!user?.id || !recommendation) return;

    try {
      setLoading(true);
      const res = await fetch('/api/user/level/purchase', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          userId: user.id,
          targetLevel: recommendation.recommendedLevel,
        }),
      });

      const data = await res.json();

      if (data.success) {
        toast({
          title: '购买成功',
          description: '支付成功，请等待审核',
        });
        setUpgradeModal(false);
      } else {
        toast({
          variant: 'destructive',
          title: '购买失败',
          description: data.error || '支付失败',
        });
      }
    } catch (error) {
      toast({
        variant: 'destructive',
        title: '购买失败',
      });
    } finally {
      setLoading(false);
    }
  };

  if (!user) return null;

  const dailyQuota = levelConfig?.quotas?.daily_quota || 10;
  const progressPercent = Math.round((quotaUsed / dailyQuota) * 100);

  return (
    <Card className="p-6">
      <div className="flex items-center justify-between mb-6">
        <h2 className="text-2xl font-bold">我的权限</h2>
        {getLevelIcon(user.level || 1)}
      </div>

      <div className="space-y-4">
        {/* 等级信息 */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div>
            <div className="text-sm text-muted-foreground">当前等级</div>
            <Badge className={`${getLevelColor(user.level || 1)} text-white mt-1`}>
              Lv.{user.level} {levelConfig?.name}
            </Badge>
          </div>
        </div>

        {/* 积分余额 */}
        <div className="flex items-center justify-between p-4 bg-muted rounded-lg">
          <div>
            <div className="text-sm text-muted-foreground">积分余额</div>
            <div className="text-2xl font-bold text-orange-500 mt-1">
              {user.currentPoints || 0}
            </div>
          </div>
        </div>

        {/* 可用模块 */}
        <div className="p-4 border rounded-lg">
          <div className="font-medium mb-2">可用模块</div>
          <div className="flex flex-wrap gap-2">
            {levelConfig?.modulePermissions?.map((code: string) => (
              <Badge key={code} variant="secondary">{code}</Badge>
            ))}
          </div>
        </div>

        {/* 字段权限 */}
        <div className="p-4 border rounded-lg">
          <div className="font-medium mb-2">字段权限</div>
          <div className="space-y-2">
            {levelConfig?.fieldPermissions?.can_view_cost_price && (
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-500" />
                <span>查看成本价</span>
              </div>
            )}
            {levelConfig?.fieldPermissions?.can_view_min_price && (
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-500" />
                <span>查看最低售价</span>
              </div>
            )}
            {levelConfig?.fieldPermissions?.can_view_manufacturer && (
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-500" />
                <span>查看厂家信息</span>
              </div>
            )}
            {levelConfig?.fieldPermissions?.can_view_contact && (
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-500" />
                <span>查看联系人</span>
              </div>
            )}
            {levelConfig?.fieldPermissions?.can_view_phone && (
              <div className="flex items-center gap-2 text-sm">
                <Check className="h-4 w-4 text-green-500" />
                <span>查看联系电话</span>
              </div>
            )}
          </div>
        </div>

        {/* 每日配额 */}
        <div className="p-4 border rounded-lg">
          <div className="font-medium mb-2">每日配额</div>
          <Progress value={progressPercent} className="h-2" />
          <div className="text-sm text-muted-foreground mt-2">
            {quotaUsed} / {dailyQuota}
          </div>
        </div>

        {/* 智能推荐升级 */}
        {recommendation && (
          <Card className="p-4 bg-gradient-to-r from-blue-50 to-purple-50 border-blue-200">
            <div className="font-bold mb-2">🎯 智能推荐升级</div>
            <p className="text-sm mb-2">
              推荐升级到{' '}
              <Badge className="bg-yellow-500">
                Lv.{recommendation.recommendedLevel}
              </Badge>
            </p>
            <p className="text-sm text-muted-foreground mb-2">
              推荐理由：{recommendation.benefits?.join('、')}
            </p>
            <p className="text-sm mb-4">
              所需积分：{recommendation.cost.points} | ￥
              {recommendation.cost.money.toFixed(2)}
            </p>
            <Button className="w-full" onClick={() => setUpgradeModal(true)}>
              立即升级
            </Button>
          </Card>
        )}
      </div>

      {/* 升级对话框 */}
      <Dialog open={upgradeModal} onOpenChange={setUpgradeModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>升级等级</DialogTitle>
            <DialogDescription>
              选择升级方式，升级到 Lv.{recommendation?.recommendedLevel}
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-3 mt-4">
            <Button
              variant="outline"
              className="w-full justify-start"
              onClick={handleUpgradeWithPoints}
              disabled={loading}
            >
              <div className="flex-1 text-left">
                <div className="font-medium">积分兑换</div>
                <div className="text-sm text-muted-foreground">
                  需要 {recommendation?.cost.points} 积分
                </div>
              </div>
            </Button>
            <Button
              className="w-full justify-start"
              onClick={handlePurchase}
              disabled={loading}
            >
              <div className="flex-1 text-left">
                <div className="font-medium">付费购买</div>
                <div className="text-sm text-muted-foreground">
                  ￥{recommendation?.cost.money?.toFixed(2)}
                </div>
              </div>
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </Card>
  );
};
