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
    const formattedProducts = (data || []).map((p: any) => {
      // 尝试从description字段解析JSON数据
      let extraFields = {};
      try {
        if (p.description && typeof p.description === 'string' && p.description.startsWith('{')) {
          extraFields = JSON.parse(p.description);
        }
      } catch (e) {
        // 如果解析失败，使用空对象
        extraFields = {};
      }

      return {
        id: p.id,
        product_name: p.name,
        model: p.model || '',
        brand: extraFields.brand || p.supplier || '',
        specifications: extraFields.specifications || p.specifications || '',
        unit: extraFields.unit || '台', // 默认单位
        cost_price: extraFields.cost_price || 0,
        min_price: extraFields.min_price || 0,
        price: parseFloat(p.price) || 0,
        supplier: p.supplier || '',
        contact_person: extraFields.contact_person || '',
        contact_phone: extraFields.contact_phone || '',
        category: p.category || '',
        stock: p.stock || 0,
      };
    });

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
