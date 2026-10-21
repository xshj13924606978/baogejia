import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import {
  getProductFieldVisibilityMap,
  maskProductFieldsByVisibility,
} from '@/lib/product-visibility';

export async function POST(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { name, model, category, limit = 20 } = await request.json();

    // 按等级逐字段判定敏感字段可见性（#202608302400 阶段3 P0-5）
    // 管理员全可见；其余按 member_field_permissions 表，未配置时回退默认矩阵
    const visibility = await getProductFieldVisibilityMap(request);

    let query = supabase.from('products').select('*');

    // 构建搜索条件（按产品名称、规格型号、品牌、参数描述、供应商）
    const filters: string[] = [];
    if (name) {
      filters.push(
        `name.ilike.%${name}%,model.ilike.%${name}%,brand.ilike.%${name}%,parameter_description.ilike.%${name}%,supplier.ilike.%${name}%`
      );
    }
    if (model) {
      filters.push(`model.ilike.%${model}%,specifications.ilike.%${model}%`);
    }
    if (category) {
      query = query.eq('category', category);
    }
    if (filters.length > 0) {
      query = query.or(filters.join(','));
    }

    const { data: products, error } = await query
      .order('price', { ascending: true })
      .limit(limit);

    if (error) {
      console.error('[Product Search] 查询失败:', error);
      return NextResponse.json({ error: 'Failed to search products' }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data: (products || []).map((p: Record<string, unknown>) =>
        maskProductFieldsByVisibility(p, visibility)
      ),
      count: products?.length || 0,
    });
  } catch (error) {
    console.error('[Product Search] 搜索失败:', error);
    return NextResponse.json({ error: 'Internal server error' }, { status: 500 });
  }
}
