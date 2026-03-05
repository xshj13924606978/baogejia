import { NextRequest, NextResponse } from 'next/server';

export async function POST(request: NextRequest) {
  try {
    const { data } = await request.json();

    console.log('[Proposal] Received request:', { quoteNumber: data?.quoteNumber });

    // 生成方案成功，返回成功响应
    return NextResponse.json({
      success: true,
      message: '方案生成成功',
      data: data,
      quoteData: {
        products: data.products,
        subtotal: data.subtotal,
        taxRate: data.taxRate,
        taxAmount: data.taxAmount,
        totalAmount: data.totalAmount,
        quoteNumber: data.quoteNumber
      }
    });
    
  } catch (error) {
    console.error('[Proposal] Generation error:', error);
    return NextResponse.json(
      { error: 'Failed to generate proposal', details: error instanceof Error ? error.message : 'Unknown error' },
      { status: 500 }
    );
  }
}