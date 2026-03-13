import { NextRequest, NextResponse } from 'next/server';
import { withPermissionCheck } from '@/lib/permission-check';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hasPermission, UserRole } from '@/lib/auth/roles';

export async function POST(request: NextRequest) {
  try {
    const { entryId, approve, type, reason } = await request.json();
    const supabase = getSupabaseClient();

    console.log('[Admin Approve] ========== 开始审核 ==========');
    console.log('[Admin Approve] 参数:', { entryId, approve, type, reason });

    // 验证必要参数
    if (!entryId) {
      return NextResponse.json({ error: '缺少条目ID' }, { status: 400 });
    }

    if (!type) {
      return NextResponse.json({ error: '缺少类型' }, { status: 400 });
    }

    // 获取当前用户（从cookie或header）
    // 实际项目中应该从session获取
    const userStr = request.cookies.get('user')?.value;
    if (!userStr) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = JSON.parse(userStr);
    const userRole = user.role as UserRole;

    // 权限检查
    if (!hasPermission(userRole, 'canApproveKnowledge')) {
      return NextResponse.json({ error: '没有审核权限' }, { status: 403 });
    }

    const now = new Date().toISOString();

    // 根据类型处理不同表的审核
    if (type === 'knowledge') {
      const { error } = await supabase
        .from('knowledge_entries')
        .update({
          status: approve ? 'approved' : 'rejected',
          reviewed_by: user.id || user.userId,
          reviewed_at: now,
          metadata: approve ? {} : { rejectReason: reason },
        })
        .eq('id', entryId);

      if (error) {
        console.error('[Admin Approve] 知识库审核失败:', error);
        return NextResponse.json({ error: '审核失败', details: error.message }, { status: 500 });
      }

      console.log(`[Admin Approve] 知识库条目 ${entryId} ${approve ? '通过' : '拒绝'}`);
    }

    if (type === 'product') {
      const { error } = await supabase
        .from('products')
        .update({
          verified: approve,
          metadata: approve ? {} : { rejectReason: reason },
        })
        .eq('id', entryId);

      if (error) {
        console.error('[Admin Approve] 产品审核失败:', error);
        return NextResponse.json({ error: '审核失败', details: error.message }, { status: 500 });
      }

      console.log(`[Admin Approve] 产品 ${entryId} ${approve ? '通过' : '拒绝'}`);
    }

    if (type === 'user') {
      const { error } = await supabase
        .from('users')
        .update({
          status: approve ? 'active' : 'rejected',
          reviewed_at: now,
          reviewed_by: user.id || user.userId,
        })
        .eq('id', entryId);

      if (error) {
        console.error('[Admin Approve] 用户审核失败:', error);
        return NextResponse.json({ error: '审核失败', details: error.message }, { status: 500 });
      }

      console.log(`[Admin Approve] 用户 ${entryId} ${approve ? '通过' : '拒绝'}`);
    }

    console.log('[Admin Approve] ========== 审核完成 ==========');

    return NextResponse.json({
      success: true,
      message: approve ? '已通过' : '已拒绝',
      data: {
        entryId,
        status: approve ? 'approved' : 'rejected',
        reviewedAt: now,
      },
    });
  } catch (error) {
    console.error('[Admin Approve] 审核失败:', error);
    return NextResponse.json(
      {
        error: '审核失败',
        message: error instanceof Error ? error.message : '未知错误',
      },
      { status: 500 }
    );
  }
}

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);

    const type = searchParams.get('type');
    const page = parseInt(searchParams.get('page') || '1');
    const limit = parseInt(searchParams.get('limit') || '20');
    const offset = (page - 1) * limit;

    console.log('[Admin Approve] GET 请求', { type, page, limit });

    // 权限检查
    const userStr = request.cookies.get('user')?.value;
    if (!userStr) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = JSON.parse(userStr);
    const userRole = user.role as UserRole;

    if (!hasPermission(userRole, 'canApproveKnowledge')) {
      return NextResponse.json({ error: '没有查看权限' }, { status: 403 });
    }

    let data: any[] = [];
    let count = 0;

    // 根据类型查询不同表的待审核数据
    if (type === 'knowledge' || !type) {
      const {
        data: knowledgeData,
        error: knowledgeError,
        count: knowledgeCount,
      } = await supabase
        .from('knowledge_entries')
        .select('*', { count: 'exact' })
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (knowledgeError) {
        console.error('[Admin Approve] 查询知识库失败:', knowledgeError);
      } else {
        data = [...data, ...knowledgeData.map((item) => ({ ...item, type: 'knowledge' }))];
        count += knowledgeCount || 0;
      }
    }

    if (type === 'product' || !type) {
      const {
        data: productData,
        error: productError,
        count: productCount,
      } = await supabase
        .from('products')
        .select('*', { count: 'exact' })
        .eq('verified', false)
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (productError) {
        console.error('[Admin Approve] 查询产品库失败:', productError);
      } else {
        data = [...data, ...productData.map((item) => ({ ...item, type: 'product' }))];
        count += productCount || 0;
      }
    }

    if (type === 'user' || !type) {
      const {
        data: userData,
        error: userError,
        count: userCount,
      } = await supabase
        .from('users')
        .select('*', { count: 'exact' })
        .eq('status', 'pending')
        .order('created_at', { ascending: false })
        .range(offset, offset + limit - 1);

      if (userError) {
        console.error('[Admin Approve] 查询用户失败:', userError);
      } else {
        data = [...data, ...userData.map((item) => ({ ...item, type: 'user' }))];
        count += userCount || 0;
      }
    }

    // 按创建时间排序
    data.sort((a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime());

    // 分页
    const paginatedData = data.slice(0, limit);

    return NextResponse.json({
      success: true,
      data: paginatedData,
      pagination: {
        page,
        limit,
        total: count,
        totalPages: Math.ceil(count / limit),
      },
    });
  } catch (error) {
    console.error('[Admin Approve] 获取待审核列表失败:', error);
    return NextResponse.json({ error: '获取失败' }, { status: 500 });
  }
}
