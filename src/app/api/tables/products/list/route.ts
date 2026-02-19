import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取产品列表
export async function GET(request: NextRequest) {
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
      console.error('获取产品列表失败:', error);
      return NextResponse.json({
        success: false,
        error: error.message,
        data: [],
      }, { status: 500 });
    }

    // 转换为前端需要的格式
    const formattedProducts = (data || []).map((p: any) => ({
      id: p.id,
      product_name: p.name,
      model: p.model || '',
      brand: p.supplier || '',
      specifications: p.specifications || '',
      unit: '台', // 默认单位
      price: parseFloat(p.price) || 0,
      supplier: p.supplier || '',
      category: p.category || '',
      stock: p.stock || 0,
    }));

    return NextResponse.json({
      success: true,
      data: formattedProducts,
      total: formattedProducts.length,
      count: count || 0,
    });
  } catch (error) {
    console.error('获取产品列表失败:', error);
    return NextResponse.json({
      success: false,
      error: '获取产品列表失败',
      data: [],
    }, { status: 500 });
  }
}
