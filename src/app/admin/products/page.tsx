'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { DuplicateCheckConfig } from '@/components/admin/duplicate-check-config';
import { ImportLogsViewer } from '@/components/admin/import-logs-viewer';

export default function ProductsPage() {
  return (
    <div className="space-y-6">
      <h1 className="text-2xl font-bold">产品库管理</h1>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-6">
        <div className="lg:col-span-1">
          <DuplicateCheckConfig />
        </div>

        <div className="lg:col-span-2">
          <ImportLogsViewer />
        </div>
      </div>

      <Card>
        <CardHeader>
          <CardTitle>产品列表</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-muted-foreground">暂无产品数据</p>
        </CardContent>
      </Card>
    </div>
  );
}
