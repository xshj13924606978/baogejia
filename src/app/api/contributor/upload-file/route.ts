import { NextRequest, NextResponse } from 'next/server';
import { getServiceSupabase } from '@/lib/supabase-client';
import { uploadToBucket } from '@/lib/supabase-storage-upload';
import { safeErrorMessage } from '@/lib/error-handler';

const MAX_FILE_SIZE = 500 * 1024 * 1024; // 500MB（#20260823-1900 由 50MB 调大）

// 允许上传的 MIME 类型与扩展名映射
const ALLOWED_MIME_TYPES: Record<string, string> = {
  'application/pdf': '.pdf',
  'application/msword': '.doc',
  'application/vnd.openxmlformats-officedocument.wordprocessingml.document': '.docx',
  'application/vnd.ms-excel': '.xls',
  'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet': '.xlsx',
  'text/plain': '.txt',
  'text/csv': '.csv',
  'image/jpeg': '.jpg',
  'image/png': '.png',
  'image/gif': '.gif',
  'image/webp': '.webp',
  'image/bmp': '.bmp',
  'image/tiff': '.tif',
  'application/zip': '.zip',
  'application/x-rar-compressed': '.rar',
  'application/x-7z-compressed': '.7z',
  // PPT / 演示文稿
  'application/vnd.ms-powerpoint': '.ppt',
  'application/vnd.openxmlformats-officedocument.presentationml.presentation': '.pptx',
  // 表格宏工作簿
  'application/vnd.ms-excel.sheet.macroEnabled.12': '.xlsm',
  // 视频文件
  'video/mp4': '.mp4',
  'video/quicktime': '.mov',
  'video/x-msvideo': '.avi',
  'video/x-matroska': '.mkv',
  'video/webm': '.webm',
  'video/x-m4v': '.m4v',
  // CAD 图纸格式（浏览器通常无法给出标准 MIME，后端以扩展名为准兜底）
  'application/acad': '.dwg',
  'image/vnd.dwg': '.dwg',
  'application/dwg': '.dwg',
  'application/dxf': '.dxf',
  'image/vnd.dxf': '.dxf',
  'application/x-dxf': '.dxf',
  'application/dwf': '.dwf',
  'application/x-dwf': '.dwf',
  'model/vnd.dwf': '.dwf',
  'application/dwt': '.dwt',
  'application/x-dwt': '.dwt',
  'application/dws': '.dws',
};

// 通过扩展名反查 MIME 类型（用于 raw binary 上传）
const EXT_TO_MIME: Record<string, string> = {
  '.pdf': 'application/pdf',
  '.doc': 'application/msword',
  '.docx': 'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
  '.xls': 'application/vnd.ms-excel',
  '.xlsx': 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  '.txt': 'text/plain',
  '.csv': 'text/csv',
  '.jpg': 'image/jpeg',
  '.jpeg': 'image/jpeg',
  '.png': 'image/png',
  '.gif': 'image/gif',
  '.webp': 'image/webp',
  '.bmp': 'image/bmp',
  '.tif': 'image/tiff',
  '.tiff': 'image/tiff',
  '.zip': 'application/zip',
  '.rar': 'application/x-rar-compressed',
  '.7z': 'application/x-7z-compressed',
  '.ppt': 'application/vnd.ms-powerpoint',
  '.pptx': 'application/vnd.openxmlformats-officedocument.presentationml.presentation',
  '.xlsm': 'application/vnd.ms-excel.sheet.macroEnabled.12',
  '.mp4': 'video/mp4',
  '.mov': 'video/quicktime',
  '.avi': 'video/x-msvideo',
  '.mkv': 'video/x-matroska',
  '.webm': 'video/webm',
  '.m4v': 'video/x-m4v',
  '.dwg': 'application/acad',
  '.dxf': 'application/dxf',
  '.dwf': 'application/dwf',
  '.dwt': 'application/dwt',
  '.dws': 'application/dws',
};

function getExtension(filename: string): string {
  const match = filename.match(/\.[^.]+$/);
  return match ? match[0].toLowerCase() : '';
}

function generateSafeFileName(originalName: string): string {
  const timestamp = Date.now();
  return `${timestamp}-${originalName.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
}

export async function POST(request: NextRequest) {
  let fileName = '';
  let fileType = '';
  let fileBuffer: Buffer | null = null;

  try {
    // 统一先读取原始 body（避免 WSL/Windows 端口转发丢失 multipart boundary 导致无法二次读取）
    const rawBuffer = Buffer.from(await request.arrayBuffer());
    const contentType = request.headers.get('content-type') || '';

    // 优先尝试 FormData 解析（兼容已有调用方与测试）
    if (contentType.includes('multipart/form-data')) {
      try {
        const response = new Response(rawBuffer, { headers: { 'content-type': contentType } });
        const formData = await response.formData();
        const fdFile = formData.get('file') as File | null;
        if (fdFile) {
          fileName = fdFile.name;
          fileType = fdFile.type;
          fileBuffer = Buffer.from(await fdFile.arrayBuffer());
        }
      } catch (formDataError) {
        // FormData 解析失败（常见原因是 boundary 丢失），降级到 raw binary 解析
      }
    }

    // 降级：raw binary 上传，文件名通过 X-File-Name 头传递
    if (!fileBuffer) {
      const headerFileName = request.headers.get('x-file-name');
      fileName = headerFileName ? decodeURIComponent(headerFileName) : '';
      fileType = contentType;
      fileBuffer = rawBuffer;
    }

    if (!fileName || fileBuffer.length === 0) {
      return NextResponse.json({ error: '请选择文件' }, { status: 400 });
    }

    // 文件大小检查（500MB）
    if (fileBuffer.length > MAX_FILE_SIZE) {
      return NextResponse.json({ error: `文件大小超过限制（最大 ${MAX_FILE_SIZE / 1024 / 1024}MB）` }, { status: 400 });
    }

    // 文件类型检查：优先使用声明的 MIME，缺失时根据扩展名推断
    const ext = getExtension(fileName);
    const effectiveMime = fileType || EXT_TO_MIME[ext] || '';
    const isAllowedMime = ALLOWED_MIME_TYPES[effectiveMime] === ext;
    const isAllowedByExt = ext && Object.values(ALLOWED_MIME_TYPES).includes(ext);

    if (!isAllowedMime && !isAllowedByExt) {
      return NextResponse.json({ error: '不支持的文件类型' }, { status: 400 });
    }

    const safeName = generateSafeFileName(fileName);
    const storagePath = `contributor/${Date.now()}/${safeName}`;

    const supabase = getServiceSupabase();

    // 自动创建 knowledge-base bucket（如果不存在）
    const { data: buckets } = await supabase.storage.listBuckets();
    const bucketExists = buckets?.some((bucket) => bucket.name === 'knowledge-base');
    if (!bucketExists) {
      const { error: createBucketError } = await supabase.storage.createBucket('knowledge-base', {
        public: true,
        fileSizeLimit: MAX_FILE_SIZE,
      });
      if (createBucketError) {
        return NextResponse.json(
          { error: '创建存储桶失败', details: createBucketError.message },
          { status: 500 }
        );
      }
    }

    const { error: uploadError } = await uploadToBucket(
      supabase,
      'knowledge-base',
      storagePath,
      fileBuffer,
      { contentType: effectiveMime || 'application/octet-stream', upsert: false }
    );

    if (uploadError) {
      return NextResponse.json(
        { error: '文件上传失败', details: uploadError },
        { status: 500 }
      );
    }

    // 校验：确认文件已真正写入 Storage 且大小一致（防止 Supabase 返回成功但实际对象缺失/损坏）
    const folderPath = storagePath.split('/').slice(0, -1).join('/');
    const fileNameInStorage = storagePath.split('/').pop() || '';
    const { data: listData, error: listError } = await supabase.storage
      .from('knowledge-base')
      .list(folderPath, {
        search: fileNameInStorage,
        limit: 1,
      });

    if (listError || !listData || listData.length === 0) {
      // 尝试清理可能的部分写入
      await supabase.storage.from('knowledge-base').remove([storagePath]).catch(() => {});
      return NextResponse.json(
        { error: '文件上传后校验失败', details: listError?.message || '存储中未找到该文件' },
        { status: 500 }
      );
    }

    const uploadedMeta = listData[0];
    const remoteSize = uploadedMeta.metadata?.size ?? 0;
    if (remoteSize !== fileBuffer.length) {
      await supabase.storage.from('knowledge-base').remove([storagePath]).catch(() => {});
      return NextResponse.json(
        {
          error: '文件上传后大小校验失败',
          details: `本地 ${fileBuffer.length} 字节，远端 ${remoteSize} 字节`,
        },
        { status: 500 }
      );
    }

    const { data: urlData } = supabase.storage.from('knowledge-base').getPublicUrl(storagePath);

    return NextResponse.json({
      success: true,
      filePath: storagePath,
      url: urlData.publicUrl,
      fileName: safeName,
      originalFileName: fileName || safeName,
      size: fileBuffer.length,
    });
  } catch (error) {
    const errorDetails = error instanceof Error ? safeErrorMessage(error) : '未知错误';
    console.error('[Contributor Upload] 上传文件异常:', error);
    return NextResponse.json(
      { error: '服务器错误', details: errorDetails },
      { status: 500 }
    );
  }
}
