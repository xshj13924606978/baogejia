// 公开交易配置 API
// GET /api/trade/config - 获取公开配置（key → value 映射，前端实时生效）
// 该端点不鉴权：仅返回激活的配置项，不包含敏感信息。

import { NextRequest, NextResponse } from 'next/server';
import { getActiveTradeConfigMap } from '@/lib/trade-config-service';

export async function GET(_request: NextRequest) {
  try {
    const config = await getActiveTradeConfigMap();
    return NextResponse.json({ success: true, config });
  } catch (error) {
    console.error('[TradeConfig API] 获取配置失败:', error);
    return NextResponse.json({ success: false, error: '获取配置失败' }, { status: 500 });
  }
}
