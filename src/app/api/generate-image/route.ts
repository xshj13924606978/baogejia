import { NextRequest, NextResponse } from 'next/server';
import { generateImage } from '@/lib/image-generation-client';
import { getCurrentUser } from '@/lib/auth-utils';
import { pointsService } from '@/lib/points-service';

// 每次生图消费积分
const IMAGE_GENERATION_COST = 10;

export async function POST(request: NextRequest) {
  try {
    // 获取用户（积分限制需要）
    let userId: string | null = null;
    try {
      const currentUser = await getCurrentUser(request);
      if (currentUser?.id) {
        userId = currentUser.id;
      }
    } catch {
      // 未登录用户仍可生图，不扣积分
    }

    const body = await request.json();
    const { prompt } = body;

    if (!prompt || typeof prompt !== 'string' || prompt.trim().length === 0) {
      return NextResponse.json({ error: '请提供图片描述' }, { status: 400 });
    }

    if (prompt.length > 500) {
      return NextResponse.json({ error: '描述不能超过500字' }, { status: 400 });
    }

    // 积分检查（仅登录用户）
    if (userId) {
      const hasEnough = await pointsService.checkPointsBalance(userId, IMAGE_GENERATION_COST);
      if (!hasEnough) {
        const userPoints = await pointsService.getUserPoints(userId);
        return NextResponse.json(
          {
            error: '积分不足',
            required: IMAGE_GENERATION_COST,
            balance: userPoints?.points || 0,
          },
          { status: 402 }
        );
      }
    }

    // 调用生图 API
    const result = await generateImage({ prompt: prompt.trim() });

    // 扣除积分（成功后）
    if (userId) {
      try {
        await pointsService.deductPoints(
          userId,
          IMAGE_GENERATION_COST,
          'chat',
          `生成图片: ${prompt.substring(0, 30)}`
        );
      } catch (error) {
        console.error('[GenerateImage] 扣除积分失败:', error);
      }
    }

    return NextResponse.json({
      success: true,
      image: {
        url: result.url,
        b64Json: result.b64Json,
        revisedPrompt: result.revisedPrompt,
        model: result.model,
      },
      pointsConsumed: userId ? IMAGE_GENERATION_COST : 0,
    });
  } catch (error: unknown) {
    console.error('[GenerateImage Error]', error);

    const message =
      error instanceof Error ? error.message : '生图失败，请稍后重试';

    return NextResponse.json({ error: message }, { status: 500 });
  }
}
