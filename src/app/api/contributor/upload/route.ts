export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { CONTRIBUTOR_TYPES, ContributorType } from '@/lib/contributor/types';
import { registerContributor, submitUpload } from '@/lib/contributor/service';

// 限制请求体大小（文件通过独立的上传接口处理，这里仅接收 JSON）
export const config = {
  api: {
    bodyParser: { sizeLimit: '50mb' },
  },
};

/**
 * 公开接口：提交资料（无需登录）
 * 自动注册贡献者账号，返回账号信息与初始积分
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { identifier, name, type, data, files } = body;

    // 校验必填项
    if (!identifier) {
      return NextResponse.json({ error: '请填写手机号或邮箱' }, { status: 400 });
    }
    if (!type || !CONTRIBUTOR_TYPES.includes(type as ContributorType)) {
      return NextResponse.json({ error: '请选择有效的资料类型' }, { status: 400 });
    }
    if (!data || typeof data !== 'object') {
      return NextResponse.json({ error: '表单数据不能为空' }, { status: 400 });
    }

    // 简单校验：手机号或邮箱格式
    const isEmail = identifier.includes('@');
    const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
    const phoneRegex = /^1[3-9]\d{9}$/;
    if (isEmail && !emailRegex.test(identifier)) {
      return NextResponse.json({ error: '邮箱格式不正确' }, { status: 400 });
    }
    if (!isEmail && !phoneRegex.test(identifier)) {
      return NextResponse.json({ error: '手机号格式不正确' }, { status: 400 });
    }

    // 调用服务层：自动注册 + 提交资料
    const regResult = await registerContributor({ identifier, name });
    if (!regResult.success) {
      return NextResponse.json({ error: regResult.error || '注册失败' }, { status: 500 });
    }

    const uploadResult = await submitUpload({
      identifier,
      name,
      type: type as ContributorType,
      data,
      files: Array.isArray(files) ? files : [],
    });

    if (!uploadResult.success) {
      return NextResponse.json({ error: uploadResult.error || '提交资料失败' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      message: '资料提交成功，待审核',
      contributor: {
        identifier: regResult.contributor.phone || regResult.contributor.email,
        name: regResult.contributor.name,
        isNew: regResult.isNew,
      },
      upload: uploadResult.upload,
    });
  } catch (error) {
    console.error('[Contributor] 提交资料异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
