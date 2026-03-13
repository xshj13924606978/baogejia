import { NextRequest, NextResponse } from 'next/server';
import { tokenBillingService } from '@/lib/token-billing-service';

/**
 * 获取用户积分余额
 */
export async function GET(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = parseInt(id);
    
    if (isNaN(userId)) {
      return NextResponse.json(
        { error: '无效的用户ID' },
        { status: 400 }
      );
    }

    const balance = await tokenBillingService.getUserBalance(userId);
    
    if (!balance) {
      return NextResponse.json(
        { error: '用户不存在' },
        { status: 404 }
      );
    }

    return NextResponse.json({
      success: true,
      data: {
        userId: balance.userId,
        pointsBalance: balance.pointsBalance,
        tokenBalance: balance.tokenBalance,
        totalConsumedPoints: balance.totalConsumedPoints,
        totalRechargedPoints: balance.totalRechargedPoints,
        lastUpdated: balance.lastUpdated,
      }
    });
  } catch (error) {
    console.error('[User Points API] 获取用户积分失败:', error);
    return NextResponse.json(
      { error: '获取用户积分失败' },
      { status: 500 }
    );
  }
}

/**
 * 设置用户积分（管理员功能）
 */
export async function PUT(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id } = await params;
    const userId = parseInt(id);
    const body = await request.json();
    const { points } = body;

    if (isNaN(userId)) {
      return NextResponse.json(
        { error: '无效的用户ID' },
        { status: 400 }
      );
    }

    if (typeof points !== 'number' || points < 0) {
      return NextResponse.json(
        { error: '无效的积分数值' },
        { status: 400 }
      );
    }

    const success = await tokenBillingService.setUserPoints(userId, points);
    
    if (!success) {
      return NextResponse.json(
        { error: '设置积分失败' },
        { status: 500 }
      );
    }

    const balance = await tokenBillingService.getUserBalance(userId);
    
    return NextResponse.json({
      success: true,
      message: '积分设置成功',
      data: {
        userId: balance?.userId,
        pointsBalance: balance?.pointsBalance,
      }
    });
  } catch (error) {
    console.error('[User Points API] 设置用户积分失败:', error);
    return NextResponse.json(
      { error: '设置用户积分失败' },
      { status: 500 }
    );
  }
}
