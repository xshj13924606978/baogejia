'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function AuditPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">内容审核</h1>
      <Card>
        <CardHeader>
          <CardTitle>待审核内容</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">暂无待审核内容</p>
        </CardContent>
      </Card>
    </div>
  );
}
