// 管理端商城兑换发货/发放 API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { deliverExchange } from '@/lib/mall-service';

export const POST = withPermissionCheckWithParams(
  { permissions: 'admin.mall.deliver' },
  async (request: NextRequest, params: any, user: any) => {
    try {
      const { id } = await params;
      const body = await request.json().catch(() => ({}));
      const result = await deliverExchange(user?.id, id, body.deliveryInfo || undefined);
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
      }
      return NextResponse.json({ success: true, exchange: result.exchange });
    } catch (error) {
      console.error('[AdminMallDeliver] 发货失败:', error);
      return NextResponse.json({ success: false, error: '确认发货失败' }, { status: 500 });
    }
  }
);
