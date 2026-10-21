'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { PointsConfig } from './PointsConfig';
import PointsLog from './PointsLog';

export const PointsManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('config');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">积分系统管理</h1>
      {/* #202608311000 P2-4：旧「等级权限配置」tab 移除（组件 LevelList/LevelEditor 已废弃删除，
          等级权限配置请前往「会员管理 → 等级权限配置」/admin/membership/level-permissions） */}
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-2">
          <TabsTrigger value="config">积分规则配置</TabsTrigger>
          <TabsTrigger value="logs">积分流水</TabsTrigger>
        </TabsList>

        <TabsContent value="config" className="mt-4">
          <Card>
            <PointsConfig />
          </Card>
        </TabsContent>
        
        <TabsContent value="logs" className="mt-4">
          <Card>
            <PointsLog />
          </Card>
        </TabsContent>
      </Tabs>
    </div>
  );
};
