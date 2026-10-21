export const dynamic = "force-dynamic";

import { NextResponse } from 'next/server';
import { getSiteConfigValue } from '@/lib/site-config';

/**
 * 密码策略公开接口（#20260821-0930 修复：前端密码长度校验与后端 site_config 保持一致）
 * GET /api/auth/password-policy -> { success, minLength }
 * 仅供前端表单即时校验使用，最终校验仍以后端为准。
 */
export async function GET() {
  try {
    const raw = await getSiteConfigValue('password_min_length', '6');
    const minLength = Math.max(1, Number.parseInt(raw || '6', 10) || 6);
    return NextResponse.json({ success: true, minLength });
  } catch (error) {
    console.error('[password-policy] 读取配置失败:', error);
    return NextResponse.json({ success: false, minLength: 6 }, { status: 200 });
  }
}
