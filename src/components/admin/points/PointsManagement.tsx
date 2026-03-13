'use client';

import React, { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import { LevelList } from '../levels/LevelList';
import { PointsConfig } from './PointsConfig';
import { PointsLog } from './PointsLog';

export const PointsManagement: React.FC = () => {
  const [activeTab, setActiveTab] = useState('levels');

  return (
    <div className="p-6">
      <h1 className="text-2xl font-bold mb-6">积分系统管理</h1>
      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList className="grid w-full grid-cols-3">
          <TabsTrigger value="levels">等级权限配置</TabsTrigger>
          <TabsTrigger value="config">积分规则配置</TabsTrigger>
          <TabsTrigger value="logs">积分流水</TabsTrigger>
        </TabsList>

        <TabsContent value="levels" className="mt-4">
          <Card>
            <LevelList />
          </Card>
        </TabsContent>

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
