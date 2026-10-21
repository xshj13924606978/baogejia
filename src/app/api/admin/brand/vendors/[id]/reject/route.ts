// 管理端品牌审核拒绝 API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { reviewBrand } from '@/lib/brand-service';

async function rejectBrand(request: NextRequest, params: any, user: any) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少品牌 ID' }, { status: 400 });
    }
    // #20260831-1600 P1-11：拒绝原因 + 审核人留痕，并站内信通知用户
    const body = await request.json().catch(() => ({}));
    const reason = typeof body?.reason === 'string' ? body.reason.trim() : undefined;
    const result = await reviewBrand(id, 'reject', { adminId: user?.id, reason });
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, brand: result.brand });
  } catch (error) {
    console.error('[AdminBrandReject POST] 审核拒绝失败:', error);
    return NextResponse.json({ success: false, error: '审核失败' }, { status: 500 });
  }
}

export const POST = withPermissionCheckWithParams({ permissions: 'admin.brand.edit' }, rejectBrand);
