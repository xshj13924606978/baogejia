// 管理端交易配置更新 API
// PUT /api/admin/trade/config/[key] - 更新配置（实时生效，key 不存在时自动创建）

import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { updateTradeConfig, upsertTradeConfig } from '@/lib/trade-config-service';

async function updateConfig(request: NextRequest, params: any, user: any) {
  try {
    const { key } = params || {};
    if (!key) {
      return NextResponse.json({ success: false, error: '缺少配置键' }, { status: 400 });
    }

    const body = await request.json().catch(() => ({}));
    // #[20260830-1110] trade_config.updated_by 是 UUID+FK users.id；session token 签入的 user.id 才是真正的 UUID
    const input = {
      config_value: body.config_value,
      description: body.description,
      category: body.category,
      config_type: body.config_type,
      is_active: body.is_active,
    };
    let result = await updateTradeConfig(
      String(key),
      input,
      user?.id
    );
    // #202608302200 配置数据动态同步：统一数据源 trade_config，未预置的 key 首次写入时自动创建
    if (!result.success) {
      result = await upsertTradeConfig(
        {
          config_key: String(key),
          config_value: body.config_value,
          description: body.description,
          category: body.category,
          config_type: body.config_type,
          is_active: body.is_active,
        },
        user?.id
      );
    }
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, record: result.record });
  } catch (error) {
    console.error('[AdminTradeConfig PUT] 更新配置失败:', error);
    return NextResponse.json({ success: false, error: '更新配置失败' }, { status: 500 });
  }
}

export const PUT = withPermissionCheckWithParams({ permissions: 'admin.orders.edit' }, updateConfig);
