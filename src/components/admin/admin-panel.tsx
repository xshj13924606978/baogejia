'use client';

import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { X } from 'lucide-react';
import AdminAuditPanel from '@/components/admin-audit-panel';

interface AdminPanelProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
}

export default function AdminPanel({ isOpen, onClose, user }: AdminPanelProps) {
  const [activeTab, setActiveTab] = useState('audit');

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-[600px] bg-white shadow-xl z-50 flex flex-col">
        {/* 头部 */}
        <div className="p-4 border-b flex justify-between items-center bg-gradient-to-r from-red-500 to-orange-500 text-white">
          <h2 className="text-lg font-bold">⚙️ 管理后台</h2>
          <Button variant="ghost" size="icon" onClick={onClose} className="text-white hover:bg-white/20">
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* 管理员信息 */}
        <div className="p-4 bg-gradient-to-r from-red-50 to-orange-50 border-b">
          <div className="flex items-center gap-3">
            <div className="h-12 w-12 bg-gradient-to-br from-red-500 to-orange-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
              {user.username?.charAt(0).toUpperCase()}
            </div>
            <div>
              <div className="font-bold text-red-700">{user.username}</div>
              <div className="text-sm text-gray-600">超级管理员</div>
            </div>
          </div>
        </div>

        {/* 标签页 */}
        <Tabs value={activeTab} onValueChange={setActiveTab} className="flex-1 flex flex-col">
          <div className="border-b px-4">
            <TabsList className="grid w-full grid-cols-4">
              <TabsTrigger value="audit">审核管理</TabsTrigger>
              <TabsTrigger value="users">用户管理</TabsTrigger>
              <TabsTrigger value="finance">财务管理</TabsTrigger>
              <TabsTrigger value="stats">数据统计</TabsTrigger>
            </TabsList>
          </div>

          <ScrollArea className="flex-1">
            <div className="p-4">
              <TabsContent value="audit">
                <AdminAuditPanel userId={user.id} userRole={user.role} />
              </TabsContent>

              <TabsContent value="users">
                <div className="text-center py-12 text-gray-500">
                  用户管理功能开发中...
                </div>
              </TabsContent>

              <TabsContent value="finance">
                <div className="text-center py-12 text-gray-500">
                  财务管理功能开发中...
                </div>
              </TabsContent>

              <TabsContent value="stats">
                <div className="text-center py-12 text-gray-500">
                  数据统计功能开发中...
                </div>
              </TabsContent>
            </div>
          </ScrollArea>
        </Tabs>
      </div>
    </>
  );
}
