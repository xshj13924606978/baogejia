import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { getProductRequiredFieldKeys } from '@/lib/product-field-merge';
import { safeErrorMessage } from '@/lib/error-handler';

// 创建单条产品
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();

    // 获取当前登录用户，用于记录 creator_id（未登录不允许新增）
    let currentUserId: string | null = null;
    let effectiveRole: string | null = null;
    try {
      const ctx = await resolveAuthContext(request);
      currentUserId = ctx.isAuthenticated ? ctx.currentUserId : null;
      effectiveRole = ctx.effectiveRole;
    } catch { /* ignore */ }
    if (!currentUserId) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }
    // 非管理员不允许写入敏感字段（厂家/联系人/电话/进价/最低售价）
    const canWriteSensitive = effectiveRole === 'admin' || effectiveRole === 'super_admin';

    // 动态必填校验（#[20260824-2015]：统一走共享合并函数 getProductRequiredFieldKeys，
    // 规则：以 system_fields 为主、product_field_configs 仅在显式 true 时覆盖（sf || pfc），
    // 与「新增/编辑产品表单」前端红 * 完全一致，杜绝硬编码与前后端不一致）
    const db = getSupabaseClient();
    const requiredKeys = await getProductRequiredFieldKeys(db);
    const missing: string[] = [];
    for (const key of requiredKeys) {
      const val = body[key];
      const isEmpty =
        val === undefined ||
        val === null ||
        (typeof val === 'string' && val.trim() === '') ||
        (typeof val === 'number' && Number.isNaN(val));
      if (isEmpty) missing.push(key);
    }
    if (missing.length > 0) {
      return NextResponse.json(
        {
          success: false,
          error: `缺少必填字段：${missing.join('、')}`,
        },
        { status: 400 }
      );
    }

    // 映射字段（统一产品字段规范）
    const productData: Record<string, any> = {
      name: body.name,
      updated_at: new Date().toISOString(),
      creator_id: currentUserId,
    };

    // 可选的13个标准字段
    const optionalFields = [
      'category', 'model', 'parameter_description', 'brand', 'unit',
      'supplier', 'contact_person', 'contact_phone', 'cost_price',
      'min_price', 'price', 'image_url', 'stock',
    ];
    for (const field of optionalFields) {
      if (body[field] !== undefined) {
        // 非管理员跳过敏感字段
        if (!canWriteSensitive && ['supplier', 'contact_person', 'contact_phone', 'cost_price', 'min_price'].includes(field)) {
          continue;
        }
        productData[field] = body[field];
      }
    }

    const { data, error } = await db
      .from('products')
      .insert(productData)
      .select()
      .single();

    if (error) {
      console.error('创建产品失败:', error);
      return NextResponse.json(
        { success: false, error: safeErrorMessage(error) },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '产品创建成功',
      data,
    });
  } catch (error) {
    console.error('创建产品失败:', error);
    return NextResponse.json(
      { success: false, error: '创建产品失败' },
      { status: 500 }
    );
  }
}
