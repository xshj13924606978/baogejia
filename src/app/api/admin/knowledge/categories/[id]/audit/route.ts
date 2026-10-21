import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';
import { safeErrorMessage } from '@/lib/error-handler';

interface RouteContext {
  params: Promise<{ id: string }>;
}

/**
 * PUT /api/admin/knowledge/categories/:id/audit
 * 审核分类（超管/admin）
 * Body: { action: 'approve' | 'reject', reject_reason?: string }
 */
export async function PUT(request: NextRequest, context: RouteContext) {
  try {
    const auth = await resolveAuthContext(request);
    if (!['super_admin', 'admin'].includes(auth.effectiveRole)) {
      return NextResponse.json({ success: false, error: '无权限' }, { status: 403 });
    }

    const { id } = await context.params;
    const body = await request.json();
    const { action, reject_reason } = body;

    if (!action || !['approve', 'reject'].includes(action)) {
      return NextResponse.json({ success: false, error: '无效的操作' }, { status: 400 });
    }

    const supabase = await getSupabaseClient();

    // 检查分类是否存在
    const { data: cat } = await supabase
      .from('knowledge_categories')
      .select('id, status, name')
      .eq('id', id)
      .single();

    if (!cat) {
      return NextResponse.json({ success: false, error: '分类不存在' }, { status: 404 });
    }

    if (cat.status !== 'pending') {
      return NextResponse.json({ success: false, error: `该分类已审核（当前状态: ${cat.status}）` }, { status: 400 });
    }

    const updates: Record<string, any> = {
      status: action === 'approve' ? 'approved' : 'rejected',
      updated_at: new Date().toISOString(),
    };

    if (action === 'reject') {
      updates.reject_reason = reject_reason || '未提供拒绝原因';
    }

    const { data, error } = await supabase
      .from('knowledge_categories')
      .update(updates)
      .eq('id', id)
      .select()
      .single();

    if (error) {
      return NextResponse.json({ success: false, error: safeErrorMessage(error) }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data,
      message: action === 'approve' ? `分类"${cat.name}"已通过审核` : `分类"${cat.name}"已拒绝`,
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
