'use client';

import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import {
  DropdownMenu,
  DropdownMenuContent,
  DropdownMenuItem,
  DropdownMenuSeparator,
  DropdownMenuTrigger,
} from '@/components/ui/dropdown-menu';
import { User, LogOut, Settings, Crown, Building2, Shield, UserCircle } from 'lucide-react';
import UserSidebar from './user-sidebar';
import ManufacturerPaymentPanel from '@/components/manufacturer-payment-panel';
import AdminPanel from '../admin/admin-panel';

export default function UserMenu({ user }: { user: any }) {
  const [showUserSidebar, setShowUserSidebar] = useState(false);
  const [showManufacturer, setShowManufacturer] = useState(false);
  const [showAdmin, setShowAdmin] = useState(false);
  const [currentUser, setCurrentUser] = useState(user);

  // 监听 localStorage 变化
  useEffect(() => {
    const handleStorageChange = () => {
      const userStr = localStorage.getItem('user');
      if (userStr) {
        setCurrentUser(JSON.parse(userStr));
      }
    };
    window.addEventListener('storage', handleStorageChange);
    return () => window.removeEventListener('storage', handleStorageChange);
  }, []);

  const getRoleBadge = () => {
    switch(currentUser?.role) {
      case 'super_admin':
        return (
          <Badge className="bg-red-500 hover:bg-red-600">
            <Shield className="h-3 w-3 mr-1" />
            管理员
          </Badge>
        );
      case 'vip':
        return (
          <Badge className="bg-purple-500 hover:bg-purple-600">
            <Crown className="h-3 w-3 mr-1" />
            高级会员
          </Badge>
        );
      case 'manufacturer':
        return (
          <Badge className="bg-green-500 hover:bg-green-600">
            <Building2 className="h-3 w-3 mr-1" />
            认证厂家
          </Badge>
        );
      default:
        return (
          <Badge variant="secondary">
            <User className="h-3 w-3 mr-1" />
            普通用户
          </Badge>
        );
    }
  };

  const getQuotaInfo = () => {
    if (currentUser?.role === 'vip') {
      return '无限次';
    }
    const used = currentUser?.quota_used || 0;
    const total = currentUser?.quota_total || 10;
    return `${used}/${total}次`;
  };

  const handleLogout = () => {
    localStorage.removeItem('user');
    window.location.reload();
  };

  const handleRefreshUser = async () => {
    try {
      const res = await fetch('/api/auth/me');
      if (res.ok) {
        const data = await res.json();
        if (data.success) {
          localStorage.setItem('user', JSON.stringify(data.user));
          setCurrentUser(data.user);
        }
      }
    } catch (err) {
      console.error('刷新用户信息失败:', err);
    }
  };

  // 自动刷新用户信息
  useEffect(() => {
    if (currentUser?.id) {
      handleRefreshUser();
    }
  }, [currentUser?.id]);

  if (!currentUser) {
    return null;
  }

  return (
    <>
      <DropdownMenu>
        <DropdownMenuTrigger asChild>
          <Button variant="outline" className="flex items-center gap-2">
            <UserCircle className="h-5 w-5" />
            <span className="font-medium">{currentUser.username}</span>
            {getRoleBadge()}
            <Badge variant="outline">{currentUser.points || 0}积分</Badge>
            {currentUser.role === 'user' && (
              <Badge variant="outline">{getQuotaInfo()}</Badge>
            )}
          </Button>
        </DropdownMenuTrigger>
        <DropdownMenuContent align="end" className="w-56">
          <DropdownMenuItem onClick={() => setShowUserSidebar(true)}>
            <User className="h-4 w-4 mr-2" />
            个人中心
          </DropdownMenuItem>

          {currentUser.role === 'manufacturer' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowManufacturer(true)}>
                <Building2 className="h-4 w-4 mr-2" />
                厂家中心
              </DropdownMenuItem>
            </>
          )}

          {currentUser.role === 'super_admin' && (
            <>
              <DropdownMenuSeparator />
              <DropdownMenuItem onClick={() => setShowAdmin(true)}>
                <Shield className="h-4 w-4 mr-2" />
                管理后台
              </DropdownMenuItem>
            </>
          )}

          <DropdownMenuSeparator />
          <DropdownMenuItem onClick={handleLogout} className="text-red-600">
            <LogOut className="h-4 w-4 mr-2" />
            退出登录
          </DropdownMenuItem>
        </DropdownMenuContent>
      </DropdownMenu>

      {/* 侧边栏 */}
      <UserSidebar
        isOpen={showUserSidebar}
        onClose={() => setShowUserSidebar(false)}
        user={currentUser}
        onUserUpdate={setCurrentUser}
      />
      <ManufacturerPaymentPanel
        userId={currentUser.id}
        userRole={currentUser.role}
        isVerified={currentUser.verified}
      />
      <AdminPanel
        isOpen={showAdmin}
        onClose={() => setShowAdmin(false)}
        user={currentUser}
      />
    </>
  );
}
