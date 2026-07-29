import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { v4 as _uuidv4 } from 'uuid';
import { getCurrentUser } from '@/lib/auth-utils';
import { pointsService } from '@/lib/points-service';

// 上传文件扣减积分（按文件大小计算）
const UPLOAD_POINTS_PER_KB = 0.1; // 每KB扣减0.1积分，最少1积分
const MIN_UPLOAD_POINTS = 1; // 最少扣减1积分

export async function POST(request: NextRequest) {
  try {

    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    const userId = currentUser?.id || null;

    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      console.error('[Upload] 没有文件上传');
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }


    // 验证文件大小（最小1KB，最大10MB）
    if (file.size < 10) {
      console.error('[Upload] 文件太小:', file.size);
      return NextResponse.json({ error: 'File is too small or empty' }, { status: 400 });
    }

    if (file.size > 10 * 1024 * 1024) {
      console.error('[Upload] 文件太大:', file.size);
      return NextResponse.json({ error: 'File size exceeds 10MB limit' }, { status: 400 });
    }

    // 验证文件类型
    const allowedTypes = [
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
    ];

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const allowedExts = [
      'pdf',
      'xls',
      'xlsx',
      'doc',
      'docx',
      'txt',
      'csv',
      'jpg',
      'jpeg',
      'png',
      'gif',
    ];

    if (!allowedTypes.includes(file.type) && !allowedExts.includes(fileExt || '')) {
      console.error('[Upload] 不允许的文件类型:', file.type, fileExt);
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }

    // 计算积分消耗（按文件大小）
    const fileSizeKB = Math.ceil(file.size / 1024);
    const requiredPoints = Math.max(MIN_UPLOAD_POINTS, Math.ceil(fileSizeKB * UPLOAD_POINTS_PER_KB));

    // 积分检查（如果有用户）
    if (userId) {
      const hasEnough = await pointsService.checkPointsBalance(userId, requiredPoints);
      if (!hasEnough) {
        const pointsInfo = await pointsService.getUserPoints(userId);
        return NextResponse.json(
          {
            error: '积分不足',
            message: `您的积分不足，上传此文件需要 ${requiredPoints} 积分`,
            required: requiredPoints,
            balance: pointsInfo?.points
          },
          { status: 402 }
        );
      }
    }

    // 获取Supabase客户端
    const supabase = getSupabaseClient();

    // 从本地存储获取用户信息
    const uploadUserId = userId || 'anonymous';

    // 生成安全的文件名
    const timestamp = Date.now();
    const safeName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const fileKey = `uploads/${uploadUserId}/${safeName}`;


    // 转换为Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 上传到存储
    let uploadError: any = null;
    let _uploadData: any = null;

    try {
      const result = await supabase.storage.from('quote-files').upload(fileKey, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });

      _uploadData = result.data;
      uploadError = result.error;
    } catch (e: any) {
      uploadError = e;
    }

    // 如果 bucket 不存在，尝试创建它
    if (uploadError && uploadError.message && uploadError.message.includes('Bucket not found')) {

      try {
        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;
        if (!serviceRoleKey) {
          throw new Error('未配置 SUPABASE_SERVICE_ROLE_KEY');
        }

        // 创建一个带有 service role 权限的客户端
        const { createClient } = await import('@supabase/supabase-js');
        const serviceClient = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        });

        // 检查 bucket 是否真的不存在
        const { data: buckets, error: listError } = await serviceClient.storage.listBuckets();

        if (listError) {
          console.error('[Upload] 检查存储桶列表失败:', listError);
          throw listError;
        }

        const bucketExists = buckets?.find((b) => b.name === 'quote-files');

        if (!bucketExists) {
          // bucket 确实不存在，创建它

          const { error: createError } = await serviceClient.storage.createBucket('quote-files', {
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
          });

          if (createError) {
            console.error('[Upload] 创建存储桶失败:', createError);
            throw createError;
          }

        } else {
        }


        // 使用 service role 直接上传
        const retryResult = await serviceClient.storage
          .from('quote-files')
          .upload(fileKey, buffer, {
            contentType: file.type,
            cacheControl: '3600',
            upsert: false
          });

        _uploadData = retryResult.data;
        uploadError = retryResult.error;

        if (uploadError) {
          console.error('[Upload] 使用 service role 上传失败:', uploadError);
          throw uploadError;
        }

      } catch (e: any) {
        console.error('[Upload] 处理存储桶问题失败:', e);
        return NextResponse.json(
          { error: 'Failed to handle storage bucket issue and upload file', details: e.message },
          { status: 500 }
        );
      }
    }

    if (uploadError) {
      console.error('[Upload] 上传到存储失败:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file to storage', details: uploadError.message },
        { status: 500 }
      );
    }


    // 手动构建公共 URL（确保 URL 正确）
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/quote-files/${fileKey}`;


    // 扣除积分（如果有用户）
    if (userId) {
      try {
        const deductResult = await pointsService.deductPoints(
          userId,
          requiredPoints,
          'upload_file',
          `上传文件: ${file.name} (${fileSizeKB}KB)`
        );

        if (deductResult.success) {

          // 获取更新后的积分
          const newPointsInfo = await pointsService.getUserPoints(userId);

          // 返回响应时包含积分信息

          return NextResponse.json({
            success: true,
            url: publicUrl,
            fileKey: fileKey,
            fileName: file.name,
            safeName: safeName,
            size: buffer.length,
            type: file.type,
            pointsConsumed: requiredPoints,
            newBalance: newPointsInfo?.points || 0
          });
        } else {
          console.error('[Upload] 扣除积分失败:', deductResult.reason);
          // 积分扣除失败，但文件已上传，返回警告
        }
      } catch (error) {
        console.error('[Upload] 扣除积分异常:', error);
      }
    }

    // 保存文件记录到数据库
    try {
      const { data: _fileRecord, error: dbError } = await supabase
        .from('user_uploads')
        .insert({
          user_id: uploadUserId,
          type: 'document',
          title: file.name,
          description: `File: ${file.name}`,
          file_url: publicUrl,
          file_size: buffer.length,
          status: 'uploaded',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (dbError) {
        console.error('[Upload] 保存文件记录失败:', dbError);
      } else {
      }
    } catch (dbError) {
      console.error('[Upload] 保存文件记录异常:', dbError);
    }


    return NextResponse.json({
      success: true,
      url: publicUrl,
      fileKey: fileKey,
      fileName: file.name,
      safeName: safeName,
      size: buffer.length,
      type: file.type
    });
  } catch (error: any) {
    console.error('[Upload] 上传失败:', error);
    return NextResponse.json(
      {
        error: 'Failed to upload file',
        message: error.message,
        stack: error.stack
      },
      { status: 500 }
    );
  }
}
