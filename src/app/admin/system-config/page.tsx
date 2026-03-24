'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import ConfigModules from '@/components/admin/config/config-modules';
import ConfigPages from '@/components/admin/config/config-pages';
import ConfigFields from '@/components/admin/config/config-fields';
import ConfigActions from '@/components/admin/config/config-actions';
import PermissionOverrides from '@/components/admin/config/config-permissions';

export default function SystemConfigPage() {
  const [activeTab, setActiveTab] = useState('modules');

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold tracking-tight">动态配置</h1>
        <p className="text-muted-foreground">管理系统模块、页面、字段和操作按钮的动态配置及权限覆盖</p>
      </div>

      <Tabs value={activeTab} onValueChange={setActiveTab}>
        <TabsList>
          <TabsTrigger value="modules">模块配置</TabsTrigger>
          <TabsTrigger value="pages">页面配置</TabsTrigger>
          <TabsTrigger value="fields">字段配置</TabsTrigger>
          <TabsTrigger value="actions">操作按钮配置</TabsTrigger>
          <TabsTrigger value="permissions">权限覆盖</TabsTrigger>
        </TabsList>

        <Card className="mt-6">
          <TabsContent value="modules" className="mt-0 p-6">
            <ConfigModules />
          </TabsContent>
          <TabsContent value="pages" className="mt-0 p-6">
            <ConfigPages />
          </TabsContent>
          <TabsContent value="fields" className="mt-0 p-6">
            <ConfigFields />
          </TabsContent>
          <TabsContent value="actions" className="mt-0 p-6">
            <ConfigActions />
          </TabsContent>
          <TabsContent value="permissions" className="mt-0 p-6">
            <PermissionOverrides />
          </TabsContent>
        </Card>
      </Tabs>
    </div>
  );
}
