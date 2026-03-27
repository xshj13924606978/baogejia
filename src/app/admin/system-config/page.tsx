'use client';

import { useState } from 'react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Card } from '@/components/ui/card';
import ConfigModules from '@/components/admin/config/config-modules';
import ConfigPages from '@/components/admin/config/config-pages';
import ConfigFields from '@/components/admin/config/config-fields';
import ConfigActions from '@/components/admin/config/config-actions';
import PermissionOverrides from '@/components/admin/config/config-permissions';
import ConfigLogs from '@/components/admin/config/config-logs';
import ConfigUserMenus from '@/components/admin/config/config-user-menus';
import ConfigUserPages from '@/components/admin/config/config-user-pages';
import ConfigUserFields from '@/components/admin/config/config-user-fields';
import ConfigUserActions from '@/components/admin/config/config-user-actions';

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
          <TabsTrigger value="logs">变更日志</TabsTrigger>
          <TabsTrigger value="user-menus">用户菜单配置</TabsTrigger>
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
          <TabsContent value="logs" className="mt-0 p-6">
            <ConfigLogs />
          </TabsContent>
          <TabsContent value="user-menus" className="mt-0 p-6">
            <UserMenuConfigTabs />
          </TabsContent>
        </Card>
      </Tabs>
    </div>
  );
}

/** 用户菜单配置子 Tab（使用 forceMount + hidden 避免嵌套 TabsContent 和组件卸载问题） */
function UserMenuConfigTabs() {
  const [subTab, setSubTab] = useState('user-menu-groups');

  const TABS = [
    { value: 'user-menu-groups', label: '菜单分组', Component: ConfigUserMenus },
    { value: 'user-menu-items', label: '菜单项', Component: ConfigUserPages },
    { value: 'user-menu-fields', label: '字段配置', Component: ConfigUserFields },
    { value: 'user-menu-actions', label: '按钮配置', Component: ConfigUserActions },
  ] as const;

  return (
    <div className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold">用户菜单配置</h2>
        <p className="text-sm text-muted-foreground">管理用户端下拉菜单的分组、菜单项、字段和按钮配置</p>
      </div>

      <Tabs value={subTab} onValueChange={setSubTab}>
        <TabsList>
          {TABS.map(t => (
            <TabsTrigger key={t.value} value={t.value}>{t.label}</TabsTrigger>
          ))}
        </TabsList>

        {TABS.map(t => (
          <TabsContent key={t.value} value={t.value} forceMount className="mt-0">
            {subTab === t.value ? <t.Component /> : null}
          </TabsContent>
        ))}
      </Tabs>
    </div>
  );
}
