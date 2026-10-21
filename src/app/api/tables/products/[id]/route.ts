import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient, getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { submitProductUpdateRequest } from '@/lib/contributor/service';
import { isUserAdminRole } from '@/lib/admin-role-helper';
import { safeErrorMessage } from '@/lib/error-handler';

async function getAuth(request: NextRequest) {
  try {
    const ctx = await resolveAuthContext(request);
    if (!ctx.isAuthenticated) return null;
    return ctx;
  } catch {
    return null;
  }
}

// 更新产品：仅本人或管理员可编辑（非管理员只能编辑自己的产品）
export async function PATCH(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const id = params.id;
    const body = await request.json();

    const ctx = await getAuth(request);
    if (!ctx) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }
    // 是否管理员：DB 驱动 + 中英文 fallback 兼容（不再硬编码 ['super_admin','admin']）
    const isAdmin = isUserAdminRole(ctx.effectiveRole || '');

    const db = getSupabaseClient();

    // 校验产品存在性 + 归属
    const { data: existing, error: fetchError } = await db
      .from('products')
      .select('id, creator_id')
      .eq('id', id)
      .single();

    if (fetchError || !existing) {
      return NextResponse.json({ success: false, error: '产品不存在' }, { status: 404 });
    }

    const isOwner = existing.creator_id === ctx.currentUserId;
    if (!isOwner && !isAdmin) {
      return NextResponse.json({ success: false, error: '仅可编辑自己上传的产品' }, { status: 403 });
    }

    // 映射前端字段到数据库字段（统一产品字段规范）
    const updateData: Record<string, any> = {
      updated_at: new Date().toISOString(),
    };

    // 13个标准字段
    if (body.category !== undefined) updateData.category = body.category;
    if (body.name !== undefined) updateData.name = body.name;
    if (body.model !== undefined) updateData.model = body.model;
    if (body.parameter_description !== undefined) updateData.parameter_description = body.parameter_description;
    if (body.brand !== undefined) updateData.brand = body.brand;
    if (body.unit !== undefined) updateData.unit = body.unit;
    // 仅管理员或产品创建者可修改敏感字段（厂家/联系人/电话/进价/最低售价）
    if ((isAdmin || isOwner) && body.supplier !== undefined) updateData.supplier = body.supplier;
    if ((isAdmin || isOwner) && body.contact_person !== undefined) updateData.contact_person = body.contact_person;
    if ((isAdmin || isOwner) && body.contact_phone !== undefined) updateData.contact_phone = body.contact_phone;
    if ((isAdmin || isOwner) && body.cost_price !== undefined) updateData.cost_price = parseFloat(body.cost_price) || 0;
    if ((isAdmin || isOwner) && body.min_price !== undefined) updateData.min_price = parseFloat(body.min_price) || 0;
    if (body.price !== undefined) updateData.price = parseFloat(body.price) || 0;
    if (body.image_url !== undefined) updateData.image_url = body.image_url;
    // 系统字段
    if (body.stock !== undefined) updateData.stock = parseInt(body.stock) || 0;

    // 非管理员编辑自己的产品 → 提交审批请求，不直接写库（#20260820-1130-2）
    if (!isAdmin) {
      const hasChanges = Object.keys(updateData).some((k) => k !== 'updated_at');
      if (!hasChanges) {
        return NextResponse.json({ success: false, error: '没有需要提交的修改' }, { status: 400 });
      }

      // 用服务端客户端读取完整快照（含敏感字段），作为审核对比基准与通过时保留原值
      const svcDb = getSupabaseServiceClient();
      const { data: fullProduct, error: fullError } = await svcDb
        .from('products')
        .select('*')
        .eq('id', id)
        .single();
      if (fullError || !fullProduct) {
        return NextResponse.json({ success: false, error: '产品不存在' }, { status: 404 });
      }

      const result = await submitProductUpdateRequest({
        productId: id,
        originalData: fullProduct,
        newData: updateData,
        reason: typeof body.reason === 'string' ? body.reason : '',
        requestType: 'edit',
        requesterId: ctx.currentUserId!,
        requesterName: typeof body.requesterName === 'string' ? body.requesterName : '',
      });
      if (!result.success) {
        return NextResponse.json({ success: false, error: result.error || '提交修改申请失败' }, { status: 500 });
      }
      return NextResponse.json({
        success: true,
        pendingApproval: true,
        message: '修改申请已提交，等待管理员审核通过后生效',
        requestId: result.request?.id,
      });
    }

    const { data, error } = await db
      .from('products')
      .update(updateData)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      console.error('更新产品失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: safeErrorMessage(error),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '产品更新成功',
      data,
    });
  } catch (error) {
    console.error('更新产品失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '更新产品失败',
      },
      { status: 500 }
    );
  }
}

// 删除产品：仅管理员可删除
export async function DELETE(request: NextRequest, context: { params: Promise<{ id: string }> }) {
  try {
    const params = await context.params;
    const id = params.id;

    const ctx = await getAuth(request);
    if (!ctx) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }
    // DB 角色集驱动（含 fallback），不再硬编码 ['super_admin','admin']
    if (!isUserAdminRole(ctx.effectiveRole || '')) {
      return NextResponse.json({ success: false, error: '仅管理员可删除产品' }, { status: 403 });
    }

    const db = getSupabaseClient();

    const { error } = await db.from('products').delete().eq('id', id);

    if (error) {
      console.error('删除产品失败:', error);
      return NextResponse.json(
        {
          success: false,
          error: safeErrorMessage(error),
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: '产品删除成功',
    });
  } catch (error) {
    console.error('删除产品失败:', error);
    return NextResponse.json(
      {
        success: false,
        error: '删除产品失败',
      },
      { status: 500 }
    );
  }
}
