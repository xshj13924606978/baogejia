import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取产品列表
export async function GET(request: NextRequest) {
  const startTime = Date.now();

  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');


    const db = getSupabaseClient();
    let query = db.from('products').select('*', { count: 'exact' });

    // 关键词搜索
    if (keyword) {
      query = query.ilike('name', `%${keyword}%`);
    }

    // 分页
    const offset = (page - 1) * limit;
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[Product List API] ❌ 查询数据库失败:', error);
      console.error('[Product List API] 错误详情:', JSON.stringify(error, null, 2));
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          data: [],
        },
        { status: 500 }
      );
    }


    // 转换为前端需要的格式（统一产品字段规范）
    const formattedProducts = (data || []).map((p: any) => {
      return {
        // 13个标准字段
        category: p.category || '',
        name: p.name || '',
        model: p.model || '',
        parameter_description: p.parameter_description || '',
        brand: p.brand || '',
        unit: p.unit || '台',
        supplier: p.supplier || '',
        contact_person: p.contact_person || '',
        contact_phone: p.contact_phone || '',
        cost_price: parseFloat(p.cost_price) || 0,
        min_price: parseFloat(p.min_price) || 0,
        price: parseFloat(p.price) || 0,
        image_url: p.image_url || '',
        // 系统字段
        id: p.id,
        stock: p.stock || 0,
        created_at: p.created_at,
        updated_at: p.updated_at,
      };
    });

    const duration = Date.now() - startTime;

    return NextResponse.json({
      success: true,
      data: formattedProducts,
      total: formattedProducts.length,
      count: count || 0,
      duration,
    });
  } catch (error) {
    console.error('[Product List API] ❌ 请求异常:', error);
    console.error('[Product List API] 错误堆栈:', error instanceof Error ? error.stack : error);
    return NextResponse.json(
      {
        success: false,
        error: '获取产品列表失败',
        data: [],
      },
      { status: 500 }
    );
  }
}
