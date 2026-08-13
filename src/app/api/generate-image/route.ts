import { NextRequest, NextResponse } from 'next/server';
import { generateImage, GenerateImageResult } from '@/lib/image-generation-client';

/**
 * POST /api/generate-image
 * 生成图片
 */
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string') {
      return NextResponse.json(
        { error: '请提供有效的图片描述 (prompt)' },
        { status: 400 }
      );
    }

    // 调用延迟初始化的图片生成函数
    const result: GenerateImageResult = await generateImage(prompt);

    return NextResponse.json({
      success: true,
      data: {
        url: result.url,
        b64Json: result.b64Json,
        revisedPrompt: result.revisedPrompt,
        model: result.model,
      },
    });
  } catch (error) {
    console.error('图片生成API错误:', error);
    const errorMessage = error instanceof Error ? error.message : '图片生成失败';
    return NextResponse.json(
      { error: errorMessage },
      { status: 500 }
    );
  }
}

/**
 * GET /api/generate-image
 * 返回API使用说明
 */
export async function GET() {
  return NextResponse.json({
    message: '图片生成 API',
    usage: 'POST /api/generate-image with JSON body: { "prompt": "图片描述" }',
    example: {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: { prompt: '一只可爱的橘猫在阳光下睡觉' }
    }
  });
}
