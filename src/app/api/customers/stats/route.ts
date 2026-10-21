import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/lib/supabase';

async function getUserId(request: NextRequest): Promise<string | null> {
  const xUserId = request.headers.get('x-user-id');
  if (xUserId) return xUserId;
  try {
    const { getCurrentUser } = await import('@/lib/auth-utils');
    const user = await getCurrentUser(request);
    return user?.id || null;
  } catch {
    return null;
  }
}

/**
 * 用户端 - 客户统计
 *
 * GET /api/customers/stats
 * 返回 { success: true, data: { total, monthlyNew, activeCount } }
 *
 * 数据范围：与列表一致（自己的 + legacy 无 user_id），过滤软删除
 */

export async function GET(request: NextRequest) {
  const userId = await getUserId(request);
  if (!userId) {
    return NextResponse.json({ success: false, error: '未认证' }, { status: 401 });
  }

  const supabase = getSupabaseClient();

  try {
    // 1. 客户总数（own + legacy）
    const [ownTotalRes, legacyTotalRes] = await Promise.all([
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('metadata->>user_id', userId)
        .is('metadata->>deleted_at', null),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .is('metadata->>user_id', null)
        .is('metadata->>deleted_at', null),
    ]);
    const total = (ownTotalRes.count || 0) + (legacyTotalRes.count || 0);

    // 2. 本月新增
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const [ownMonthRes, legacyMonthRes] = await Promise.all([
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .eq('metadata->>user_id', userId)
        .is('metadata->>deleted_at', null)
        .gte('created_at', monthStart),
      supabase
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .is('metadata->>user_id', null)
        .is('metadata->>deleted_at', null)
        .gte('created_at', monthStart),
    ]);
    const monthlyNew = (ownMonthRes.count || 0) + (legacyMonthRes.count || 0);

    // 3. 活跃客户（近 30 天有报价，按 company_name 匹配）
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentQuotes, error: recentErr } = await supabase
      .from('quotes')
      .select('customer_info')
      .gte('created_at', thirtyDaysAgo)
      .limit(2000);
    if (recentErr) throw recentErr;

    const activeNames = new Set<string>();
    (recentQuotes || []).forEach((q: any) => {
      const name = q.customer_info?.name || q.customer_info?.customer_name;
      if (name && typeof name === 'string' && name.trim()) {
        activeNames.add(name.trim());
      }
    });

    let activeCount = 0;
    if (activeNames.size > 0) {
      const [ownActiveRes, legacyActiveRes] = await Promise.all([
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .eq('metadata->>user_id', userId)
          .is('metadata->>deleted_at', null)
          .in('company_name', Array.from(activeNames).slice(0, 500)),
        supabase
          .from('customers')
          .select('id', { count: 'exact', head: true })
          .is('metadata->>user_id', null)
          .is('metadata->>deleted_at', null)
          .in('company_name', Array.from(activeNames).slice(0, 500)),
      ]);
      // own + legacy 并集（同名公司可能同时在两范围，按并集去重，简化用 a+b）
      activeCount = (ownActiveRes.count || 0) + (legacyActiveRes.count || 0);
    }

    return NextResponse.json({
      success: true,
      data: { total, monthlyNew, activeCount },
    });
  } catch (e: any) {
    console.error('[User Customer Stats] GET error:', e);
    return NextResponse.json(
      { success: false, error: e.message || '查询统计数据失败' },
      { status: 500 }
    );
  }
}
