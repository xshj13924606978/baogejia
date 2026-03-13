import { NextResponse } from 'next/server';

/**
 * 完整上传流程测试
 * 模拟真实上传+下载+解析流程
 */
export async function POST(request: Request) {
  try {
    console.log('[FullUploadTest] ========== 开始完整流程测试 ==========');

    // 1. 准备测试文件内容
    const excelContent = `
设备名称	规格	数量	单位	单价
搅拌机	300L	2	台	5000
泵浦	1000W	5	台	2000
管道	DN50	100	米	100
    `.trim();

    const buffer = Buffer.from(excelContent, 'utf-8');
    const timestamp = Date.now();
    const fileKey = `uploads/anonymous/test-full-${timestamp}.txt`;

    console.log('[FullUploadTest] 步骤1: 准备文件内容');

    // 2. 上传文件
    console.log('[FullUploadTest] 步骤2: 上传文件到存储...');

    const { createClient } = await import('@supabase/supabase-js');
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL!;
    const supabaseKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;

    const supabase = createClient(supabaseUrl, supabaseKey);

    const { data: uploadData, error: uploadError } = await supabase.storage
      .from('quote-files')
      .upload(fileKey, buffer, {
        contentType: 'text/plain',
        cacheControl: '3600',
        upsert: true,
      });

    if (uploadError) {
      console.error('[FullUploadTest] 上传失败:', uploadError);
      return NextResponse.json(
        {
          success: false,
          error: '上传失败',
          details: uploadError.message,
        },
        { status: 500 }
      );
    }

    console.log('[FullUploadTest] 上传成功:', uploadData);

    // 3. 构建公共 URL
    const publicUrl = `${supabaseUrl}/storage/v1/object/public/quote-files/${fileKey}`;
    console.log('[FullUploadTest] 公开 URL:', publicUrl);

    // 4. 下载文件
    console.log('[FullUploadTest] 步骤3: 从公共 URL 下载文件...');
    const downloadResponse = await fetch(publicUrl);

    if (!downloadResponse.ok) {
      console.error('[FullUploadTest] 下载失败，状态码:', downloadResponse.status);
      const errorText = await downloadResponse.text();
      console.error('[FullUploadTest] 错误内容:', errorText);

      return NextResponse.json(
        {
          success: false,
          error: '下载失败',
          status: downloadResponse.status,
          errorText: errorText,
        },
        { status: 500 }
      );
    }

    const downloadBuffer = Buffer.from(await downloadResponse.arrayBuffer());
    console.log('[FullUploadTest] 下载成功，大小:', downloadBuffer.length);
    console.log('[FullUploadTest] 下载内容:', downloadBuffer.toString('utf-8'));

    // 5. 验证内容
    const contentMatches = downloadBuffer.toString('utf-8') === excelContent;
    console.log('[FullUploadTest] 内容匹配:', contentMatches);

    // 6. 清理
    console.log('[FullUploadTest] 步骤4: 清理测试文件...');
    await supabase.storage.from('quote-files').remove([fileKey]);

    console.log('[FullUploadTest] ========== 测试完成 ==========');

    return NextResponse.json({
      success: true,
      message: '完整流程测试成功',
      results: {
        upload: {
          success: !!uploadData,
          path: uploadData?.path,
        },
        download: {
          success: true,
          url: publicUrl,
          size: downloadBuffer.length,
          contentMatches,
        },
      },
    });
  } catch (error: any) {
    console.error('[FullUploadTest] 测试失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '测试失败',
        message: error.message,
        stack: error.stack,
      },
      { status: 500 }
    );
  }
}
