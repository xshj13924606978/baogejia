'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function QuotesPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">报价单管理</h1>
      <Card>
        <CardHeader>
          <CardTitle>报价单列表</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">暂无报价单数据</p>
        </CardContent>
      </Card>
    </div>
  );
}
