'use client';

import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';

export default function SettingsPage() {
  return (
    <div>
      <h1 className="text-2xl font-bold mb-6">系统设置</h1>
      <Card>
        <CardHeader>
          <CardTitle>基本设置</CardTitle>
        </CardHeader>
        <CardContent>
          <p className="text-gray-500">系统设置功能开发中</p>
        </CardContent>
      </Card>
    </div>
  );
}
