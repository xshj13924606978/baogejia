// 管理端积分商城商品管理 API（列表 + 创建）
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getMallProducts, createMallProduct, MallProductInput } from '@/lib/mall-service';

async function handleGET(_request: NextRequest): Promise<NextResponse> {
  try {
    const products = await getMallProducts({ includeInactive: true });
    return NextResponse.json({ success: true, products });
  } catch (error) {
    console.error('[AdminMallProducts] 查询失败:', error);
    return NextResponse.json({ success: false, error: '获取商品列表失败' }, { status: 500 });
  }
}

async function handlePOST(request: NextRequest): Promise<NextResponse> {
  try {
    const body = (await request.json()) as MallProductInput;
    if (!body.name) {
      return NextResponse.json({ success: false, error: '商品名称不能为空' }, { status: 400 });
    }
    if (!['vip', 'rank', 'gift', 'template', 'physical', 'custom'].includes(body.category)) {
      return NextResponse.json({ success: false, error: '商品分类无效' }, { status: 400 });
    }
    const result = await createMallProduct(body);
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 500 });
    }
    return NextResponse.json({ success: true, product: result.product }, { status: 201 });
  } catch (error) {
    console.error('[AdminMallProducts] 创建失败:', error);
    return NextResponse.json({ success: false, error: '创建商品失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.mall.view' }, handleGET);
export const POST = withPermissionCheck({ permissions: 'admin.mall.create' }, handlePOST);
