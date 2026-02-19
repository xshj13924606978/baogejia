import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: auditIdStr } = await params;
    const auditId = parseInt(auditIdStr);
    const { points = 0 } = await request.json();

    // 模拟审核通过
    console.log(`审核通过项目 ${auditId}，奖励积分: ${points}`);

    return NextResponse.json({ success: true, points });
  } catch (error) {
    console.error('审核通过失败:', error);
    return NextResponse.json(
      { error: '审核通过失败' },
      { status: 500 }
    );
  }
}
