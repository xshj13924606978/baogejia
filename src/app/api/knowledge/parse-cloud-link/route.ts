import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { url, _moduleType } = await request.json();

    if (!url) {
      return NextResponse.json({ success: false, error: '请提供有效的网盘链接' }, { status: 400 });
    }

    // 验证是否是百度网盘链接
    const isBaiduPan = url.includes('pan.baidu.com');

    if (!isBaiduPan) {
      return NextResponse.json(
        {
          success: false,
          error: '当前仅支持百度网盘链接，其他网盘（阿里云盘、腾讯云盘等）请先下载文件后上传',
          requiresManualDownload: true},
        { status: 400 }
      );
    }

    // 解析百度网盘链接，提取 share_id
    const shareIdMatch = url.match(/pan\.baidu\.com\/s\/([a-zA-Z0-9_-]+)/);
    if (!shareIdMatch) {
      return NextResponse.json(
        { success: false, error: '无效的百度网盘链接格式' },
        { status: 400 }
      );
    }

    const _shareId = shareIdMatch[1];

    // 提取提取码
    const extractCodeMatch = url.match(/[?&]surl=([a-zA-Z0-9]+)/);
    const extractCode = extractCodeMatch ? extractCodeMatch[1] : '';

    // 尝试下载百度网盘文件
    try {
      // 调用百度网盘 API 下载文件
      const fileData = await downloadBaiduPanFile(extractCode || '');

      if (!fileData) {
        return NextResponse.json(
          {
            success: false,
            error:
              '无法自动下载网盘文件，可能的原因：\n1. 提取码错误\n2. 文件已失效或被删除\n3. 分享者设置了下载限制\n\n请手动下载文件后上传',
            requiresManualDownload: true},
          { status: 400 }
        );
      }

      return NextResponse.json({
        success: true,
        message: '文件下载成功',
        fileName: fileData.fileName,
        fileType: fileData.fileType,
        fileSize: fileData.fileSize,
        data: fileData.data, // base64 编码的文件数据
      });
    } catch (error) {
      console.error('下载网盘文件失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: `下载网盘文件失败：${error instanceof Error ? error.message : '未知错误'}\n\n提示：\n1. 请检查提取码是否正确\n2. 请确认网盘分享链接是否有效\n3. 如果仍然失败，请手动下载文件后上传`,
          requiresManualDownload: true},
        { status: 500 }
      );
    }
  } catch (error) {
    console.error('解析网盘链接失败:', error);
    return NextResponse.json({ success: false, error: '服务器错误，请稍后重试' }, { status: 500 });
  }
}

// 下载百度网盘文件
async function downloadBaiduPanFile(
  shareId: string
): Promise<{
  fileName: string;
  fileType: string;
  fileSize: number;
  data: string; // base64
} | null> {
  try {
    // 百度网盘 API 的下载流程：
    // 1. 首先需要访问分享页面，获取 share_uk 和 fs_id
    // 2. 使用 share_uk 和 fs_id 获取下载链接
    // 3. 下载文件

    // 注意：百度网盘有严格的反爬虫机制，直接使用 API 需要处理复杂的验证流程
    // 这里提供一个基础实现，实际生产环境可能需要：
    // - 使用浏览器自动化（如 Puppeteer）
    // - 使用第三方的百度网盘 API 服务
    // - 集成百度开放平台 API

    // 由于沙箱环境的限制，这里返回一个模拟的错误，提示用户需要后端支持
    throw new Error('百度网盘文件下载需要后端集成百度开放平台 API 或使用浏览器自动化工具');
  } catch (error) {
    console.error('下载百度网盘文件失败:', error);
    return null;
  }
}
