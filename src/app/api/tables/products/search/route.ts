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
        return NextResponse.json(
          {
            success: false,
            error: error.message,
            data: [],
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: (data || []).map((p: any) => ({
          id: p.id,
          name: p.name || '',
          model: p.model || '',
          brand: p.brand || '',
          parameter_description: p.parameter_description || '',
          description: p.description || '',
          unit: p.unit || '台',
          cost_price: parseFloat(p.cost_price) || 0,
          min_price: parseFloat(p.min_price) || 0,
          price: parseFloat(p.price) || 0,
          supplier: p.supplier || '',
          contact_person: p.contact_person || '',
          contact_phone: p.contact_phone || '',
          category: p.category || '',
          stock: p.stock || 0,
          image_url: p.image_url || '',
        })),
      });
    }

    // 关键词搜索（产品名称、规格型号、品牌、参数描述）
    const { data, error } = await db
      .from('products')
      .select('*')
      .or(
        `name.ilike.%${keyword}%,model.ilike.%${keyword}%,brand.ilike.%${keyword}%,parameter_description.ilike.%${keyword}%,description.ilike.%${keyword}%,supplier.ilike.%${keyword}%`
      );

    if (error) {
      console.error('搜索产品失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: error.message,
          data: [],
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: (data || []).map((p: any) => ({
        id: p.id,
        name: p.name || '',
        model: p.model || '',
        brand: p.brand || '',
        parameter_description: p.parameter_description || '',
        description: p.description || '',
        unit: p.unit || '台',
        cost_price: parseFloat(p.cost_price) || 0,
        min_price: parseFloat(p.min_price) || 0,
        price: parseFloat(p.price) || 0,
        supplier: p.supplier || '',
        contact_person: p.contact_person || '',
        contact_phone: p.contact_phone || '',
        category: p.category || '',
        stock: p.stock || 0,
        image_url: p.image_url || '',
      })),
    });
  } catch (error) {
    console.error('搜索产品失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '搜索产品失败',
        data: [],
      },
      { status: 500 }
    );
  }
}
// test protection
// test protection 2
