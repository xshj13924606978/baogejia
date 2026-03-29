import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { resolveAuthContext } from '@/lib/knowledge/api-utils';

/**
 * GET /api/knowledge/categories?type=document
 * 获取已审核的分类列表（所有用户可用）
 */
export async function GET(request: NextRequest) {
  try {
    const { searchParams } = new URL(request.url);
    const type = searchParams.get('type');

    const supabase = await getSupabaseClient();

    let query = supabase
      .from('knowledge_categories')
      .select('id, type, name, name_en, icon, metadata_key, sort_order, is_default')
      .eq('is_active', true)
      .eq('status', 'approved')
      .order('sort_order');

    if (type) {
      query = query.eq('type', type);
    }

    const { data, error } = await query;

    if (error) {
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true, data: data || [] });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}

/**
 * POST /api/knowledge/categories
 * 申请新分类（普通用户 pending，超管直接 approved）
 */
export async function POST(request: NextRequest) {
  try {
    const auth = await resolveAuthContext(request);
    if (!auth.isAuthenticated) {
      return NextResponse.json({ success: false, error: '请先登录' }, { status: 401 });
    }

    const body = await request.json();
    const { type, name, icon } = body;

    if (!type || !name) {
      return NextResponse.json({ success: false, error: '类型和名称不能为空' }, { status: 400 });
    }

    const validTypes = ['document', 'case', 'standard', 'drawing', 'quota'];
    if (!validTypes.includes(type)) {
      return NextResponse.json({ success: false, error: '无效的分类类型' }, { status: 400 });
    }

    const metadataKeyMap: Record<string, string> = {
      document: 'category',
      case: 'project_type',
      standard: 'standard_type',
      drawing: 'drawing_type',
      quota: 'quota_type',
    };

    // 超管/admin 直接 approved，普通用户 pending
    const isDirectApprove = ['super_admin', 'admin'].includes(auth.effectiveRole);

    const supabase = await getSupabaseClient();
    const { data, error } = await supabase
      .from('knowledge_categories')
      .insert({
        type,
        name,
        icon: icon || null,
        metadata_key: metadataKeyMap[type],
        created_by: auth.currentUserId,
        status: isDirectApprove ? 'approved' : 'pending',
      })
      .select()
      .single();

    if (error) {
      if (error.code === '23505') {
        return NextResponse.json({ success: false, error: '该分类已存在' }, { status: 409 });
      }
      return NextResponse.json({ success: false, error: error.message }, { status: 500 });
    }

    return NextResponse.json({
      success: true,
      data,
      message: isDirectApprove ? '分类创建成功' : '分类申请已提交，等待审核',
    });
  } catch (e: any) {
    return NextResponse.json({ success: false, error: e.message }, { status: 500 });
  }
}
