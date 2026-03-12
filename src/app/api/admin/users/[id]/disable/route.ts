import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';


export const POST = withPermissionCheck(
  { requiresAuth: true, permissions: ['user.disable'] },
  async (request: NextRequest, user: any) => {

  try {
    // 从 URL 中提取 id
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const userIdStr = pathParts[pathParts.length - 1];
    const userId = parseInt(userIdStr);

    // 模拟用户状态切换
    console.log(`切换用户 ${userId} 的状态`);

    return NextResponse.json({
      success: true,
      status: 'disabled'
    });
  } catch (error) {
    console.error('更新用户状态失败:', error);
    return NextResponse.json(
      { error: '更新用户状态失败' }, { status: 500 }
      );
  }
});