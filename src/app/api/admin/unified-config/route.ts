/**
 * 统一配置读取接口（#[20260831-1700] P1-7）
 *
 * 合并 site_config 与 trade_config，提供单一入口查询全局配置。
 * - 只读接口（写操作仍按归属表进行）
 * - 返回 config_value 统一为字符串，调用方按 config_type 解析
 */
export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { queryUnifiedConfig, parseUnifiedConfigValue, UnifiedConfigItem } from '@/lib/unified-config';
import { captureException } from '@/lib/error-log-service';

export async function GET(request: NextRequest) {
  const auth = await requireAdmin(request);
  if (auth.errorResponse) return auth.errorResponse;

  try {
    const { searchParams } = request.nextUrl;

    const key = searchParams.get('key') || undefined;
    const category = searchParams.get('category') || undefined;
    const sourceTable =
      (searchParams.get('sourceTable') as 'site_config' | 'trade_config') || undefined;
    const isPublic = searchParams.has('isPublic')
      ? searchParams.get('isPublic') === 'true'
      : undefined;
    const isActive = searchParams.has('isActive')
      ? searchParams.get('isActive') === 'true'
      : undefined;
    const page = Math.max(1, parseInt(searchParams.get('page') || '1', 10) || 1);
    const pageSize = Math.min(200, Math.max(1, parseInt(searchParams.get('pageSize') || '50', 10) || 50));

    const { items, total } = await queryUnifiedConfig({
      key,
      category,
      sourceTable,
      isPublic,
      isActive,
      page,
      pageSize,
    });

    const rows = items.map((item: UnifiedConfigItem) => ({
      key: item.config_key,
      value: parseUnifiedConfigValue(item),
      rawValue: item.config_value,
      type: item.config_type,
      category: item.category,
      description: item.description,
      isPublic: item.is_public,
      isActive: item.is_active,
      sourceTable: item.source_table,
      updatedAt: item.updated_at,
    }));

    return NextResponse.json({
      success: true,
      data: rows,
      pagination: { page, pageSize, total, totalPages: Math.ceil(total / pageSize) },
    });
  } catch (error: any) {
    captureException(error, {
      source: 'api.admin.unified-config.GET',
      message: '查询统一配置未处理异常',
      requestMethod: 'GET',
      requestPath: '/api/admin/unified-config',
      statusCode: 500,
    });
    return NextResponse.json({ success: false, error: '获取统一配置失败' }, { status: 500 });
  }
}
