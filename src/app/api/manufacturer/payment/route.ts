import { NextRequest, NextResponse } from 'next/server';

export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const category = searchParams.get('category') || '';
    
    console.log('[Manufacturer] 查询参数:', { category });

    // 模拟数据 - 不依赖数据库
    const mockData = {
      rankings: [
        { 
          id: 1, 
          manufacturer_name: '供应商A', 
          total_amount: 125000, 
          order_count: 15,
          avg_amount: 8333,
          category: '搅拌设备'
        },
        { 
          id: 2, 
          manufacturer_name: '供应商B', 
          total_amount: 98000, 
          order_count: 12,
          avg_amount: 8167,
          category: '泵类'
        },
        { 
          id: 3, 
          manufacturer_name: '供应商C', 
          total_amount: 76000, 
          order_count: 8,
          avg_amount: 9500,
          category: '阀门'
        },
        { 
          id: 4, 
          manufacturer_name: '供应商D', 
          total_amount: 54000, 
          order_count: 6,
          avg_amount: 9000,
          category: '电机'
        },
        { 
          id: 5, 
          manufacturer_name: '供应商E', 
          total_amount: 32000, 
          order_count: 4,
          avg_amount: 8000,
          category: '搅拌设备'
        },
      ],
      summary: {
        total_amount: 385000,
        total_orders: 45,
        avg_amount: 8556,
      }
    };

    // 根据类别过滤
    let filteredRankings = mockData.rankings;
    if (category && category !== '') {
      filteredRankings = mockData.rankings.filter(item => item.category === category);
    }

    // 计算过滤后的汇总
    const filteredTotal = filteredRankings.reduce((sum, item) => sum + item.total_amount, 0);
    const filteredCount = filteredRankings.reduce((sum, item) => sum + item.order_count, 0);

    return NextResponse.json({
      success: true,
      data: {
        rankings: filteredRankings,
        summary: {
          total_amount: filteredTotal,
          total_orders: filteredCount,
          avg_amount: filteredCount > 0 ? Math.round(filteredTotal / filteredCount) : 0,
        }
      }
    });

  } catch (error) {
    console.error('[Manufacturer] 查询失败:', error);
    return NextResponse.json(
      { 
        error: 'Internal Server Error', 
        message: error instanceof Error ? error.message : 'Unknown error' 
      },
      { status: 500 }
    );
  }
}

export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    
    // 模拟创建支付记录
    return NextResponse.json({
      success: true,
      data: {
        id: Date.now(),
        ...body,
        status: 'pending',
        created_at: new Date().toISOString(),
        updated_at: new Date().toISOString(),
      }
    });
  } catch (error) {
    console.error('[Manufacturer] 创建失败:', error);
    return NextResponse.json(
      { error: 'Internal Server Error' },
      { status: 500 }
    );
  }
}

export async function PUT(request: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}

export async function DELETE(request: NextRequest) {
  return NextResponse.json(
    { error: 'Method not allowed' },
    { status: 405 }
  );
}
