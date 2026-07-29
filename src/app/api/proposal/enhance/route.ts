/**
 * 方案增强 API 接口
 *
 * 提供以下接口：
 * - POST /api/proposal/enhance - 增强技术方案
 * - GET /api/proposal/enhance/status - 获取增强器状态
 */

import { NextRequest, NextResponse } from 'next/server';
import {
  proposalEnhancer,
  ProposalContext,
  EnhancementOptions,
  EnhancedProposal,
} from '@/lib/proposal-enhancer';
import { Logger } from '@/lib/logger';
import { requireAuth } from '@/lib/auth-utils';
import { pointsService } from '@/lib/points-service';

// 方案增强积分消耗（基础消耗 + 上下文Token估算)
const BASE_ENHANCE_POINTS = 15; // 基础消耗 15 积分
const POINTS_PER_1000_TOKEN = 10; // 每1000 tokens 额外消耗 10 积分

// ============================================================================
// POST - 增强技术方案
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    // 获取当前用户
    const { user: currentUser, errorResponse } = await requireAuth(request);
    if (errorResponse) return errorResponse;
    const userId = currentUser.id;

    const body = await request.json();
    const { action, } = body;

    // 路由到不同的处理器
    switch (action) {
      case 'enhance':
        return await handleEnhance(body, userId);
      default:
        return NextResponse.json(
          {
            success: false,
            error: '未知的操作类型',
          },
          { status: 400 }
        );
    }
  } catch (error: any) {
    Logger.error('Proposal API 请求失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '请求处理失败',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// GET - 获取增强器状态
// ============================================================================

export async function GET() {
  try {
    const deepseekAvailable = !!process.env.DEEPSEEK_API_KEY;
    const cozeStatus = {
      enabled: process.env.ENABLE_COZE_TOOLS === 'true',
      webSearch: process.env.ENABLE_COZE_WEB_SEARCH === 'true',
      embedding: process.env.ENABLE_COZE_EMBEDDING === 'true',
      imageGeneration: process.env.ENABLE_COZE_IMAGE_GENERATION === 'true',
    };

    return NextResponse.json({
      success: true,
      data: {
        available: deepseekAvailable || cozeStatus.enabled,
        deepseekAvailable,
        cozeStatus,
        message: deepseekAvailable
          ? '方案增强器已就绪（DeepSeek）'
          : '方案增强器需要配置 DeepSeek API Key',
      },
    });
  } catch (error: any) {
    Logger.error('获取增强器状态失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '获取状态失败',
      },
      { status: 500 }
    );
  }
}

// ============================================================================
// 处理器函数
// ============================================================================

/**
 * 处理方案增强
 */
async function handleEnhance(body: any, userId: string) {
  const { context, originalProposal, options } = body;

  // 验证必要参数
  if (!context || !originalProposal) {
    return NextResponse.json(
      {
        success: false,
        error: '缺少必要参数：context 和 originalProposal',
      },
      { status: 400 }
    );
  }

  // 验证 context
  if (!context.projectType || !context.capacity) {
    return NextResponse.json(
      {
        success: false,
        error: 'context 必须包含 projectType 和 capacity 字段',
      },
      { status: 400 }
    );
  }

  // 估算 Token 数量（基于方案内容)
  const proposalText = JSON.stringify(originalProposal);
  const estimatedTokens = Math.ceil(proposalText.length / 4) + 500; // 估算 tokens

  // 计算积分消耗
  const requiredPoints = Math.ceil(BASE_ENHANCE_POINTS + (estimatedTokens / 1000) * POINTS_PER_1000_TOKEN);

  // 积分预检查
  const hasEnough = await pointsService.checkPointsBalance(userId, requiredPoints);
  if (!hasEnough) {
    const pointsInfo = await pointsService.getUserPoints(userId);
    return NextResponse.json(
      {
        success: false,
        error: '积分不足',
        message: `方案增强需要 ${requiredPoints} 积分，当前余额: ${pointsInfo?.points} 积分`,
        required: requiredPoints,
        balance: pointsInfo?.points
      },
      { status: 402 }
    );
  }

  try {
    Logger.info('[ProposalEnhancer] 开始处理增强请求', {
      projectType: context.projectType,
      capacity: context.capacity,
      enhancementLevel: options?.enhancementLevel || 'standard',
    });

    // 调用增强器
    const enhanced: EnhancedProposal = await proposalEnhancer.enhanceProposal(
      context as ProposalContext,
      originalProposal,
      options as EnhancementOptions
    );

    Logger.info('[ProposalEnhancer] 增强完成', {
      技术参数数量: enhanced.technicalParameters.length,
      工艺步骤数量: enhanced.processFlow.length,
      设备配置数量: enhanced.equipmentConfig.length,
      优化建议数量: enhanced.optimizationSuggestions.length,
    });

    // 扣除积分
    const deductResult = await pointsService.deductPoints(
      userId,
      requiredPoints,
      'enhance_proposal',
      `方案增强: ${context.projectType} ${context.capacity}`
    );

    if (deductResult.success) {
      Logger.info('[ProposalEnhancer] 扣除积分成功:', requiredPoints);

      // 获取更新后的积分
      const newPointsInfo = await pointsService.getUserPoints(userId);

      return NextResponse.json({
        success: true,
        data: enhanced,
        pointsConsumed: requiredPoints,
        newBalance: newPointsInfo?.points || 0
      });
    } else {
      Logger.error('[ProposalEnhancer] 扣除积分失败:', deductResult.reason);
      return NextResponse.json(
        {
          success: false,
          error: '积分扣除失败: ' + (deductResult.reason || '未知错误'),
        },
        { status: 500 }
      );
    }
  } catch (error: any) {
    Logger.error('[ProposalEnhancer] 增强失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '方案增强失败',
      },
      { status: 500 }
    );
  }
}
