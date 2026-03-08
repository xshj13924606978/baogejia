/**
 * 方案增强 API 接口
 * 
 * 提供以下接口：
 * - POST /api/proposal/enhance - 增强技术方案
 * - GET /api/proposal/enhance/status - 获取增强器状态
 */

import { NextRequest, NextResponse } from 'next/server';
import { proposalEnhancer, ProposalContext, EnhancementOptions, EnhancedProposal } from '@/lib/proposal-enhancer';
import { Logger } from '@/lib/logger';

// ============================================================================
// POST - 增强技术方案
// ============================================================================

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { action } = body;

    // 路由到不同的处理器
    switch (action) {
      case 'enhance':
        return await handleEnhance(body);
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
async function handleEnhance(body: any) {
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

    return NextResponse.json({
      success: true,
      data: enhanced,
    });
  } catch (error: any) {
    Logger.error('[ProposalEnhancer] 增强失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: error.message || '方案增强失败',
        details: error.stack,
      },
      { status: 500 }
    );
  }
}
