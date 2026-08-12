export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { registerContributor } from '@/lib/contributor/service';

/**
 * 公开接口：注册贡献者账号（自动）
 * 手机号或邮箱作为登录名，默认角色 contributor，奖励注册积分
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identifier, name } = body;

    if (!identifier) {
      return NextResponse.json({ error: '请填写手机号或邮箱' }, { status: 400 });
    }

    const result = await registerContributor({ identifier, name });

    if (!result.success) {
      return NextResponse.json({ error: result.error || '注册失败' }, { status: 400 });
    }

    return NextResponse.json({
      success: true,
      message: result.isNew ? '注册成功' : '欢迎回来',
      user: {
        id: result.user.id,
        identifier: result.user.email || result.user.phone || result.user.username,
        role: result.user.role,
        isNew: result.isNew,
      },
    });
  } catch (error) {
    console.error('[Contributor] 注册异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
