import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: userIdStr } = await params;
    const userId = parseInt(userIdStr);
    const { points } = await request.json();

    if (typeof points !== 'number') {
      return NextResponse.json(
        { error: '无效的积分值' },
        { status: 400 }
      );
    }

    // 模拟积分分配
    console.log(`给用户 ${userId} 分配 ${points} 积分`);

    return NextResponse.json({ 
      success: true, 
      newPoints: 1000 + points,
      pointsChange: points
    });
  } catch (error) {
    console.error('分配积分失败:', error);
    return NextResponse.json(
      { error: '分配积分失败' },
      { status: 500 }
    );
  }
}
