export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { listContributors, listPendingUploads } from '@/lib/contributor/service';

/**
 * 管理接口：获取贡献者列表
 * 需要管理员权限
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const contributors = await listContributors();
    return NextResponse.json({ success: true, contributors });
  } catch (error) {
    console.error('[Admin] 获取贡献者列表异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
