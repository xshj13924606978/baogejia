// 管理端品牌详情 API
import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheckWithParams } from '@/lib/permission-check';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { attachUserPhoneOne } from '@/lib/user-phone-utils';
import { safeErrorMessage } from '@/lib/error-handler';

async function getBrandVendor(_request: NextRequest, params: any, _user: any) {
  try {
    const id = params?.id;
    if (!id) {
      return NextResponse.json({ success: false, error: '缺少品牌 ID' }, { status: 400 });
    }
    const db = getSupabaseServiceClient();
    const { data, error } = await db
      .from('brand_vendors')
      .select('*, user:users(id, username, email, metadata)')
      .eq('id', id)
      .maybeSingle();

    if (error) {
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }
    if (!data) {
      return NextResponse.json({ success: false, error: '品牌不存在' }, { status: 404 });
    }
    // users 无顶层 phone 列，从 metadata.phone 提升（避免 PostgREST 400）
    return NextResponse.json({ success: true, brand: attachUserPhoneOne(data) });
  } catch (error) {
    console.error('[AdminBrandVendor GET] 获取品牌详情失败:', error);
    return NextResponse.json({ success: false, error: '获取品牌详情失败' }, { status: 500 });
  }
}

export const GET = withPermissionCheckWithParams({ permissions: 'admin.brand.view' }, getBrandVendor);
