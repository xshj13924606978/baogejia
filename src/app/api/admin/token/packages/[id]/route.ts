// 管理端 Token 套餐 更新/删除 API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { updateTokenPackage, deleteTokenPackage } from '@/lib/token-purchase-service';

async function updateTokenPkg(request: NextRequest, params: any, _user: any) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少套餐 ID' }, { status: 400 });
    }
    const body = await request.json();
    const result = await updateTokenPackage(id, {
      code: body.code,
      name: body.name,
      description: body.description,
      token_amount: body.token_amount !== undefined ? Number(body.token_amount) : undefined,
      price: body.price !== undefined ? Number(body.price) : undefined,
      original_price: body.original_price !== undefined ? Number(body.original_price) : undefined,
      bonus_token: body.bonus_token !== undefined ? Number(body.bonus_token) : undefined,
      sort_order: body.sort_order !== undefined ? Number(body.sort_order) : undefined,
      is_active: body.is_active,
      is_popular: body.is_popular,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, package: result.package });
  } catch (error) {
    console.error('[AdminTokenPackage PUT] 更新套餐失败:', error);
    return NextResponse.json({ success: false, error: '更新套餐失败' }, { status: 500 });
  }
}

async function removeTokenPkg(request: NextRequest, params: any, _user: any) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少套餐 ID' }, { status: 400 });
    }
    const result = await deleteTokenPackage(id);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, softDeleted: !!result.softDeleted });
  } catch (error) {
    console.error('[AdminTokenPackage DELETE] 删除套餐失败:', error);
    return NextResponse.json({ success: false, error: '删除套餐失败' }, { status: 500 });
  }
}

export const PUT = withPermissionCheckWithParams({ permissions: 'admin.token.edit' }, updateTokenPkg);
export const DELETE = withPermissionCheckWithParams({ permissions: 'admin.token.edit' }, removeTokenPkg);
