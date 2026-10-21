// 管理端会员套餐 CRUD API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getMembershipPlans, createMembershipPlan } from '@/lib/membership-service';

async function getPlans(_request: NextRequest, _user: any) {
  try {
    const plans = await getMembershipPlans({ includeInactive: true });
    return NextResponse.json({ success: true, plans });
  } catch (error) {
    console.error('[AdminMembershipPlans GET] 获取套餐失败:', error);
    return NextResponse.json({ success: false, error: '获取套餐列表失败' }, { status: 500 });
  }
}

async function createPlan(request: NextRequest, _user: any) {
  try {
    const body = await request.json();
    const { code, name, description, price, original_price, duration_days, level_code, benefits, sort_order, is_active, is_popular } = body || {};

    if (!code || !name || price === undefined || !duration_days || !level_code) {
      return NextResponse.json({ success: false, error: '缺少必填字段（code/name/price/duration_days/level_code）' }, { status: 400 });
    }

    const result = await createMembershipPlan({
      code,
      name,
      description,
      price: Number(price),
      original_price: original_price !== undefined ? Number(original_price) : undefined,
      duration_days: Number(duration_days),
      level_code,
      benefits,
      sort_order: sort_order !== undefined ? Number(sort_order) : 0,
      is_active,
      is_popular,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, plan: result.plan });
  } catch (error) {
    console.error('[AdminMembershipPlans POST] 创建套餐失败:', error);
    return NextResponse.json({ success: false, error: '创建套餐失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.membership.view' }, getPlans);
export const POST = withPermissionCheck({ permissions: 'admin.membership.edit' }, createPlan);
