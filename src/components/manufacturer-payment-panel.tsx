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
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue
} from '@/components/ui/select';
import { Badge } from '@/components/ui/badge';
import { Alert, AlertDescription } from '@/components/ui/alert';
import { Check, Crown, Star, Zap } from 'lucide-react';

interface RankingPosition {
  rank_position: number;
  monthly_fee: number;
  available: boolean;
  holder?: string;
}

interface ManufacturerPaymentPanelProps {
  userId: string;
  userRole: string;
  isVerified: boolean;
}

const RANK_PRICES: Record<number, number> = {
  1: 999,
  2: 599,
  3: 599,
  4: 299,
  5: 299
};

const RANK_ICONS: Record<number, any> = {
  1: Crown,
  2: Star,
  3: Star,
  4: Zap,
  5: Zap
};

const CATEGORIES = ['全部', '五金配件', '建筑材料', '电气设备', '机械设备', '办公设备'];

export default function ManufacturerPaymentPanel({
  userId,
  userRole,
  isVerified
}: ManufacturerPaymentPanelProps) {
  const [rankings, setRankings] = useState<RankingPosition[]>([]);
  const [selectedRank, setSelectedRank] = useState<number | null>(null);
  const [category, setCategory] = useState<string>('全部');
  const [keywords, setKeywords] = useState<string>('');
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [message, setMessage] = useState<{ type: 'success' | 'error'; text: string } | null>(null);

  useEffect(() => {
    loadRankings();
  }, [category]);

  const loadRankings = async () => {
    try {
      setLoading(true);
      const categoryParam = category === '全部' ? '' : category;
      const res = await fetch(`/api/manufacturer/payment?category=${categoryParam}`);
      const data = await res.json();

      if (data.success) {
        // 构建排名数据
        const rankData: RankingPosition[] = Array.from({ length: 5 }, (_, i) => {
          const rank = i + 1;
          const holder = data.rankings.find((r: any) => r.rank_position === rank);
          return {
            rank_position: rank,
            monthly_fee: RANK_PRICES[rank],
            available: !holder,
            holder: holder?.users?.company
          };
        });
        setRankings(rankData);
      }
    } catch (error) {
      console.error('[ManufacturerPayment] 加载排名失败:', error);
    } finally {
      setLoading(false);
    }
  };

  const handlePurchase = async () => {
    if (!selectedRank || !isVerified) return;

    try {
      setSubmitting(true);
      setMessage(null);

      const res = await fetch('/api/manufacturer/payment', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          user_id: userId,
          rank_position: selectedRank,
          category,
          keywords
        })
      });

      const data = await res.json();

      if (data.success) {
        setMessage({ type: 'success', text: data.message });
        setSelectedRank(null);
        loadRankings();
      } else {
        setMessage({ type: 'error', text: data.error || '购买失败' });
      }
    } catch (error) {
      console.error('[ManufacturerPayment] 购买失败:', error);
      setMessage({ type: 'error', text: '网络错误，请重试' });
    } finally {
      setSubmitting(false);
    }
  };

  if (userRole !== '厂家') {
    return (
      <Card>
        <CardHeader>
          <CardTitle>品牌推荐排名</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              该功能仅限厂家使用，请联系客服申请厂家认证
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  if (!isVerified) {
    return (
      <Card>
        <CardHeader>
          <CardTitle>品牌推荐排名</CardTitle>
        </CardHeader>
        <CardContent>
          <Alert>
            <AlertDescription>
              请先完成厂家认证后再购买推荐排名
            </AlertDescription>
          </Alert>
        </CardContent>
      </Card>
    );
  }

  return (
    <div className="space-y-6">
      <Card>
        <CardHeader className="bg-gradient-to-r from-[#0a4a7a] to-[#2c8c99] text-white">
          <CardTitle>品牌推荐排名</CardTitle>
          <CardDescription className="text-white/80">
            购买推荐排名，让您的品牌优先展示
          </CardDescription>
        </CardHeader>
        <CardContent className="pt-6">
          <div className="space-y-4 mb-6">
            <div>
              <Label>选择分类</Label>
              <Select value={category} onValueChange={setCategory}>
                <SelectTrigger>
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  {CATEGORIES.map((cat) => (
                    <SelectItem key={cat} value={cat}>
                      {cat}
                    </SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div>
              <Label>关键词（选填）</Label>
              <Input
                placeholder="输入推广关键词，多个关键词用逗号分隔"
                value={keywords}
                onChange={(e) => setKeywords(e.target.value)}
              />
            </div>
          </div>

          {loading ? (
            <div className="text-center py-8">加载中...</div>
          ) : (
            <div className="grid grid-cols-1 md:grid-cols-5 gap-4">
              {rankings.map((rank) => {
                const Icon = RANK_ICONS[rank.rank_position];
                const isSelected = selectedRank === rank.rank_position;

                return (
                  <Card
                    key={rank.rank_position}
                    className={`cursor-pointer transition-all hover:shadow-lg ${
                      isSelected
                        ? 'ring-2 ring-[#2c8c99] bg-[#0a4a7a]/5'
                        : rank.available
                        ? 'hover:border-[#2c8c99]'
                        : 'opacity-50'
                    }`}
                    onClick={() => rank.available && setSelectedRank(rank.rank_position)}
                  >
                    <CardHeader className="pb-2">
                      <div className="flex justify-between items-start">
                        <Icon className="h-6 w-6 text-[#f9a825]" />
                        <Badge variant={rank.available ? 'default' : 'secondary'}>
                          {rank.available ? '可购买' : '已占用'}
                        </Badge>
                      </div>
                      <CardTitle className="text-2xl mt-2">
                        NO.{rank.rank_position}
                      </CardTitle>
                    </CardHeader>
                    <CardContent>
                      <div className="space-y-2">
                        <div className="text-2xl font-bold text-[#d32f2f]">
                          ¥{rank.monthly_fee}
                          <span className="text-sm font-normal text-muted-foreground">/月</span>
                        </div>
                        {rank.holder && (
                          <div className="text-xs text-muted-foreground">
                            占用者: {rank.holder}
                          </div>
                        )}
                        {isSelected && (
                          <Check className="h-5 w-5 text-[#2c8c99] mx-auto mt-2" />
                        )}
                      </div>
                    </CardContent>
                  </Card>
                );
              })}
            </div>
          )}

          {message && (
            <Alert className="mt-4" variant={message.type === 'error' ? 'destructive' : 'default'}>
              <AlertDescription>{message.text}</AlertDescription>
            </Alert>
          )}

          <div className="mt-6 flex justify-end">
            <Button
              onClick={handlePurchase}
              disabled={!selectedRank || submitting}
              className="bg-gradient-to-r from-[#0a4a7a] to-[#2c8c99]"
            >
              {submitting ? '购买中...' : '确认购买'}
            </Button>
          </div>
        </CardContent>
      </Card>
    </div>
  );
}
