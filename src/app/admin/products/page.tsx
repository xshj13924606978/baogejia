'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function ProductsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">产品库管理</h1>
      <Card>
        <CardHeader>
          <CardTitle>产品列表</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">暂无产品数据</p>
        </CardContent>
      </Card>
    </div>
  );
}
