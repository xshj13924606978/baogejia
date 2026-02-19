import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 搜索产品
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword } = body;

    const db = getSupabaseClient();

    if (!keyword) {
      const { data, error } = await db.from('products').select('*');
      if (error) {
        console.error('获取产品失败:', error);
        return NextResponse.json({
          success: false,
          error: error.message,
          data: [],
        }, { status: 500 });
      }

      return NextResponse.json({
        success: true,
        data: (data || []).map((p: any) => ({
          id: p.id,
          product_name: p.name,
          model: p.model || '',
          brand: p.supplier || '',
          specifications: p.specifications || '',
          unit: '台',
          price: parseFloat(p.price) || 0,
          supplier: p.supplier || '',
        })),
      });
    }

    // 关键词搜索（产品名称、型号、供应商）
    const { data, error } = await db
      .from('products')
      .select('*')
      .or(`name.ilike.%${keyword}%,model.ilike.%${keyword}%,supplier.ilike.%${keyword}%`);

    if (error) {
      console.error('搜索产品失败:', error);
      return NextResponse.json({
        success: false,
        error: error.message,
        data: [],
      }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: (data || []).map((p: any) => ({
        id: p.id,
        product_name: p.name,
        model: p.model || '',
        brand: p.supplier || '',
        specifications: p.specifications || '',
        unit: '台',
        price: parseFloat(p.price) || 0,
        supplier: p.supplier || '',
      })),
    });
  } catch (error) {
    console.error('搜索产品失败:', error);
    return NextResponse.json({
      success: false,
      error: '搜索产品失败',
      data: [],
    }, { status: 500 });
  }
}
