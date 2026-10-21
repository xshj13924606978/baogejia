export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { findUserByIdentifier } from '@/lib/contributor/service';

/**
 * 公开接口：查询联系方式（手机号/邮箱）是否已注册
 * #[20260829-1500]-1：/contributor/upload 页面按「注册状态」动态显示/隐藏「3.联系方式」，
 * 未登录用户输入手机号/邮箱后实时调用本接口判断是否已注册：
 *   - 已注册 → 不显示注册表单（已注册自动带账号联系方式）
 *   - 未注册 → 显示注册表单（三要素绑定+注册）
 * 仅返回布尔值，不泄露账号任何其他信息。
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json().catch(() => ({}));
    const identifier = String(body?.identifier || '').trim();

    // 格式非法一律按未注册处理（前端负责在有效格式下才调用本接口）
    const phoneRegex = /^1[3-9]\d{9}$/;
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    if (!identifier || (!phoneRegex.test(identifier) && !emailRegex.test(identifier))) {
      return NextResponse.json({ registered: false });
    }

    const existingUser = await findUserByIdentifier(identifier);
    return NextResponse.json({ registered: Boolean(existingUser) });
  } catch (error) {
    console.error('[Contributor] 查询注册状态失败:', error instanceof Error ? error.message : error);
    // 查询失败按未注册处理（降级：允许走注册流程，不阻断公开访问）
    return NextResponse.json({ registered: false }, { status: 500 });
  }
}
