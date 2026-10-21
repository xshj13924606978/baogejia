import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contributor/attachment-url?fileKey=contributor/xxx.ext
 * 获取资料附件在 knowledge-base bucket 的可访问 URL（登录用户可用）
 */
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  const fileKey = request.nextUrl.searchParams.get('fileKey');
  if (!fileKey) {
    return NextResponse.json({ error: '缺少 fileKey 参数' }, { status: 400 });
  }
  // 只允许资料附件目录，防止经由此端点读取其他任意对象
  if (!fileKey.startsWith('contributor/')) {
    return NextResponse.json({ error: '无效的文件路径' }, { status: 400 });
  }

  try {
    const db = getSupabaseServiceClient();
    const { data } = db.storage.from('knowledge-base').getPublicUrl(fileKey);
    return NextResponse.json({ success: true, url: data.publicUrl });
  } catch (error) {
    console.error('[Contributor] 获取附件 URL 异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
