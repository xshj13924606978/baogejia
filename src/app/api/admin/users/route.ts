import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';

export const GET = withPermissionCheck(
  { requiresAuth: true, permissions: ['user.view'] },
  async (request: NextRequest, _context: any) => {
    try {
      // 模拟用户数据
      const mockUsers = [
        {
          id: 1,
          username: 'admin',
          email: 'admin@example.com',
          role: 'super_admin',
          points: 1000,
          status: 'active',
          created_at: '2024-01-01T00:00:00Z'},
        {
          id: 2,
          username: 'user1',
          email: 'user1@example.com',
          role: 'vip',
          points: 500,
          status: 'active',
          created_at: '2024-01-15T00:00:00Z'},
        {
          id: 3,
          username: 'user2',
          email: 'user2@example.com',
          role: 'manufacturer',
          points: 300,
          status: 'active',
          created_at: '2024-02-01T00:00:00Z'},
        {
          id: 4,
          username: 'user3',
          email: 'user3@example.com',
          role: 'user',
          points: 50,
          status: 'active',
          created_at: '2024-02-10T00:00:00Z'},
        {
          id: 5,
          username: 'user4',
          email: 'user4@example.com',
          role: 'pending',
          points: 0,
          status: 'active',
          created_at: '2024-02-15T00:00:00Z'},
      ];

      return NextResponse.json(mockUsers);
    } catch (error) {
      console.error('获取用户列表失败:', error);
      return NextResponse.json({ error: '获取用户列表失败' }, { status: 500 });
    }
  }
);
