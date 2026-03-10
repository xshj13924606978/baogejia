import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取产品列表
export async function GET(request: NextRequest) {
  const startTime = Date.now();
  console.log('[Product List API] ========== 开始获取产品列表 ==========');
  console.log('[Product List API] 时间:', new Date().toISOString());

  try {
    const searchParams = request.nextUrl.searchParams;
    const keyword = searchParams.get('keyword') || '';
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '100');

    console.log('[Product List API] 请求参数:', {
      keyword,
      page,
      limit,
      hasKeyword: !!keyword
    });

    const db = getSupabaseClient();
    let query = db.from('products').select('*', { count: 'exact' });

    // 关键词搜索
    if (keyword) {
      console.log('[Product List API] 应用关键词搜索:', keyword);
      query = query.ilike('name', `%${keyword}%`);
    }

    // 分页
    const offset = (page - 1) * limit;
    console.log('[Product List API] 分页参数: offset=', offset, 'limit=', limit);
    query = query.order('created_at', { ascending: false }).range(offset, offset + limit - 1);

    const { data, error, count } = await query;

    if (error) {
      console.error('[Product List API] ❌ 查询数据库失败:', error);
      console.error('[Product List API] 错误详情:', JSON.stringify(error, null, 2));
      return NextResponse.json({
        success: false,
        error: error.message,
        data: [],
      }, { status: 500 });
    }

    console.log('[Product List API] ✅ 数据库查询成功');
    console.log('[Product List API] 查询结果:', {
      count: data?.length || 0,
      total: count || 0,
      firstItem: data?.[0] ? {
        id: data[0].id,
        name: data[0].name,
        model: data[0].model,
        price: data[0].price
      } : null
    });

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
        model: (p as any).model || '',
        brand: (p as any).brand || extraFields.brand || (p as any).supplier || '',
        specifications: (p as any).specifications || extraFields.specifications || '',
        parameter_description: (p as any).parameter_description || '',
        unit: (p as any).unit || extraFields.unit || '台', // 默认单位
        cost_price: (p as any).cost_price || extraFields.cost_price || 0,
        min_price: (p as any).min_price || extraFields.min_price || 0,
        price: parseFloat((p as any).price) || 0,
        supplier: (p as any).supplier || '',
        contact_person: (p as any).contact_person || extraFields.contact_person || '',
        contact_phone: (p as any).contact_phone || extraFields.contact_phone || '',
        category: (p as any).category || '',
        stock: (p as any).stock || 0,
      };
    });

    const duration = Date.now() - startTime;
    console.log('[Product List API] ========== 请求完成 ==========');
    console.log('[Product List API] 返回数据:', {
      success: true,
      count: formattedProducts.length,
      total: count || 0,
      duration: `${duration}ms`
    });

    return NextResponse.json({
      success: true,
      data: formattedProducts,
      total: formattedProducts.length,
      count: count || 0,
      duration
    });
  } catch (error) {
    console.error('[Product List API] ❌ 请求异常:', error);
    console.error('[Product List API] 错误堆栈:', error instanceof Error ? error.stack : error);
    return NextResponse.json({
      success: false,
      error: '获取产品列表失败',
      data: [],
    }, { status: 500 });
  }
}
