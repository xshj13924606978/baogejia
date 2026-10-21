// 管理端积分商城商品详情 API（更新 + 删除）
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { updateMallProduct, deleteMallProduct } from '@/lib/mall-service';

export const PUT = withPermissionCheckWithParams(
  { permissions: 'admin.mall.update' },
  async (request: NextRequest, params: any) => {
    try {
      const { id } = await params;
      const body = await request.json();
      const result = await updateMallProduct(id, body);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.reason }, { status: 500 });
      }
      return NextResponse.json({ success: true, product: result.product });
    } catch (error) {
      console.error('[AdminMallProductUpdate] 更新失败:', error);
      return NextResponse.json({ success: false, error: '更新商品失败' }, { status: 500 });
    }
  }
);

export const DELETE = withPermissionCheckWithParams(
  { permissions: 'admin.mall.delete' },
  async (_request: NextRequest, params: any) => {
    try {
      const { id } = await params;
      const result = await deleteMallProduct(id);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.reason }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        softDeleted: result.softDeleted,
        message: result.softDeleted ? '商品已下架（存在兑换记录，不可物理删除）' : '商品已删除',
      });
    } catch (error) {
      console.error('[AdminMallProductDelete] 删除失败:', error);
      return NextResponse.json({ success: false, error: '删除商品失败' }, { status: 500 });
    }
  }
);
