// 品牌入驻申请 API（用户端）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { createBrand } from '@/lib/brand-service';

export async function POST(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    // #20260831-1600 P1-11：新增入驻资质字段（营业执照/法人/资质材料）
    const result = await createBrand(user.id, {
      brand_name: body?.brand_name,
      brand_logo: body?.brand_logo,
      brand_desc: body?.brand_desc,
      category: body?.category,
      contact_person: body?.contact_person,
      contact_phone: body?.contact_phone,
      contact_email: body?.contact_email,
      website: body?.website,
      address: body?.address,
      business_license: body?.business_license,
      license_image_url: body?.license_image_url,
      legal_person: body?.legal_person,
      qualifications: body?.qualifications,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason, brand: result.brand }, { status: 400 });
    }
    return NextResponse.json({ success: true, brand: result.brand });
  } catch (error) {
    console.error('[BrandRegister API] 入驻申请异常:', error);
    return NextResponse.json({ success: false, error: '提交失败，请稍后重试' }, { status: 500 });
  }
}
