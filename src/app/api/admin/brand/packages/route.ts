// 管理端品牌套餐 CRUD API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getBrandPackages, createBrandPackage } from '@/lib/brand-service';

async function listBrandPackages(_request: NextRequest, _user: any) {
  try {
    const packages = await getBrandPackages({ includeInactive: true });
    return NextResponse.json({ success: true, packages });
  } catch (error) {
    console.error('[AdminBrandPackages GET] 获取套餐失败:', error);
    return NextResponse.json({ success: false, error: '获取套餐列表失败' }, { status: 500 });
  }
}

async function createPackage(request: NextRequest, _user: any) {
  try {
    const body = await request.json();
    const { code, name, description, price, original_price, priority_level, duration_days, boost_score, match_boost, is_verified, sort_order, is_active, is_popular } = body || {};

    if (!code || !name || price === undefined || priority_level === undefined || !duration_days) {
      return NextResponse.json(
        { success: false, error: '缺少必填字段（code/name/price/priority_level/duration_days）' },
        { status: 400 }
      );
    }

    const result = await createBrandPackage({
      code,
      name,
      description,
      price: Number(price),
      original_price: original_price !== undefined ? Number(original_price) : undefined,
      priority_level: Number(priority_level),
      duration_days: Number(duration_days),
      boost_score: boost_score !== undefined ? Number(boost_score) : undefined,
      match_boost: match_boost !== undefined ? Number(match_boost) : undefined,
      is_verified,
      sort_order: sort_order !== undefined ? Number(sort_order) : 0,
      is_active,
      is_popular,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, package: result.package });
  } catch (error) {
    console.error('[AdminBrandPackages POST] 创建套餐失败:', error);
    return NextResponse.json({ success: false, error: '创建套餐失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.brand.view' }, listBrandPackages);
export const POST = withPermissionCheck({ permissions: 'admin.brand.edit' }, createPackage);
