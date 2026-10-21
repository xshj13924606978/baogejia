export const dynamic = "force-dynamic";

import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { v4 as _uuidv4 } from 'uuid';
import { getCurrentUser } from '@/lib/auth-utils';
import { pointsService } from '@/lib/points-service';
import { getSiteConfigValues } from '@/lib/site-config';
import { uploadToBucket } from '@/lib/supabase-storage-upload';
import { safeErrorMessage } from '@/lib/error-handler';

// 上传文件扣减积分默认值（按文件大小计算）
const UPLOAD_POINTS_PER_KB = 0.1; // 每KB扣减0.1积分，最少1积分
const MIN_UPLOAD_POINTS = 1; // 最少扣减1积分

export async function POST(request: NextRequest) {
  try {

    // 获取当前用户
    const currentUser = await getCurrentUser(request);
    const userId = currentUser?.id || null;
    const userRole = currentUser?.role || null;
    const isAdmin = userRole === 'super_admin' || userRole === 'admin';

    const formData = await request.formData();
    const file = formData.get('file') as File;
    const requestId = (formData.get('requestId') as string) || undefined;

    if (!file) {
      console.error('[Upload] 没有文件上传');
      return NextResponse.json({ error: 'No file uploaded' }, { status: 400 });
    }


    // 读取存储设置配置
    const storageConfig = await getSiteConfigValues([
      'max_upload_size_mb',
      'allowed_file_types',
    ]);
    const maxUploadSizeMB = Math.max(1, parseInt(storageConfig.max_upload_size_mb || '10', 10));
    const maxUploadSizeBytes = maxUploadSizeMB * 1024 * 1024;
    const configuredExts = (storageConfig.allowed_file_types || 'pdf,xlsx,xls,csv,doc,docx,jpg,png')
      .split(',')
      .map((ext) => ext.trim().toLowerCase())
      .filter(Boolean);

    // 扩展名到 MIME 类型的映射
    const mimeTypeMap: Record<string, string[]> = {
      pdf: ['application/pdf'],
      xls: ['application/vnd.ms-excel'],
      xlsx: ['application/vnd.openxmlformats-officedocument.spreadsheetml.sheet'],
      doc: ['application/msword'],
      docx: ['application/vnd.openxmlformats-officedocument.wordprocessingml.document'],
      txt: ['text/plain'],
      csv: ['text/csv'],
      jpg: ['image/jpeg'],
      jpeg: ['image/jpeg'],
      png: ['image/png'],
      gif: ['image/gif'],
    };

    const allowedTypes = configuredExts.flatMap((ext) => mimeTypeMap[ext] || []);

    // 验证文件大小（最小10字节，最大配置限制）
    if (file.size < 10) {
      console.error('[Upload] 文件太小:', file.size);
      return NextResponse.json({ error: 'File is too small or empty' }, { status: 400 });
    }

    if (file.size > maxUploadSizeBytes) {
      console.error('[Upload] 文件太大:', file.size);
      return NextResponse.json({ error: `File size exceeds ${maxUploadSizeMB}MB limit` }, { status: 400 });
    }

    // 验证文件类型
    const fileExt = file.name.split('.').pop()?.toLowerCase();

    if (!allowedTypes.includes(file.type) && !configuredExts.includes(fileExt || '')) {
      console.error('[Upload] 不允许的文件类型:', file.type, fileExt);
      return NextResponse.json({ error: 'File type not allowed' }, { status: 400 });
    }

    // 计算积分消耗：优先使用 site_config 的 upload_file_points，否则按文件大小计算
    const fileSizeKB = Math.ceil(file.size / 1024);
    const pointsConfig = await getSiteConfigValues(['upload_file_points']);
    const uploadFilePoints = parseFloat(pointsConfig.upload_file_points || '0');
    const requiredPoints = uploadFilePoints > 0
      ? Math.ceil(uploadFilePoints)
      : Math.max(MIN_UPLOAD_POINTS, Math.ceil(fileSizeKB * UPLOAD_POINTS_PER_KB));

    // 先扣费后入库：积分不足直接拒绝，避免"文件已上传但扣费失败"导致白嫖
    // deductPoints 使用原子 RPC（含余额校验），并以 chargeKey 做幂等，防止重试双扣
    let pointsConsumed = 0;
    let newBalance: number | undefined;
    const chargeKey = requestId || `upload:${userId || 'anonymous'}:${Date.now()}`;
    if (userId && !isAdmin) {
      const deductResult = await pointsService.deductPoints(
        userId,
        requiredPoints,
        'upload_file',
        `上传文件: ${file.name} (${fileSizeKB}KB)`,
        chargeKey
      );

      if (!deductResult.success) {
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

      pointsConsumed = requiredPoints;
      const newPointsInfo = await pointsService.getUserPoints(userId);
      newBalance = newPointsInfo?.points || 0;
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
      const result = await uploadToBucket(supabase, 'quote-files', fileKey, buffer, {
        contentType: file.type,
        upsert: false
      });

      _uploadData = result.path ? { path: result.path } : null;
      uploadError = result.error ? { message: result.error } : null;
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
            allowedMimeTypes: allowedTypes.length > 0 ? allowedTypes : undefined,
            fileSizeLimit: maxUploadSizeBytes,
          });

          if (createError) {
            console.error('[Upload] 创建存储桶失败:', createError);
            throw createError;
          }

        } else {
        }


        // 使用 service role 直接上传
        const retryResult = await uploadToBucket(serviceClient, 'quote-files', fileKey, buffer, {
          contentType: file.type,
          upsert: false
        });

        _uploadData = retryResult.path ? { path: retryResult.path } : null;
        uploadError = retryResult.error ? { message: retryResult.error } : null;

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
      // 上传失败时退还已扣除的积分，保证"先扣费后入库"的一致性
      if (pointsConsumed > 0 && userId) {
        try {
          await pointsService.addPoints(
            userId,
            pointsConsumed,
            'refund',
            `上传失败退还积分: ${file.name}`,
            `${chargeKey}-refund`
          );
          console.log(`[Upload] 上传失败，已退还 ${pointsConsumed} 积分`);
        } catch (refundError) {
          console.error('[Upload] 退还积分失败:', refundError);
        }
      }
      return NextResponse.json(
        { error: 'Failed to upload file to storage', details: uploadError.message },
        { status: 500 }
      );
    }


    // 手动构建公共 URL（确保 URL 正确）
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/quote-files/${fileKey}`;


    // 保存文件记录到数据库（所有成功上传都需要记录，便于最近记录展示）
    // 积分已在上传前扣减（pointsConsumed / newBalance）
    try {
      const { data: _fileRecord, error: dbError } = await supabase
        .from('user_uploads')
        .insert({
          user_id: uploadUserId,
          file_name: file.name,
          file_key: fileKey,
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
      type: file.type,
      ...(pointsConsumed > 0 ? { pointsConsumed, newBalance: newBalance || 0 } : {})
    });
  } catch (error: any) {
    console.error('[Upload] 上传失败:', error);
    // #[20260901-1100] P0-1：不向客户端泄露 stack/内部错误细节，仅开发环境返回 message 辅助调试
    return NextResponse.json(
      {
        success: false,
        error: '文件上传失败，请稍后重试',
        ...(process.env.NODE_ENV !== 'production' ? { message: safeErrorMessage(error) } : {})
      },
      { status: 500 }
    );
  }
}
