import { useState, useEffect } from 'react';

export interface User {
  id: string;
  name: string;
  email: string;
  role: string;
  avatar?: string;
  phone?: string;
  company?: string;
  online_status?: boolean;
  last_seen?: string;
}

export function useUser() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    try {
      // 从 localStorage 获取用户信息
      const userStr = localStorage.getItem('user');

      if (userStr) {
        const userData = JSON.parse(userStr);
        setUser(userData);
      } else {
        setUser(null);
      }
    } catch (err) {
      console.error('Failed to parse user data:', err);
      setError('Failed to load user data');
      setUser(null);
    } finally {
      setLoading(false);
    }
  }, []);

  // 登录方法
  const login = async (email: string, password: string) => {
    try {
      setLoading(true);

      const response = await fetch('/api/auth/login', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ email, password }),
      });

      if (!response.ok) {
        throw new Error('Login failed');
      }

      const userData = await response.json();

      // 保存到 localStorage
      localStorage.setItem('user', JSON.stringify(userData));
      setUser(userData);

      return { success: true, user: userData };
    } catch (err) {
      console.error('Login error:', err);
      return { success: false, error: 'Login failed' };
    } finally {
      setLoading(false);
    }
  };

  // 登出方法
  const logout = () => {
    localStorage.removeItem('user');
    setUser(null);
  };

  // 更新用户信息
  const updateUser = (updates: Partial<User>) => {
    if (user) {
      const updatedUser = { ...user, ...updates };
      localStorage.setItem('user', JSON.stringify(updatedUser));
      setUser(updatedUser);
    }
  };

  return {
    user,
    loading,
    error,
    login,
    logout,
    updateUser,
    isAuthenticated: !!user,
  };
}
