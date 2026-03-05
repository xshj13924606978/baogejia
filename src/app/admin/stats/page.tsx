'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function StatsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">数据统计</h1>
      <Card>
        <CardHeader>
          <CardTitle>使用统计</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">暂无统计数据</p>
        </CardContent>
      </Card>
    </div>
  );
}
