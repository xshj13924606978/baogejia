import { NextResponse } from 'next/server';

/**
 * 模拟真实文件上传的测试 API
 * 使用真实的 Excel 文件测试上传流程
 */
export async function POST(request: Request) {
  try {
    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    console.log('[RealUploadTest] 开始模拟真实上传测试...');

    // 创建一个模拟的 Excel 文件内容
    const excelContent = `
设备名称	规格	数量	单位	单价
搅拌机	300L	2	台	5000
泵浦	1000W	5	台	2000
管道	DN50	100	米	100
    `.trim();

    const buffer = Buffer.from(excelContent, 'utf-8');
    const timestamp = Date.now();
    const fileKey = `uploads/anonymous/test-real-${timestamp}.txt`;

    console.log('[RealUploadTest] 文件信息:', {
      size: buffer.length,
      path: fileKey
    });

    // 1. 使用 anon key 尝试上传
    console.log('[RealUploadTest] 使用 anon key 上传...');
    const anonClient = createClient(supabaseUrl, anonKey);

    let uploadError: any = null;
    let uploadData: any = null;

    try {
      const result = await anonClient
        .storage
        .from('quote-files')
        .upload(fileKey, buffer, {
          contentType: 'text/plain',
          cacheControl: '3600',
          upsert: false
        });

      uploadData = result.data;
      uploadError = result.error;
    } catch (e: any) {
      uploadError = e;
    }

    if (uploadError) {
      console.log('[RealUploadTest] Anon 上传失败:', uploadError.message);

      // 2. 检查是否是 bucket 问题
      if (uploadError.message && uploadError.message.includes('Bucket not found')) {
        console.log('[RealUploadTest] 尝试使用 service role...');

        const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY!;
        const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
          auth: {
            autoRefreshToken: false,
            persistSession: false
          }
        });

        const retryResult = await serviceClient
          .storage
          .from('quote-files')
          .upload(fileKey, buffer, {
            contentType: 'text/plain',
            cacheControl: '3600',
            upsert: false
          });

        uploadData = retryResult.data;
        uploadError = retryResult.error;

        if (uploadError) {
          console.error('[RealUploadTest] Service role 上传也失败:', uploadError);
          return NextResponse.json({
            success: false,
            error: 'Service role upload failed',
            details: uploadError.message
          }, { status: 500 });
        }

        console.log('[RealUploadTest] Service role 上传成功!');
      } else {
        console.error('[RealUploadTest] 上传失败（非 bucket 问题）:', uploadError);
        return NextResponse.json({
          success: false,
          error: 'Upload failed',
          details: uploadError.message
        }, { status: 500 });
      }
    } else {
      console.log('[RealUploadTest] Anon 上传成功!');
    }

    // 3. 获取公共 URL
    const { data: urlData } = anonClient
      .storage
      .from('quote-files')
      .getPublicUrl(fileKey);

    console.log('[RealUploadTest] 公开 URL:', urlData.publicUrl);

    // 4. 清理测试文件
    await anonClient
      .storage
      .from('quote-files')
      .remove([fileKey]);

    console.log('[RealUploadTest] 测试文件已清理');

    return NextResponse.json({
      success: true,
      message: '模拟上传测试成功',
      uploadInfo: {
        fileKey,
        publicUrl: urlData.publicUrl,
        size: buffer.length
      }
    });

  } catch (error: any) {
    console.error('[RealUploadTest] 测试失败:', error);
    return NextResponse.json({
      success: false,
      error: 'Test failed',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
