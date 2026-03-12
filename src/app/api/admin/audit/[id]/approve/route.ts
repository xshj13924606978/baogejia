import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';


export const POST = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.audit.approve'] },
  async (request: NextRequest, user: any) => {

  try {
    // 从 URL 中提取 id
    const url = new URL(request.url);
    const pathParts = url.pathname.split('/');
    const auditIdStr = pathParts[pathParts.length - 1];
    const auditId = parseInt(auditIdStr);
    const { points = 0 } = await request.json();

    // 模拟审核通过
    console.log(`审核通过项目 ${auditId}，奖励积分: ${points}`);

    return NextResponse.json({ success: true, points });
  } catch (error) {
    console.error('审核通过失败:', error);
    return NextResponse.json(
      { error: '审核通过失败' }, { status: 500 }
      );
  }
});