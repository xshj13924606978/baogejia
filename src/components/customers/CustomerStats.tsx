'use client';

import { Card, CardContent } from '@/components/ui/card';
import { Building2, UserPlus, Activity } from 'lucide-react';
import type { CustomerStatsData } from './types';

interface CustomerStatsProps {
  data: CustomerStatsData | null;
  loading?: boolean;
}

export function CustomerStats({ data, loading }: CustomerStatsProps) {
  const stats: CustomerStatsData = data || { total: 0, monthlyNew: 0, activeCount: 0 };

  const items = [
    {
      label: '客户总数',
      value: stats.total ?? 0,
      icon: Building2,
      hint: '全部客户资料',
    },
    {
      label: '本月新增',
      value: stats.monthlyNew ?? 0,
      icon: UserPlus,
      hint: '本月创建',
    },
    {
      label: '活跃客户',
      value: stats.activeCount ?? 0,
      icon: Activity,
      hint: '近 30 天有报价',
    },
  ];

  return (
    <div className="grid gap-4 sm:grid-cols-3">
      {items.map((item) => {
        const Icon = item.icon;
        return (
          <Card key={item.label}>
            <CardContent className="flex items-center gap-4 p-5">
              <div className="rounded-lg bg-primary/10 p-3">
                <Icon className="h-5 w-5 text-primary" />
              </div>
              <div>
                {loading ? (
                  <div className="h-7 w-16 animate-pulse rounded bg-muted" />
                ) : (
                  <div className="text-2xl font-bold leading-7">{item.value}</div>
                )}
                <div className="text-sm text-muted-foreground">
                  {item.label}
                  <span className="ml-1 text-xs text-muted-foreground/70">({item.hint})</span>
                </div>
              </div>
            </CardContent>
          </Card>
        );
      })}
    </div>
  );
}
