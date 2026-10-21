import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseServiceClient } from '@/storage/database/supabase-client';
import { requireAdmin } from '@/lib/auth-utils';
import { safeErrorMessage } from '@/lib/error-handler';

export async function GET(request: NextRequest) {
  try {
    // 全局统计数据仅管理员可访问
    const { errorResponse } = await requireAdmin(request);
    if (errorResponse) return errorResponse;

    const supabase = getSupabaseServiceClient();

    const today = new Date();
    const todayStart = new Date(today.setHours(0, 0, 0, 0)).toISOString();
    const todayEnd = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    const yesterdayStart = new Date(today.setDate(today.getDate() - 1)).toISOString();
    const yesterdayEnd = new Date(today.setHours(23, 59, 59, 999)).toISOString();

    // 并行查询多个统计数据
    const [
      totalUsers,
      newUsersToday,
      totalQuotes,
      quotesToday,
      totalUploads,
      uploadsToday,
      totalKnowledge,
      knowledgeToday,
      totalProducts,
      productsToday,
    ] = await Promise.all([
      // 总用户数
      supabase.from('users').select('*', { count: 'exact', head: true }),

      // 今日新增用户
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd),

      // 总报价数
      supabase.from('quotes').select('*', { count: 'exact', head: true }),

      // 今日报价数
      supabase
        .from('quotes')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd),

      // 总上传数
      supabase.from('user_uploads').select('*', { count: 'exact', head: true }),

      // 今日上传数
      supabase
        .from('user_uploads')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd),

      // 总知识库条目
      supabase.from('knowledge_entries').select('*', { count: 'exact', head: true }),

      // 今日知识库条目
      supabase
        .from('knowledge_entries')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd),

      // 总产品数
      supabase.from('products').select('*', { count: 'exact', head: true }),

      // 今日新增产品
      supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', todayStart)
        .lte('created_at', todayEnd),
    ]);

    // 获取昨日数据用于计算增长率
    const [
      usersYesterday,
      quotesYesterday,
      uploadsYesterday,
      knowledgeYesterday,
      productsYesterday,
    ] = await Promise.all([
      supabase
        .from('users')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterdayStart)
        .lte('created_at', yesterdayEnd),

      supabase
        .from('quotes')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterdayStart)
        .lte('created_at', yesterdayEnd),

      supabase
        .from('user_uploads')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterdayStart)
        .lte('created_at', yesterdayEnd),

      supabase
        .from('knowledge_entries')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterdayStart)
        .lte('created_at', yesterdayEnd),

      supabase
        .from('products')
        .select('*', { count: 'exact', head: true })
        .gte('created_at', yesterdayStart)
        .lte('created_at', yesterdayEnd),
    ]);

    // 计算增长率
    const calculateGrowth = (today: number, yesterday: number) => {
      if (yesterday === 0) return today > 0 ? 100 : 0;
      return ((today - yesterday) / yesterday) * 100;
    };

    const stats = {
      users: {
        total: totalUsers.count || 0,
        today: newUsersToday.count || 0,
        growth: calculateGrowth(newUsersToday.count || 0, usersYesterday.count || 0),
      },
      quotes: {
        total: totalQuotes.count || 0,
        today: quotesToday.count || 0,
        growth: calculateGrowth(quotesToday.count || 0, quotesYesterday.count || 0),
      },
      uploads: {
        total: totalUploads.count || 0,
        today: uploadsToday.count || 0,
        growth: calculateGrowth(uploadsToday.count || 0, uploadsYesterday.count || 0),
      },
      knowledge: {
        total: totalKnowledge.count || 0,
        today: knowledgeToday.count || 0,
        growth: calculateGrowth(knowledgeToday.count || 0, knowledgeYesterday.count || 0),
      },
      products: {
        total: totalProducts.count || 0,
        today: productsToday.count || 0,
        growth: calculateGrowth(productsToday.count || 0, productsYesterday.count || 0),
      },
    };


    return NextResponse.json({
      success: true,
      data: stats,
      timestamp: new Date().toISOString(),
    });
  } catch (error) {
    console.error('[Stats Overview] 统计查询失败:', error);
    return NextResponse.json(
      { error: '统计查询失败', message: error instanceof Error ? safeErrorMessage(error) : '未知错误' },
      { status: 500 }
    );
  }
}
