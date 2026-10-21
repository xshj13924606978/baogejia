import { NextRequest, NextResponse } from 'next/server';
import { requireAdmin } from '@/lib/auth-utils';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';

/**
 * 客户管理后台 - 统计概览
 *
 * GET /api/admin/customers/stats
 * 返回：
 *  - total        客户总数（未软删除）
 *  - monthlyNew   本月新增客户
 *  - activeCount  活跃客户（近30天有报价记录，按 customer_info 名称匹配）
 *  - userStats    用户业绩统计 [{ userId, userName, customerCount, quoteCount, totalAmount }]
 */

export async function GET(_request: NextRequest) {
  const { errorResponse } = await requireAdmin(_request);
  if (errorResponse) return errorResponse;

  const db = getSupabaseServiceClient();

  try {
    // 1. 客户总数（未软删除）
    const { count: total, error: totalErr } = await db
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .is('metadata->>deleted_at', null);
    if (totalErr) throw totalErr;

    // 2. 本月新增
    const now = new Date();
    const monthStart = new Date(now.getFullYear(), now.getMonth(), 1).toISOString();
    const { count: monthlyNew, error: monthlyErr } = await db
      .from('customers')
      .select('id', { count: 'exact', head: true })
      .is('metadata->>deleted_at', null)
      .gte('created_at', monthStart);
    if (monthlyErr) throw monthlyErr;

    // 3. 活跃客户（近30天有报价）
    const thirtyDaysAgo = new Date(now.getTime() - 30 * 24 * 60 * 60 * 1000).toISOString();
    const { data: recentQuotes, error: recentErr } = await db
      .from('quotes')
      .select('customer_info, user_id, total_amount')
      .gte('created_at', thirtyDaysAgo)
      .limit(5000);
    if (recentErr) throw recentErr;

    const activeNames = new Set<string>();
    (recentQuotes || []).forEach((q) => {
      const name = q.customer_info?.name || q.customer_info?.customer_name;
      if (name && typeof name === 'string' && name.trim()) activeNames.add(name.trim());
    });

    let activeCount = 0;
    if (activeNames.size > 0) {
      const { count, error } = await db
        .from('customers')
        .select('id', { count: 'exact', head: true })
        .is('metadata->>deleted_at', null)
        .in('company_name', Array.from(activeNames).slice(0, 500));
      if (error) throw error;
      activeCount = count || 0;
    }

    // 4. 用户业绩统计
    // 4.1 客户按归属用户分组
    const { data: allCustomers, error: custErr } = await db
      .from('customers')
      .select('metadata')
      .is('metadata->>deleted_at', null)
      .limit(5000);
    if (custErr) throw custErr;

    const customerByUser = new Map<string, number>();
    (allCustomers || []).forEach((c) => {
      const uid = c.metadata?.user_id;
      if (uid) customerByUser.set(uid, (customerByUser.get(uid) || 0) + 1);
    });

    // 4.2 报价按用户分组
    const { data: allQuotes, error: quoteErr } = await db
      .from('quotes')
      .select('user_id, total_amount')
      .limit(5000);
    if (quoteErr) throw quoteErr;

    const quoteByUser = new Map<string, { count: number; totalAmount: number }>();
    (allQuotes || []).forEach((q) => {
      const uid = q.user_id;
      if (!uid) return;
      const cur = quoteByUser.get(uid) || { count: 0, totalAmount: 0 };
      cur.count += 1;
      cur.totalAmount += Number(q.total_amount) || 0;
      quoteByUser.set(uid, cur);
    });

    // 4.3 汇总用户信息
    const userIds = Array.from(
      new Set([...customerByUser.keys(), ...quoteByUser.keys()])
    );
    let userNameMap: Record<string, string> = {};
    if (userIds.length > 0) {
      const { data: users } = await db
        .from('users')
        .select('id, full_name, username')
        .in('id', userIds);
      userNameMap = Object.fromEntries(
        (users || []).map((u) => [u.id, u.full_name || u.username || u.id])
      );
    }

    const userStats = Array.from(
      new Set([...customerByUser.keys(), ...quoteByUser.keys()])
    ).map((uid) => ({
      userId: uid,
      userName: userNameMap[uid] || uid,
      customerCount: customerByUser.get(uid) || 0,
      quoteCount: quoteByUser.get(uid)?.count || 0,
      totalAmount: quoteByUser.get(uid)?.totalAmount || 0,
    }));
    userStats.sort((a, b) => b.customerCount - a.customerCount);

    return NextResponse.json({
      success: true,
      data: {
        total: total || 0,
        monthlyNew: monthlyNew || 0,
        activeCount,
        userStats,
      },
    });
  } catch (e) {
    console.error('[Admin Customers] GET stats error:', e);
    return NextResponse.json({ success: false, error: '查询统计数据失败' }, { status: 500 });
  }
}
