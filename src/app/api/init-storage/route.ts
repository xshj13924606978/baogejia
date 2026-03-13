import { NextResponse } from 'next/server';

/**
 * 初始化存储桶的 API
 * 使用 service role key 创建 quote-files bucket
 */
export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json(
        {
          success: false,
          error: '缺少必要的环境变量：NEXT_PUBLIC_SUPABASE_URL 或 SUPABASE_SERVICE_ROLE_KEY',
        },
        { status: 400 }
      );
    }

    const { createClient } = await import('@supabase/supabase-js');
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false,
      },
    });

    // 检查 bucket 是否已存在
    const { data: buckets, error: listError } = await serviceClient.storage.listBuckets();

    if (listError) {
      console.error('[InitStorage] 列出存储桶失败:', listError);
      return NextResponse.json(
        {
          success: false,
          error: '列出存储桶失败',
          details: listError.message,
        },
        { status: 500 }
      );
    }

    const existingBucket = buckets?.find((b) => b.name === 'quote-files');

    if (existingBucket) {
      return NextResponse.json({
        success: true,
        message: '存储桶已存在',
        bucket: {
          name: existingBucket.name,
          public: existingBucket.public,
        },
      });
    }

    // 创建 bucket
    console.log('[InitStorage] 正在创建 quote-files 存储桶...');
    const { data: bucket, error: createError } = await serviceClient.storage.createBucket(
      'quote-files',
      {
        public: true,
        allowedMimeTypes: [
          'application/pdf',
          'application/vnd.ms-excel',
          'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
          'application/msword',
          'application/vnd.openxmlformats-officedocument.wordprocessingml.document',
          'text/plain',
          'text/csv',
          'image/jpeg',
          'image/png',
          'image/gif',
        ],
        fileSizeLimit: 10485760, // 10MB
      }
    );

    if (createError) {
      console.error('[InitStorage] 创建存储桶失败:', createError);
      return NextResponse.json(
        {
          success: false,
          error: '创建存储桶失败',
          details: createError.message,
        },
        { status: 500 }
      );
    }

    console.log('[InitStorage] 存储桶创建成功:', bucket);

    return NextResponse.json({
      success: true,
      message: '存储桶创建成功',
      bucket,
    });
  } catch (error: any) {
    console.error('[InitStorage] 初始化存储失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '初始化存储失败',
        message: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
