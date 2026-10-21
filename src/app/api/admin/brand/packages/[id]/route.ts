// 管理端品牌套餐 更新/删除 API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { updateBrandPackage, deleteBrandPackage } from '@/lib/brand-service';

async function updatePackage(request: NextRequest, params: any, _user: any) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少套餐 ID' }, { status: 400 });
    }
    const body = await request.json();
    const result = await updateBrandPackage(id, {
      code: body.code,
      name: body.name,
      description: body.description,
      price: body.price !== undefined ? Number(body.price) : undefined,
      original_price: body.original_price !== undefined ? Number(body.original_price) : undefined,
      priority_level: body.priority_level !== undefined ? Number(body.priority_level) : undefined,
      duration_days: body.duration_days !== undefined ? Number(body.duration_days) : undefined,
      boost_score: body.boost_score !== undefined ? Number(body.boost_score) : undefined,
      match_boost: body.match_boost !== undefined ? Number(body.match_boost) : undefined,
      is_verified: body.is_verified,
      sort_order: body.sort_order !== undefined ? Number(body.sort_order) : undefined,
      is_active: body.is_active,
      is_popular: body.is_popular,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, package: result.package });
  } catch (error) {
    console.error('[AdminBrandPackage PUT] 更新套餐失败:', error);
    return NextResponse.json({ success: false, error: '更新套餐失败' }, { status: 500 });
  }
}

async function removePackage(request: NextRequest, params: any, _user: any) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少套餐 ID' }, { status: 400 });
    }
    const result = await deleteBrandPackage(id);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, softDeleted: !!result.softDeleted });
  } catch (error) {
    console.error('[AdminBrandPackage DELETE] 删除套餐失败:', error);
    return NextResponse.json({ success: false, error: '删除套餐失败' }, { status: 500 });
  }
}

export const PUT = withPermissionCheckWithParams({ permissions: 'admin.brand.edit' }, updatePackage);
export const DELETE = withPermissionCheckWithParams({ permissions: 'admin.brand.edit' }, removePackage);
