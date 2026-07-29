import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { name, model, category, limit = 20 } = await request.json();


    let query = supabase.from('products').select('*');

    // 构建搜索条件
    if (name) {
      // 按产品名称和关键词搜索
      query = query.or(`name.ilike.%${name}%,keywords.ilike.%${name}%`);
    }

    if (model) {
      // 按型号搜索
      query = query.or(`model.ilike.%${model}%,specifications.ilike.%${model}%`);
    }

    if (category) {
      query = query.eq('category', category);
    }

    // 按验证状态排序，已验证的排在前面
    const { data: products, error } = await query
      .order('verified', { ascending: false })
      .order('price', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[Product Search] 查询失败:', error);
      return NextResponse.json({ error: 'Failed to search products' }, { status: 500 });
    }


    return NextResponse.json({
      success: true,
      data: products || [],
      count: products?.length || 0,
    });
  } catch (error) {
    console.error('[Product Search] 搜索失败:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
