'use client';

import { useEffect } from 'react';
import { useUser } from '@/contexts/UserContext';

// 用于管理多标签页登录状态的钩子
export function useAuthState() {
  const { user, logout } = useUser();

  useEffect(() => {
    if (typeof window === 'undefined') return;

    // 生成唯一的标签页ID
    const tabId =
      sessionStorage.getItem('tab_id') ||
      'tab-' + Date.now() + '-' + Math.random().toString(36).substr(2, 9);
    sessionStorage.setItem('tab_id', tabId);

    // 广播登录状态变化
    const handleStorageChange = (e: StorageEvent) => {
      if (e.key === 'auth_logout' && e.newValue) {
        const { tabId: logoutTabId } = JSON.parse(e.newValue);
        // 如果是其他标签页发起的登出，当前标签页也登出
        if (logoutTabId !== tabId) {
          logout();
        }
      }

      if (e.key === 'auth_login' && e.newValue) {
        const { tabId: loginTabId } = JSON.parse(e.newValue);
        // 如果是其他标签页登录，刷新当前页面以同步状态
        if (loginTabId !== tabId) {
          window.location.reload();
        }
      }
    };

    // 广播登录事件
    const broadcastLogin = () => {
      localStorage.setItem(
        'auth_login',
        JSON.stringify({
          tabId,
          timestamp: Date.now(),
        })
      );
      // 清除记录，避免重复触发
      setTimeout(() => {
        localStorage.removeItem('auth_login');
      }, 100);
    };

    // 广播登出事件
    const broadcastLogout = () => {
      localStorage.setItem(
        'auth_logout',
        JSON.stringify({
          tabId,
          timestamp: Date.now(),
        })
      );
      // 清除记录，避免重复触发
      setTimeout(() => {
        localStorage.removeItem('auth_logout');
      }, 100);
    };

    window.addEventListener('storage', handleStorageChange);

    // 监听自定义登录事件
    const handleLogin = () => broadcastLogin();
    const handleLogout = () => broadcastLogout();

    window.addEventListener('user-login', handleLogin);
    window.addEventListener('user-logout', handleLogout);

    // 如果当前有用户，广播登录状态
    if (user) {
      broadcastLogin();
    }

    return () => {
      window.removeEventListener('storage', handleStorageChange);
      window.removeEventListener('user-login', handleLogin);
      window.removeEventListener('user-logout', handleLogout);
    };
  }, [user, logout]);
}
