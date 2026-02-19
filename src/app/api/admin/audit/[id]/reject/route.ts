import { NextRequest, NextResponse } from 'next/server';

export async function POST(
  request: NextRequest,
  { params }: { params: Promise<{ id: string }> }
) {
  try {
    const { id: auditIdStr } = await params;
    const auditId = parseInt(auditIdStr);
    const { reason } = await request.json();

    if (!reason) {
      return NextResponse.json(
        { error: '请提供拒绝原因' },
        { status: 400 }
      );
    }

    // 模拟审核拒绝
    console.log(`审核拒绝项目 ${auditId}，原因: ${reason}`);

    return NextResponse.json({ success: true, reason });
  } catch (error) {
    console.error('审核拒绝失败:', error);
    return NextResponse.json(
      { error: '审核拒绝失败' },
      { status: 500 }
    );
  }
}
