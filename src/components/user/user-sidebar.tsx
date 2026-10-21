'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { ScrollArea } from '@/components/ui/scroll-area';
import { X } from 'lucide-react';
import { Tabs, TabsContent, TabsList, TabsTrigger } from '@/components/ui/tabs';
import PointsPanel from '@/components/PointsPanel'
import UserRecord from '@/components/user/user-records';
import InviteFriends from '@/components/user/invite-friends';
// #202608292400-阶段一: 积分商城恢复为数据库驱动版本（原静态版本曾隐藏）
import PointsMall from '@/components/user/points-mall';
import WithdrawPanel from '@/components/user/withdraw-panel';
// #202608292500-阶段二: 新增会员中心 + Token充值
import MembershipPanel from '@/components/user/membership-panel';
import TokenPanel from '@/components/user/token-panel';
// #202608292600-阶段三: 新增品牌推广（入驻/管理/购买）
import BrandPanel from '@/components/user/brand-panel';
// #202608292700-阶段四: 新增统一订单（我的订单）
import OrderList from '@/components/user/order-list';
import Notifications from '@/components/user/notifications';
import UserStats from '@/components/user/user-stats';
import QuotesPanel from '@/components/user/quotes-panel';
// #202608302800 P0-2: 挂载「权限升级」入口（积分兑换等级）
import { PermissionPanel } from '@/components/user/PermissionPanel';

interface UserSidebarProps {
  isOpen: boolean;
  onClose: () => void;
  user: any;
  onUserUpdate?: (user: any) => void;
}

export default function UserSidebar({ isOpen, onClose, user, onUserUpdate }: UserSidebarProps) {
  const [activeTab, setActiveTab] = useState('points');
  const [unreadCount, setUnreadCount] = useState(0);
  const [updatedUser, setUpdatedUser] = useState(user);

  const tabs = [
    { id: 'points', name: '积分中心', icon: '💰' },
    { id: 'invite', name: '邀请好友', icon: '🤝' },
    // #202608292400-阶段一: 积分商城恢复为数据库驱动版本
    { id: 'mall', name: '积分商城', icon: '🎁' },
    // #202608292400-阶段一: 新增积分提现
    { id: 'withdraw', name: '积分提现', icon: '🏧' },
    // #202608292500-阶段二: 新增会员中心 + Token充值
    { id: 'vip', name: '会员中心', icon: '👑' },
    { id: 'token', name: 'Token充值', icon: '⚡' },
    // #202608292600-阶段三: 新增品牌推广
    { id: 'brand', name: '品牌推广', icon: '🏪' },
    // #202608292700-阶段四: 新增统一订单（我的订单）
    { id: 'orders', name: '我的订单', icon: '🧾' },
    { id: 'quotes', name: '报价管理', icon: '📄' },
    { id: 'stats', name: '数据看板', icon: '📊' },
    // #202608302800 P0-2: 权限升级（积分兑换等级），与会员中心并列
    { id: 'permission', name: '权限升级', icon: '⬆️' },
    { id: 'notify', name: '消息', icon: '🔔' },
  ];

  // 刷新用户信息
  const refreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('user', JSON.stringify(data.user));
          setUpdatedUser(data.user);
          onUserUpdate?.(data.user);
        }
      }
    } catch (err) {
      console.error('刷新用户信息失败:', err);
    }
  };

  useEffect(() => {
    if (isOpen) {
      refreshUser();
    }
  }, [isOpen]);

  if (!isOpen) return null;

  return (
    <>
      <div className="fixed inset-0 bg-black bg-opacity-50 z-40" onClick={onClose} />

      <div className="fixed right-0 top-0 bottom-0 w-96 bg-white shadow-xl z-50 flex flex-col h-screen">
        {/* 头部 */}
        <div className="flex-shrink-0 p-4 border-b flex justify-between items-center">
          <h2 className="text-lg font-bold">👤 个人中心</h2>
          <Button variant="ghost" size="icon" onClick={onClose}>
            <X className="h-5 w-5" />
          </Button>
        </div>

        {/* 用户信息卡片 */}
        <div className="flex-shrink-0 p-4 bg-gradient-to-r from-blue-50 to-purple-50">
          <div className="flex items-center gap-3 mb-3">
            <div className="h-12 w-12 bg-gradient-to-br from-blue-500 to-purple-500 rounded-full flex items-center justify-center text-white text-xl font-bold">
              {updatedUser.username?.charAt(0).toUpperCase()}
            </div>
            <div className="flex-1">
              <div className="font-medium text-lg">{updatedUser.username}</div>
              <div className="text-sm text-gray-600">{updatedUser.email || updatedUser.phone}</div>
            </div>
          </div>

          <div className="flex flex-wrap gap-2">
            {updatedUser.role === 'vip' && (
              <div className="flex items-center gap-1 px-2 py-1 bg-purple-100 text-purple-700 rounded text-xs">
                💎 高级会员
              </div>
            )}
            {updatedUser.role === 'manufacturer' && (
              <div className="flex items-center gap-1 px-2 py-1 bg-green-100 text-green-700 rounded text-xs">
                🏭 认证厂家
              </div>
            )}
            {updatedUser.role === 'super_admin' && (
              <div className="flex items-center gap-1 px-2 py-1 bg-red-100 text-red-700 rounded text-xs">
                🛡️ 超级管理员
              </div>
            )}
            {updatedUser.role === 'user' && (
              <div className="flex items-center gap-1 px-2 py-1 bg-gray-100 text-gray-700 rounded text-xs">
                👤 普通用户
              </div>
            )}
            <div className="flex items-center gap-1 px-2 py-1 bg-blue-100 text-blue-700 rounded text-xs">
              ⭐ {updatedUser.points || 0}积分
            </div>
            {updatedUser.role === 'user' && (
              <div className="flex items-center gap-1 px-2 py-1 bg-orange-100 text-orange-700 rounded text-xs">
                📊 {updatedUser.quota_total - updatedUser.quota_used}次可用
              </div>
            )}
          </div>
        </div>

        {/* 标签页 */}
        <div className="flex-1 flex flex-col min-h-0 overflow-hidden">
          <Tabs value={activeTab} onValueChange={setActiveTab} className="flex flex-col h-full">
            {/* 标签页头部 */}
            <div className="flex-shrink-0 border-b px-4">
              {/* #202608292500-阶段二: 9 个 tab 改为 3 列网格 */}
              <TabsList className="grid w-full grid-cols-3">
                {tabs.map((tab) => (
                  <TabsTrigger key={tab.id} value={tab.id} className="text-xs">
                    <span className="mr-1">{tab.icon}</span>
                    <span className="hidden sm:inline">{tab.name}</span>
                    {tab.id === 'notify' && unreadCount > 0 && (
                      <span className="ml-1 px-1 py-0.5 bg-red-500 text-white text-[10px] rounded-full">
                        {unreadCount}
                      </span>
                    )}
                  </TabsTrigger>
                ))}
              </TabsList>
            </div>

            {/* 滚动区域 */}
            <div className="flex-1 overflow-hidden min-h-0">
              <ScrollArea className="h-full">
                <div className="p-4">
                  <TabsContent value="points" className="mt-0">
                    <PointsPanel userId={updatedUser.id} />
                  </TabsContent>

                  <TabsContent value="invite" className="mt-0">
                    <InviteFriends user={updatedUser} />
                  </TabsContent>

                  {/* #202608292400-阶段一: 积分商城恢复为数据库驱动版本 */}
                  <TabsContent value="mall" className="mt-0">
                    <PointsMall user={updatedUser} />
                  </TabsContent>

                  {/* #202608292400-阶段一: 新增积分提现 */}
                  <TabsContent value="withdraw" className="mt-0">
                    <WithdrawPanel user={updatedUser} />
                  </TabsContent>

                  {/* #202608292500-阶段二: 会员中心 + Token充值 */}
                  <TabsContent value="vip" className="mt-0">
                    <MembershipPanel />
                  </TabsContent>

                  <TabsContent value="token" className="mt-0">
                    <TokenPanel />
                  </TabsContent>

                  {/* #202608292600-阶段三: 品牌推广 */}
                  <TabsContent value="brand" className="mt-0">
                    <BrandPanel />
                  </TabsContent>

                  {/* #202608292700-阶段四: 统一订单（我的订单） */}
                  <TabsContent value="orders" className="mt-0">
                    <OrderList userId={updatedUser.id} />
                  </TabsContent>

                  <TabsContent value="quotes" className="mt-0">
                    <QuotesPanel user={updatedUser} />
                  </TabsContent>

                  <TabsContent value="stats" className="mt-0">
                    <UserStats user={updatedUser} />
                  </TabsContent>

                  {/* #202608302800 P0-2: 权限升级入口（积分兑换等级） */}
                  <TabsContent value="permission" className="mt-0">
                    <PermissionPanel />
                  </TabsContent>

                  <TabsContent value="notify" className="mt-0">
                    <Notifications user={updatedUser} onUnreadChange={setUnreadCount} />
                  </TabsContent>
                </div>
              </ScrollArea>
            </div>
          </Tabs>
        </div>

        {/* VIP升级提示（仅普通用户） */}
        {updatedUser.role === 'user' && (
          <div className="flex-shrink-0 p-4 border-t bg-gradient-to-r from-purple-50 to-pink-50">
            <div className="text-sm">
              <div className="font-bold text-purple-700 mb-2">💎 升级高级会员</div>
              <ul className="text-xs space-y-1 text-gray-600 mb-3">
                <li>✓ 无限次生成报价单和方案</li>
                <li>✓ 无水印PDF导出</li>
                <li>✓ 查看所有资料库</li>
                <li>✓ 专属客服支持</li>
              </ul>
              {/* #202608292500-阶段二: 会员购买链路已接入微信支付，引导跳转会员中心 */}
              <button
                onClick={() => setActiveTab('vip')}
                className="w-full rounded-lg bg-purple-500 px-3 py-2 text-center text-xs font-semibold text-white hover:bg-purple-600 transition-colors"
              >
                立即开通会员
              </button>
            </div>
          </div>
        )}
      </div>
    </>
  );
}
