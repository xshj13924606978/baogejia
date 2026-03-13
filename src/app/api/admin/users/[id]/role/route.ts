import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';

export const POST = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.access'] },
  async (request: NextRequest, _context: any) => {
    try {
      // 从 URL 中提取 id
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      const userIdStr = pathParts[pathParts.length - 1];
      const userId = parseInt(userIdStr);
      const { role } = await request.json();

      const validRoles = ['user', 'vip', 'manufacturer', 'super_admin', 'pending'];

      if (!validRoles.includes(role)) {
        return NextResponse.json({ error: '无效的角色' }, { status: 400 });
      }

      // 模拟角色设置
      console.log(`设置用户 ${userId} 的角色为 ${role}`);

      return NextResponse.json({ success: true, role });
    } catch (error) {
      console.error('设置角色失败:', error);
      return NextResponse.json({ error: '设置角色失败' }, { status: 500 });
    }
  }
);
