'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import ConfigUserMenus from '@/components/admin/config/config-user-menus';
import ConfigUserPages from '@/components/admin/config/config-user-pages';
import ConfigUserFields from '@/components/admin/config/config-user-fields';
import ConfigUserActions from '@/components/admin/config/config-user-actions';

const SUB_TABS = [
  { key: 'groups', label: '菜单分组', Component: ConfigUserMenus },
  { key: 'items', label: '菜单项', Component: ConfigUserPages },
  { key: 'fields', label: '字段配置', Component: ConfigUserFields },
  { key: 'actions', label: '按钮配置', Component: ConfigUserActions },
];

export default function UserMenuConfig() {
  const [activeSubTab, setActiveSubTab] = useState('groups');

  const ActiveComponent = SUB_TABS.find(t => t.key === activeSubTab)?.Component;

  return (
    <div className="space-y-4">
      {/* 自定义 Tab 切换器（不使用 Radix UI Tabs，避免嵌套冲突） */}
      <div className="flex gap-2 border-b pb-2">
        {SUB_TABS.map(tab => (
          <Button
            key={tab.key}
            variant="ghost"
            className={cn(
              'px-4 py-2 text-sm font-medium rounded-none',
              activeSubTab === tab.key
                ? 'border-b-2 border-primary text-primary'
                : 'text-muted-foreground hover:text-foreground'
            )}
            onClick={() => setActiveSubTab(tab.key)}
          >
            {tab.label}
          </Button>
        ))}
      </div>

      {/* 内容区域 */}
      <div className="pt-4">
        {ActiveComponent && <ActiveComponent />}
      </div>
    </div>
  );
}
