import { NextRequest, NextResponse } from 'next/server';
import { getImportConfig, checkImportWhitelist } from '@/lib/knowledge/import-guard';
import crypto from 'crypto';

/**
 * 邮件 webhook 资料导入接收端
 *
 * 当前状态：导入流程尚未完全实现，正常情况下返回 501。
 * 新增：
 *   - 开关关闭时保持原有 501 响应，不破坏现有验证。
 *   - 已配置 Secret 时增加签名校验（默认无 Secret，不影响默认行为）。
 *   - 白名单开关开启且来源不在白名单时返回 403（默认关闭）。
 */

function notImplementedResponse(enabled: boolean) {
  return NextResponse.json(
    {
      success: false,
      error: enabled ? '邮件导入功能尚未实现' : '邮件导入未启用',
    },
    { status: 501 }
  );
}

export async function POST(request: NextRequest) {
  try {
    const config = await getImportConfig();

    if (!config.email_enabled) {
      return notImplementedResponse(false);
    }

    const body = await request.json().catch(() => ({}));

    const secret = config.email_secret || '';
    if (secret) {
      const signature = request.headers.get('x-email-signature') || request.headers.get('x-webhook-signature') || '';
      const hash = crypto.createHmac('sha256', secret).update(JSON.stringify(body)).digest('hex');
      try {
        if (
          signature.length !== hash.length ||
          !crypto.timingSafeEqual(Buffer.from(signature), Buffer.from(hash))
        ) {
          return NextResponse.json(
            { success: false, error: 'Webhook 签名无效' },
            { status: 401 }
          );
        }
      } catch {
        return NextResponse.json(
          { success: false, error: 'Webhook 签名无效' },
          { status: 401 }
        );
      }
    }

    if (config.email_whitelist_enabled) {
      const sourceValue = body?.from || body?.sender || body?.email || null;
      const whitelistCheck = await checkImportWhitelist({
        sourceType: 'email',
        sourceValue,
      });
      if (!whitelistCheck.allowed) {
        return NextResponse.json(
          { success: false, error: whitelistCheck.reason || '来源未授权' },
          { status: 403 }
        );
      }
    }

    // TODO: 实现真正的邮件附件解析、文件下载、资料入库
    return notImplementedResponse(true);
  } catch (error) {
    console.error('[Email Import] 处理失败:', error);
    return NextResponse.json({ success: false, error: '处理失败' }, { status: 500 });
  }
}
