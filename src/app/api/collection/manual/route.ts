import { NextRequest, NextResponse } from 'next/server';
import { runDataCollection } from '@/lib/scheduler';

// POST /api/collection/manual - 手动触发采集任务
export async function POST(request: NextRequest) {
  try {
    console.log('[Manual Collection] 收到手动采集请求');

    const result = await runDataCollection();

    return NextResponse.json({
      success: result.success,
      data: {
        categoriesCount: result.categoriesCount,
        collectedCount: result.collectedCount,
        newProducts: result.newProducts,
        updatedProducts: result.updatedProducts,
        error: result.error,
      },
    });
  } catch (error) {
    console.error('[Manual Collection API] 服务器错误:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
