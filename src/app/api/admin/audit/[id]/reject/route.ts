import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';

export const POST = withPermissionCheck(
  { requiresAuth: true, permissions: ['admin.audit.reject'] },
  async (request: NextRequest, _context: any) => {
    try {
      // 从 URL 中提取 id
      const url = new URL(request.url);
      const pathParts = url.pathname.split('/');
      const auditIdStr = pathParts[pathParts.length - 1];
      const auditId = parseInt(auditIdStr);
      const { reason } = await request.json();

      if (!reason) {
        return NextResponse.json({ error: '请提供拒绝原因' }, { status: 400 });
      }

      // 模拟审核拒绝
      console.log(`审核拒绝项目 ${auditId}，原因: ${reason}`);

      return NextResponse.json({ success: true, reason });
    } catch (error) {
      console.error('审核拒绝失败:', error);
      return NextResponse.json({ error: '审核拒绝失败' }, { status: 500 });
    }
  }
);
