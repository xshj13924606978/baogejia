// 管理端品牌审核通过 API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { reviewBrand } from '@/lib/brand-service';

async function approveBrand(_request: NextRequest, params: any, user: any) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少品牌 ID' }, { status: 400 });
    }
    // #20260831-1600 P1-11：记录审核人并站内信通知用户
    const result = await reviewBrand(id, 'approve', { adminId: user?.id });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, brand: result.brand });
  } catch (error) {
    console.error('[AdminBrandApprove POST] 审核通过失败:', error);
    return NextResponse.json({ success: false, error: '审核失败' }, { status: 500 });
  }
}

export const POST = withPermissionCheckWithParams({ permissions: 'admin.brand.edit' }, approveBrand);
