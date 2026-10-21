export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * 解析二维码基础域名（修复 #[20260825-1755]）：
 * 真实场景下二维码必须是可被手机扫码访问的公网 URL，
 * request.nextUrl.host 在 dev 模式或 nginx 反代下可能返回 0.0.0.0:3000 等非法地址。
 *
 * 优先级（动态，按既有 .env.* 文件已配置的项）：
 *   1) NEXT_PUBLIC_APP_URL（项目统一公网域名环境变量，所有 .env.* 均已配置）
 *   2) NEXT_PUBLIC_SITE_URL / SITE_URL / NEXT_PUBLIC_BASE_URL（兼容备用）
 *   3) 反向代理头 X-Forwarded-Proto + X-Forwarded-Host / Host（真实域名）
 *   4) request.nextUrl（兜底）
 *
 * 兜底分支额外做一次清洗：0.0.0.0 替换为 localhost 便于本地扫描。
 */
function resolveQrBaseUrl(request: NextRequest): string {
  const envUrl =
    process.env.NEXT_PUBLIC_APP_URL ||
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.SITE_URL ||
    process.env.NEXT_PUBLIC_BASE_URL;
  if (envUrl && /^https?:\/\//i.test(envUrl)) return envUrl.replace(/\/+$/, '');

  const proto =
    request.headers.get('x-forwarded-proto') || request.nextUrl.protocol || 'http';
  const cleanProto = proto.endsWith(':') ? proto : `${proto}:`;

  let host =
    request.headers.get('x-forwarded-host') ||
    request.headers.get('host') ||
    request.nextUrl.host ||
    '';
  // 兜底：next dev -H 0.0.0.0 时把 0.0.0.0 替换为 localhost，保证至少可本地扫码
  if (host.startsWith('0.0.0.0')) {
    host = 'localhost' + host.slice('0.0.0.0'.length);
  }
  return `${cleanProto}//${host}`;
}

/**
 * 管理接口：生成上传入口二维码
 * 返回公开上传页面的 URL，前端使用 qrcode.react 渲染二维码
 * 需要管理员权限
 */
export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const baseUrl = resolveQrBaseUrl(request);
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
