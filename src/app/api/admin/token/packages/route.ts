// 管理端 Token 套餐 CRUD API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getTokenPackages, createTokenPackage } from '@/lib/token-purchase-service';

async function listTokenPackages(_request: NextRequest, _user: any) {
  try {
    const packages = await getTokenPackages({ includeInactive: true });
    return NextResponse.json({ success: true, packages });
  } catch (error) {
    console.error('[AdminTokenPackages GET] 获取套餐失败:', error);
    return NextResponse.json({ success: false, error: '获取套餐列表失败' }, { status: 500 });
  }
}

async function createTokenPkg(request: NextRequest, _user: any) {
  try {
    const body = await request.json();
    const { code, name, description, token_amount, price, original_price, bonus_token, sort_order, is_active, is_popular } = body || {};

    if (!code || !name || token_amount === undefined || price === undefined) {
      return NextResponse.json({ success: false, error: '缺少必填字段（code/name/token_amount/price）' }, { status: 400 });
    }

    const result = await createTokenPackage({
      code,
      name,
      description,
      token_amount: Number(token_amount),
      price: Number(price),
      original_price: original_price !== undefined ? Number(original_price) : undefined,
      bonus_token: bonus_token !== undefined ? Number(bonus_token) : 0,
      sort_order: sort_order !== undefined ? Number(sort_order) : 0,
      is_active,
      is_popular,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, package: result.package });
  } catch (error) {
    console.error('[AdminTokenPackages POST] 创建套餐失败:', error);
    return NextResponse.json({ success: false, error: '创建套餐失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.token.view' }, listTokenPackages);
export const POST = withPermissionCheck({ permissions: 'admin.token.edit' }, createTokenPkg);
