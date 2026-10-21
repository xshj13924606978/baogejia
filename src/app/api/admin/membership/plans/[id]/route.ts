// 管理端会员套餐 更新/删除 API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { updateMembershipPlan, deleteMembershipPlan } from '@/lib/membership-service';

async function updatePlan(request: NextRequest, params: any, _user: any) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少套餐 ID' }, { status: 400 });
    }
    const body = await request.json();
    const result = await updateMembershipPlan(id, {
      code: body.code,
      name: body.name,
      description: body.description,
      price: body.price !== undefined ? Number(body.price) : undefined,
      original_price: body.original_price !== undefined ? Number(body.original_price) : undefined,
      duration_days: body.duration_days !== undefined ? Number(body.duration_days) : undefined,
      level_code: body.level_code,
      benefits: body.benefits,
      sort_order: body.sort_order !== undefined ? Number(body.sort_order) : undefined,
      is_active: body.is_active,
      is_popular: body.is_popular,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, plan: result.plan });
  } catch (error) {
    console.error('[AdminMembershipPlan PUT] 更新套餐失败:', error);
    return NextResponse.json({ success: false, error: '更新套餐失败' }, { status: 500 });
  }
}

async function removePlan(request: NextRequest, params: any, _user: any) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少套餐 ID' }, { status: 400 });
    }
    const result = await deleteMembershipPlan(id);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, softDeleted: !!result.softDeleted });
  } catch (error) {
    console.error('[AdminMembershipPlan DELETE] 删除套餐失败:', error);
    return NextResponse.json({ success: false, error: '删除套餐失败' }, { status: 500 });
  }
}

export const PUT = withPermissionCheckWithParams({ permissions: 'admin.membership.edit' }, updatePlan);
export const DELETE = withPermissionCheckWithParams({ permissions: 'admin.membership.edit' }, removePlan);
