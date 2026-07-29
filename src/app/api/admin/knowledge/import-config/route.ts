import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';

/**
 * 导入配置管理（接口框架）
 *
 * GET: 获取当前导入配置（webhook secret、自动审核开关等）
 * PUT: 更新导入配置
 *
 * 当前为接口框架，实际实现需要：
 * 1. 创建 import_configs 数据库表
 * 2. 实现 CRUD 操作
 * 3. 管理端配置界面
 */

// 默认配置
const DEFAULT_CONFIG = {
  wechat_enabled: false,
  wechat_secret: '',
  wechat_auto_approve: false,
  wechat_default_type: 'document',
  email_enabled: false,
  email_secret: '',
  email_auto_approve: false,
  email_default_type: 'document',
};

export async function GET(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  return NextResponse.json({
    success: true,
    data: DEFAULT_CONFIG,
  });
}

export async function PUT(request: NextRequest) {
  const { user, errorResponse } = await requireAdmin(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();

    // TODO: 验证配置值
    // TODO: 保存到数据库

    return NextResponse.json({
      success: true,
      data: { ...DEFAULT_CONFIG, ...body },
      message: '配置已更新（框架模式，未持久化）',
    });
  } catch (error) {
    console.error('[Import Config] 异常:', error);
    return NextResponse.json({ success: false, error: '操作失败' }, { status: 500 });
  }
}
