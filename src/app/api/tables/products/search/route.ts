import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  buildFullVisibility,
  getProductFieldVisibilityContextMap,
  maskProductFieldsByVisibility,
} from '@/lib/product-visibility';
import { safeErrorMessage } from '@/lib/error-handler';

// 搜索产品
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { keyword } = body;

    const db = getSupabaseClient();

    // 判断当前用户可查看哪些敏感字段（#202608302400 阶段3 P0-5）
    // 管理员全量可见；其余按等级逐字段（member_field_permissions）；
    // 创建者本人可见自己产品的全部敏感字段（#20260821-1545-1）
    const { visibility, currentUserId } = await getProductFieldVisibilityContextMap(request);
    const ownerVisibility = buildFullVisibility();

    const mapRow = (p: any) => {
      const row: Record<string, unknown> = {
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
        creator_id: p.creator_id || '',
        stock: p.stock || 0,
      };
      // 创建者本人可见自己产品的全部敏感字段，其余按等级逐字段判定
      const isOwner = !!p.creator_id && !!currentUserId && p.creator_id === currentUserId;
      return maskProductFieldsByVisibility(row, isOwner ? ownerVisibility : visibility);
    };

    if (!keyword) {
      const { data, error } = await db.from('products').select('*');
      if (error) {
        console.error('获取产品失败:', error);
        return NextResponse.json(
          {
            success: false,
            error: safeErrorMessage(error),
            data: [],
          },
          { status: 500 }
        );
      }

      return NextResponse.json({
        success: true,
        data: (data || []).map(mapRow),
      });
    }

    // 关键词搜索（产品名称、规格型号、品牌、参数描述、供应商）
    const { data, error } = await db
      .from('products')
      .select('*')
      .or(
        `name.ilike.%${keyword}%,model.ilike.%${keyword}%,brand.ilike.%${keyword}%,parameter_description.ilike.%${keyword}%,supplier.ilike.%${keyword}%`
      );

    if (error) {
      console.error('搜索产品失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: safeErrorMessage(error),
          data: [],
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      data: (data || []).map(mapRow),
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
