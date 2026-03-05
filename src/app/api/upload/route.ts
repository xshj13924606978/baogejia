import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { v4 as uuidv4 } from 'uuid';

export async function POST(request: NextRequest) {
  try {
    console.log('[Upload] ========== 开始文件上传 ==========');
    
    const formData = await request.formData();
    const file = formData.get('file') as File;

    if (!file) {
      console.error('[Upload] 没有文件上传');
      return NextResponse.json(
        { error: 'No file uploaded' },
        { status: 400 }
      );
    }

    console.log('[Upload] 原始文件名:', file.name);
    console.log('[Upload] 文件大小:', file.size);
    console.log('[Upload] 文件类型:', file.type);

    // 验证文件大小（最小1KB，最大10MB）
    if (file.size < 10) {
      console.error('[Upload] 文件太小:', file.size);
      return NextResponse.json(
        { error: 'File is too small or empty' },
        { status: 400 }
      );
    }

    if (file.size > 10 * 1024 * 1024) {
      console.error('[Upload] 文件太大:', file.size);
      return NextResponse.json(
        { error: 'File size exceeds 10MB limit' },
        { status: 400 }
      );
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
      'image/gif'
    ];

    const fileExt = file.name.split('.').pop()?.toLowerCase();
    const allowedExts = ['pdf', 'xls', 'xlsx', 'doc', 'docx', 'txt', 'csv', 'jpg', 'jpeg', 'png', 'gif'];

    if (!allowedTypes.includes(file.type) && !allowedExts.includes(fileExt || '')) {
      console.error('[Upload] 不允许的文件类型:', file.type, fileExt);
      return NextResponse.json(
        { error: 'File type not allowed' },
        { status: 400 }
      );
    }

    // 获取Supabase客户端
    const supabase = getSupabaseClient();

    // 从本地存储获取用户信息（实际项目中应该从session获取）
    // 这里简化处理，使用固定ID
    const userId = 'anonymous';

    // 生成安全的文件名
    const timestamp = Date.now();
    const safeName = `${timestamp}-${file.name.replace(/[^a-zA-Z0-9.-]/g, '_')}`;
    const fileKey = `uploads/${userId}/${safeName}`;

    console.log('[Upload] 安全的文件名:', safeName);
    console.log('[Upload] 完整路径:', fileKey);

    // 转换为Buffer
    const bytes = await file.arrayBuffer();
    const buffer = Buffer.from(bytes);

    // 上传到存储
    const { data: uploadData, error: uploadError } = await supabase
      .storage
      .from('quote-files')
      .upload(fileKey, buffer, {
        contentType: file.type,
        cacheControl: '3600',
        upsert: false
      });

    if (uploadError) {
      console.error('[Upload] 上传到存储失败:', uploadError);
      return NextResponse.json(
        { error: 'Failed to upload file to storage', details: uploadError.message },
        { status: 500 }
      );
    }

    console.log('[Upload] 上传成功!');
    console.log('[Upload] 文件路径:', fileKey);

    // 获取公共URL
    const { data: urlData } = supabase
      .storage
      .from('quote-files')
      .getPublicUrl(fileKey);

    console.log('[Upload] 公开 URL:', urlData.publicUrl);

    // 保存文件记录到数据库
    try {
      const { data: fileRecord, error: dbError } = await supabase
        .from('user_uploads')
        .insert({
          user_id: userId,
          file_name: file.name,
          file_key: fileKey,
          file_size: buffer.length,
          file_type: file.type,
          public_url: urlData.publicUrl,
          status: 'uploaded',
          created_at: new Date().toISOString()
        })
        .select()
        .single();

      if (dbError) {
        console.error('[Upload] 保存文件记录失败:', dbError);
        // 不影响主流程，只记录错误
      } else {
        console.log('[Upload] 文件记录已保存');
      }
    } catch (dbError) {
      console.error('[Upload] 保存文件记录异常:', dbError);
    }

    console.log('[Upload] ========== 上传完成 ==========');

    return NextResponse.json({
      success: true,
      url: urlData.publicUrl,
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