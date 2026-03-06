import { NextResponse } from 'next/server';

/**
 * 测试文件上传 API
 * 验证存储桶的权限和功能
 */
export async function POST() {
  try {
    const supabaseUrl = process.env.NEXT_PUBLIC_SUPABASE_URL;
    const serviceRoleKey = process.env.SUPABASE_SERVICE_ROLE_KEY;

    if (!supabaseUrl || !serviceRoleKey) {
      return NextResponse.json({
        success: false,
        error: '缺少必要的环境变量'
      }, { status: 400 });
    }

    const { createClient } = await import('@supabase/supabase-js');
    const serviceClient = createClient(supabaseUrl, serviceRoleKey, {
      auth: {
        autoRefreshToken: false,
        persistSession: false
      }
    });

    // 也创建一个 anon client 用于测试
    const anonKey = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY!;
    const anonClient = createClient(supabaseUrl, anonKey);

    // 创建测试文件
    const testContent = 'This is a test file for storage upload test.';
    const testBuffer = Buffer.from(testContent);
    const fileName = `test-${Date.now()}.txt`;

    console.log('[TestUpload] 开始测试上传...');

    const results: any = {
      serviceRole: {},
      anon: {}
    };

    // 1. 使用 service role key 测试
    console.log('[TestUpload] 测试 service role key...');
    const { data: srBuckets, error: srBucketsError } = await serviceClient
      .storage
      .listBuckets();

    if (srBucketsError) {
      results.serviceRole.error = srBucketsError.message;
    } else {
      results.serviceRole.buckets = srBuckets?.map(b => ({ name: b.name, public: b.public }));
      results.serviceRole.quoteBucket = srBuckets?.find(b => b.name === 'quote-files');
    }

    // 2. 使用 anon key 测试
    console.log('[TestUpload] 测试 anon key...');
    const { data: anonBuckets, error: anonBucketsError } = await anonClient
      .storage
      .listBuckets();

    if (anonBucketsError) {
      results.anon.error = anonBucketsError.message;
    } else {
      results.anon.buckets = anonBuckets?.map(b => ({ name: b.name, public: b.public }));
      results.anon.quoteBucket = anonBuckets?.find(b => b.name === 'quote-files');
    }

    // 3. 尝试使用 service role 上传
    if (results.serviceRole.quoteBucket) {
      console.log('[TestUpload] 使用 service role 上传测试文件...');
      const { data: uploadData, error: uploadError } = await serviceClient
        .storage
        .from('quote-files')
        .upload(`test/${fileName}`, testBuffer, {
          contentType: 'text/plain',
          cacheControl: '3600',
          upsert: true
        });

      if (uploadError) {
        results.serviceRole.upload = {
          success: false,
          error: uploadError.message
        };
      } else {
        results.serviceRole.upload = {
          success: true,
          fileName,
          path: uploadData?.path
        };

        // 4. 尝试使用 anon key 上传
        console.log('[TestUpload] 使用 anon key 上传测试文件...');
        const { data: anonUploadData, error: anonUploadError } = await anonClient
          .storage
          .from('quote-files')
          .upload(`test/anon-${fileName}`, testBuffer, {
            contentType: 'text/plain',
            cacheControl: '3600',
            upsert: true
          });

        if (anonUploadError) {
          results.anon.upload = {
            success: false,
            error: anonUploadError.message
          };
        } else {
          results.anon.upload = {
            success: true,
            fileName: `anon-${fileName}`,
            path: anonUploadData?.path
          };
        }

        // 5. 清理测试文件
        console.log('[TestUpload] 清理测试文件...');
        await serviceClient
          .storage
          .from('quote-files')
          .remove([`test/${fileName}`, `test/anon-${fileName}`]);
      }
    }

    console.log('[TestUpload] 测试完成');

    return NextResponse.json({
      success: true,
      message: '测试完成',
      results
    });

  } catch (error: any) {
    console.error('[TestUpload] 测试失败:', error);
    return NextResponse.json({
      success: false,
      error: '测试失败',
      message: error.message,
      stack: error.stack
    }, { status: 500 });
  }
}
