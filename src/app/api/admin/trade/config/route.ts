// 管理端交易配置 API
// GET  /api/admin/trade/config - 获取所有配置（按分类组织）
// POST /api/admin/trade/config - 创建配置

import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getAdminTradeConfigs, createTradeConfig } from '@/lib/trade-config-service';
import { loadTradeConfigCategoryLabels } from '@/lib/trade-config-category-label-service';

async function listTradeConfigs(request: NextRequest, _user: any) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const result = await getAdminTradeConfigs({
      category: searchParams.get('category') || 'all',
      page: Number(searchParams.get('page') || 1),
      pageSize: Number(searchParams.get('pageSize') || 100),
    });
    if (result.error) {
      return NextResponse.json({ success: false, error: result.error }, { status: 500 });
    }
    // #20260829-2343 全局汉化：分类中文标签从 DB 加载（取代历史硬编码 TRADE_CONFIG_CATEGORY_LABEL）
    const categoryLabels = await loadTradeConfigCategoryLabels();
    return NextResponse.json({
      success: true,
      records: result.records,
      total: result.total,
      category_labels: categoryLabels,
    });
  } catch (error) {
    console.error('[AdminTradeConfig GET] 获取配置失败:', error);
    return NextResponse.json({ success: false, error: '获取配置失败' }, { status: 500 });
  }
}

async function createConfig(request: NextRequest, user: any) {
  try {
    const body = await request.json();
    if (!body?.config_key || !String(body.config_key).trim()) {
      return NextResponse.json({ success: false, error: '配置键不能为空' }, { status: 400 });
    }
    if (body.config_value === undefined) {
      return NextResponse.json({ success: false, error: '配置值不能为空' }, { status: 400 });
    }
    // #[20260830-1110] trade_config.updated_by 是 UUID+FK users.id；session token 签入的 user.id 才是真正的 UUID
    const result = await createTradeConfig(
      {
        config_key: String(body.config_key).trim(),
        config_value: body.config_value,
        config_type: body.config_type || 'json',
        description: body.description || null,
        category: body.category || 'system',
        is_active: body.is_active ?? true,
      },
      user?.id
    );
    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, record: result.record });
  } catch (error) {
    console.error('[AdminTradeConfig POST] 创建配置失败:', error);
    return NextResponse.json({ success: false, error: '创建配置失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheck({ permissions: 'admin.orders.edit' }, listTradeConfigs);
export const POST = withPermissionCheck({ permissions: 'admin.orders.edit' }, createConfig);
