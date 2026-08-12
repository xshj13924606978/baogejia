export const dynamic = 'force-dynamic';

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

// 允许的文件类型
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': 'pdf',
  'application/msword': 'doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': 'docx',
  'application/vnd.ms-excel': 'xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': 'xlsx',
  'text/plain': 'txt',
  'text/csv': 'csv',
  'image/jpeg': 'jpg',
  'image/png': 'png',
  'image/gif': 'gif',
  'image/webp': 'webp',
  'application/zip': 'zip',
  'application/x-rar-compressed': 'rar',
};

// 文件大小限制（50MB）
const MAX_FILE_SIZE = 50 * 1024 * 1024;

/**
 * 公开接口：上传资料附件
 * 将文件存入 Supabase 存储，返回文件路径
 * 配合 /api/contributor/upload 使用
 */
export async function POST(request: NextRequest) {
  try {
    const formData = await request.formData();
    const file = formData.get('file') as File | null;

    if (!file) {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    }

    if (file.size > MAX_FILE_SIZE) {
      return NextResponse.json({ error: '文件大小不能超过50MB' }, { status: 400 });
    }

    const fileExt = ALLOWED_MIME_TYPES[file.type];
    if (!fileExt && !file.name.match(/\.(pdf|doc|docx|xls|xlsx|txt|csv|jpg|jpeg|png|gif|webp|zip|rar)$/i)) {
      return NextResponse.json({ error: '不支持的文件类型' }, { status: 400 });
    }

    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 生成安全的文件名
    const timestamp = Date.now();
    const safeName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const fileKey = `contributor/${timestamp}/${safeName}`;

    const supabase = getSupabaseServiceClient();

    // 上传到存储
    const { error: uploadError } = await supabase.storage.from('knowledge-base').upload(fileKey, buffer, {
      contentType: file.type,
      cacheControl: '3600',
      upsert: false,
    });

    if (uploadError) {
      console.error('[Contributor Upload] 上传到存储失败:', uploadError.message);
      return NextResponse.json({ error: '上传到存储失败', details: uploadError.message }, { status: 500 });
    }

    // 获取公共 URL
    const { data: urlData } = supabase.storage.from('knowledge-base').getPublicUrl(fileKey);

    return NextResponse.json({
      success: true,
      filePath: fileKey,
      url: urlData.publicUrl,
      fileName: file.name,
      size: buffer.length,
    });
  } catch (error) {
    console.error('[Contributor Upload] 上传文件异常:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
