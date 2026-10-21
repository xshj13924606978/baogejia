// 管理端会员用户列表 API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getMembershipUsers } from '@/lib/membership-service';

async function listMembershipUsers(request: NextRequest, _user: any) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const page = Math.max(1, Number(searchParams.get('page')) || 1);
    const pageSize = Math.min(100, Math.max(1, Number(searchParams.get('pageSize')) || 20));
    const result = await getMembershipUsers({ page, pageSize });
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
    return NextResponse.json({ success: true, records: result.records, total: result.total });
  } catch (error) {
    console.error('[AdminMembershipUsers GET] 获取会员用户失败:', error);
    return NextResponse.json({ success: false, error: '获取会员用户失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.membership.view' }, listMembershipUsers);
