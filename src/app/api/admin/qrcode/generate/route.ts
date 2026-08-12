export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * 管理接口：生成上传入口二维码
 * 返回公开上传页面的 URL，前端使用 qrcode.react 渲染二维码
 * 需要管理员权限
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    // 获取站点基础地址（生产环境通过环境变量配置）
    const baseUrl =
      process.env.NEXT_PUBLIC_SITE_URL ||
      process.env.SITE_URL ||
      process.env.NEXT_PUBLIC_BASE_URL ||
      `${request.nextUrl.protocol}//${request.nextUrl.host}`;

    const uploadUrl = `${baseUrl}/contributor/upload`;

    return NextResponse.json({
      success: true,
      url: uploadUrl,
      title: '资料贡献上传入口',
    });
  } catch (error) {
    console.error('[Admin] 生成二维码异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
