import { NextRequest, NextResponse } from 'next/server';
import { PriceMatcher } from '@/lib/price-matching';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const name = searchParams.get('name') || '化粪池';
    const model = searchParams.get('model') || '1';
    
    console.log('[Debug API] 查询参数:', { name, model });
    
    const result = await PriceMatcher.matchPrice({ name, model });
    
    console.log('[Debug API] 查询结果:', result);
    
    return NextResponse.json({
      success: true,
      data: result,
      timestamp: new Date().toISOString()
    });
  } catch (error) {
    console.error('[Debug API] 错误:', error);
    return NextResponse.json({
      success: false,
      error: error instanceof Error ? error.message : '未知错误'
    }, { status: 500 });
  }
}
