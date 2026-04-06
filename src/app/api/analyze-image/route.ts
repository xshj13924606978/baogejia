import { NextRequest, NextResponse } from 'next/server';

export async function POST(req: NextRequest) {
  try {
    const formData = await req.formData();
    const image = formData.get('image') as File;

    if (!image) {
      return NextResponse.json({ error: '未提供图片' }, { status: 400 });
    }

    // 将图片转为 base64
    const buffer = Buffer.from(await image.arrayBuffer());
    const base64 = `data:${image.type};base64,${buffer.toString('base64')}`;

    // 使用 Gemini 多模态分析图片
    const apiHost = process.env.LAOZHANG_API_HOST || 'https://api.laozhang.ai';
    const apiKey = process.env.LAOZHANG_API_KEY;

    if (!apiKey) {
      return NextResponse.json({ error: 'Gemini API Key 未配置' }, { status: 500 });
    }

    const analysisPrompt = `请分析这张图片，识别其中的设备或产品信息。如果图片中有：
1. 设备铭牌：提取品牌、型号、规格参数
2. 设备照片：判断设备类型、估算规格
3. 技术图纸：识别设备清单、尺寸标注
4. 报价单/合同：提取关键信息

请用结构化格式输出分析结果，包括：设备名称、型号、品牌、规格参数、预估价格（如有）。`;

    const response = await fetch(`${apiHost}/v1/chat/completions`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'Authorization': `Bearer ${apiKey}`,
      },
      body: JSON.stringify({
        model: 'gemini-2.0-flash',
        messages: [
          {
            role: 'user',
            content: [
              { type: 'text', text: analysisPrompt },
              { type: 'image_url', image_url: { url: base64 } },
            ],
          },
        ],
        max_tokens: 2048,
      }),
    });

    if (!response.ok) {
      console.error('[AnalyzeImage] API 调用失败:', response.status);
      return NextResponse.json({ error: '图片分析失败' }, { status: 500 });
    }

    const data = await response.json();
    const analysis = data.choices?.[0]?.message?.content || '无法分析该图片';

    return NextResponse.json({ analysis });
  } catch (error: any) {
    console.error('[AnalyzeImage] 分析失败:', error);
    return NextResponse.json({ error: '图片分析失败' }, { status: 500 });
  }
}
