import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// GET /api/products - 获取产品列表
export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);

    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;
    const search = searchParams.get('search') || '';
    const id = searchParams.get('id');

    console.log('[Products API] GET 请求', { page, limit, search, id });

    let query = supabase.from('products').select('*', { count: 'exact' });

    // 如果指定了ID，返回单个记录
    if (id) {
      const { data, error } = await query.eq('id', id).single();

      if (error) {
        console.error('[Products API] 产品不存在:', error);
        return NextResponse.json({ error: 'Product not found' }, { status: 404 });
      }

      return NextResponse.json({ success: true, data });
    }

    // 搜索条件
    if (search) {
      query = query.or(`name.ilike.%${search}%,model.ilike.%${search}%,keywords.ilike.%${search}%`);
    }

    // 分页和排序
    const { data, error, count } = await query
      .order('verified', { ascending: false })
      .order('created_at', { ascending: false })
      .range(offset, offset + limit - 1);

    if (error) {
      console.error('[Products API] 查询失败:', error);
      return NextResponse.json(
        { error: 'Failed to fetch products', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: data || [],
      pagination: {
        page,
        limit,
        total: count || 0,
        totalPages: Math.ceil((count || 0) / limit),
      },
    });
  } catch (error) {
    console.error('[Products API] 服务器错误:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// POST /api/products - 创建产品
export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();

    console.log('[Products API] POST 请求', body);

    // 验证必要字段
    if (!body.name) {
      return NextResponse.json({ error: 'Product name is required' }, { status: 400 });
    }

    if (body.price === undefined || body.price === null) {
      return NextResponse.json({ error: 'Product price is required' }, { status: 400 });
    }

    const now = new Date().toISOString();

    const { data, error } = await supabase
      .from('products')
      .insert({
        name: body.name,
        model: body.model || '',
        category: body.category || '',
        brand: body.brand || '',
        price: parseFloat(body.price) || 0,
        unit: body.unit || '台',
        specifications: body.specifications || '',
        keywords: body.keywords || '',
        verified: body.verified || false,
        created_at: now,
        updated_at: now,
      })
      .select()
      .single();

    if (error) {
      console.error('[Products API] 创建失败:', error);
      return NextResponse.json(
        { error: 'Failed to create product', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Product created successfully',
    });
  } catch (error) {
    console.error('[Products API] 服务器错误:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// PUT /api/products - 更新产品
export async function PUT(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const body = await request.json();

    console.log('[Products API] PUT 请求', body);

    if (!body.id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    const { data, error } = await supabase
      .from('products')
      .update({
        name: body.name,
        model: body.model,
        category: body.category,
        brand: body.brand,
        price: parseFloat(body.price) || 0,
        unit: body.unit,
        specifications: body.specifications,
        keywords: body.keywords,
        verified: body.verified,
        updated_at: new Date().toISOString(),
      })
      .eq('id', body.id)
      .select()
      .single();

    if (error) {
      console.error('[Products API] 更新失败:', error);
      return NextResponse.json(
        { error: 'Failed to update product', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data,
      message: 'Product updated successfully',
    });
  } catch (error) {
    console.error('[Products API] 服务器错误:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}

// DELETE /api/products - 删除产品
export async function DELETE(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);
    const id = searchParams.get('id');

    if (!id) {
      return NextResponse.json({ error: 'Product ID is required' }, { status: 400 });
    }

    console.log('[Products API] DELETE 请求', { id });

    const { error } = await supabase.from('products').delete().eq('id', id);

    if (error) {
      console.error('[Products API] 删除失败:', error);
      return NextResponse.json(
        { error: 'Failed to delete product', details: error.message },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'Product deleted successfully',
    });
  } catch (error) {
    console.error('[Products API] 服务器错误:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
