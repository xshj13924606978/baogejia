import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

export const dynamic = 'force-dynamic';

/**
 * GET /api/contributor/attachment-download?fileKey=contributor/xxx.ext&fileName=原始文件名.pdf
 * 直接流式下载 knowledge-base bucket 中的资料附件，绕开公开 URL 策略限制
 */
export async function GET(request: NextRequest) {
  const { errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  const fileKey = request.nextUrl.searchParams.get('fileKey');
  const downloadName = request.nextUrl.searchParams.get('fileName') || fileKey?.split('/').pop() || 'download';

  if (!fileKey) {
    return NextResponse.json({ error: '缺少 fileKey 参数' }, { status: 400 });
  }
  // 只允许资料附件目录
  if (!fileKey.startsWith('contributor/')) {
    return NextResponse.json({ error: '无效的文件路径' }, { status: 400 });
  }

  try {
    const db = getSupabaseServiceClient();
    const { data: fileBlob, error: downloadError } = await db.storage.from('knowledge-base').download(fileKey);

    if (downloadError || !fileBlob) {
      console.error('[Contributor Attachment Download] Storage 下载失败:', fileKey, downloadError);
      return NextResponse.json(
        { success: false, error: '文件不存在或已失效，请联系管理员' },
        { status: 404 }
      );
    }

    if (fileBlob.size === 0) {
      return NextResponse.json(
        { success: false, error: '文件内容为空或已损坏，请联系管理员' },
        { status: 404 }
      );
    }

    const arrayBuffer = await fileBlob.arrayBuffer();
    const ext = (downloadName.split('.').pop() || '').toLowerCase();
    const contentTypeMap: Record<string, string> = {
      pdf: 'application/pdf',
      jpg: 'image/jpeg',
      jpeg: 'image/jpeg',
      png: 'image/png',
      gif: 'image/gif',
      webp: 'image/webp',
      svg: 'image/svg+xml',
      bmp: 'image/bmp',
    };

    const headers = new Headers();
    headers.set('Content-Type', contentTypeMap[ext] || 'application/octet-stream');
    headers.set(
      'Content-Disposition',
      `attachment; filename*=UTF-8''${encodeURIComponent(downloadName)}`
    );
    headers.set('Content-Length', String(arrayBuffer.byteLength));

    return new NextResponse(arrayBuffer, { headers });
  } catch (error) {
    console.error('[Contributor Attachment Download] 下载异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
