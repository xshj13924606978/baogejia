import { NextRequest, NextResponse } from 'next/server';

// 解析网页链接，提取内容
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { url } = body;

    if (!url) {
      return NextResponse.json({
        success: false,
        error: '请提供有效的网页链接'
      }, { status: 400 });
    }

    // 验证 URL 格式
    try {
      new URL(url);
    } catch {
      return NextResponse.json({
        success: false,
        error: 'URL 格式不正确'
      }, { status: 400 });
    }

    // 使用 fetch-url 技能解析网页
    const cozeToolsUrl = process.env.COZE_TOOLS_URL || 'http://localhost:3001';

    try {
      const fetchUrlResponse = await fetch(`${cozeToolsUrl}/api/v1/fetch-url`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          url: url,
          options: {
            extractText: true,
            extractImages: true,
            extractLinks: true
          }
        })
      });

      if (!fetchUrlResponse.ok) {
        throw new Error('网页解析服务不可用');
      }

      const fetchUrlData = await fetchUrlResponse.json();

      if (fetchUrlData.success) {
        return NextResponse.json({
          success: true,
          content: fetchUrlData.text || fetchUrlData.content || '',
          title: fetchUrlData.title || '未命名网页',
          images: fetchUrlData.images || [],
          links: fetchUrlData.links || [],
          url: url
        });
      } else {
        throw new Error(fetchUrlData.error || '解析网页失败');
      }
    } catch (error) {
      console.error('Fetch URL error:', error);

      // 如果 fetch-url 服务不可用，使用备用方案：直接 fetch 并提取基本信息
      try {
        const response = await fetch(url, {
          headers: {
            'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36'
          }
        });

        if (!response.ok) {
          throw new Error(`无法访问网页: ${response.status}`);
        }

        const html = await response.text();

        // 简单提取标题
        const titleMatch = html.match(/<title>([^<]*)<\/title>/i);
        const title = titleMatch ? titleMatch[1].trim() : '未命名网页';

        // 简单提取正文（提取 p 标签内容）
        const pTags = html.match(/<p[^>]*>([^<]*)<\/p>/gi) || [];
        const content = pTags
          .map((tag: string) => tag.replace(/<[^>]*>/g, '').trim())
          .filter((text: string) => text.length > 10)
          .slice(0, 10)
          .join('\n\n');

        return NextResponse.json({
          success: true,
          title,
          content: content || '未能提取到网页正文内容',
          url
        });
      } catch (fallbackError) {
        console.error('Fallback parsing error:', fallbackError);
        return NextResponse.json({
          success: false,
          error: '解析网页失败，请检查链接是否可访问'
        }, { status: 500 });
      }
    }
  } catch (error) {
    console.error('Parse web link error:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '解析网页失败'
    }, { status: 500 });
  }
}
