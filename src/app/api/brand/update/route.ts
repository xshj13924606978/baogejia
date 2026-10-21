// 更新品牌信息 API（用户端）
import { NextRequest, NextResponse } from 'next/server';
import { requireAuth } from '@/lib/auth-utils';
import { updateBrand } from '@/lib/brand-service';

export async function PUT(request: NextRequest) {
  const { user, errorResponse } = await requireAuth(request);
  if (errorResponse) return errorResponse;

  try {
    const body = await request.json();
    const brandId = body?.brandId;
    if (!brandId || typeof brandId !== 'string') {
      return NextResponse.json({ success: false, error: '缺少品牌 ID' }, { status: 400 });
    }

    const result = await updateBrand(brandId, user.id, {
      brand_name: body.brand_name,
      brand_logo: body.brand_logo,
      brand_desc: body.brand_desc,
      category: body.category,
      contact_person: body.contact_person,
      contact_phone: body.contact_phone,
      contact_email: body.contact_email,
      website: body.website,
      address: body.address,
    });

    if (!result.success) {
      return NextResponse.json({ success: false, error: result.reason }, { status: 400 });
    }
    return NextResponse.json({ success: true, brand: result.brand });
  } catch (error) {
    console.error('[BrandUpdate API] 更新品牌异常:', error);
    return NextResponse.json({ success: false, error: '更新失败，请稍后重试' }, { status: 500 });
  }
}
