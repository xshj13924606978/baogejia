import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';


export const POST = withPermissionCheck(
  { requiresAuth: true, permissions: ['user.points.edit'] },
  async (request: NextRequest, user: any) => {

  try {
    // 从 URL 中提取 id
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const userIdStr = pathParts[pathParts.length - 1];
    const userId = parseInt(userIdStr);
    const { points } = await request.json();

    if (typeof points !== 'number') {
      return NextResponse.json(
        { error: '无效的积分值' }, { status: 400 }
      );
    }

    // 模拟积分分配
    console.log(`给用户 ${userId} 分配 ${points} 积分`);

    return NextResponse.json({
      success: true,
      newPoints: 1000 + points,
      pointsChange: points
    });
  } catch (error) {
    console.error('分配积分失败:', error);
    return NextResponse.json(
      { error: '分配积分失败' }, { status: 500 }
      );
  }
});