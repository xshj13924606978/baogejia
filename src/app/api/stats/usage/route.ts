import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { hasPermission } from '@/lib/auth/roles';

export async function GET(request: NextRequest) {
  try {
    const supabase = getSupabaseClient();
    const { searchParams } = new URL(request.url);

    const userId = searchParams.get('userId');
    const startDate = searchParams.get('startDate');
    const endDate = searchParams.get('endDate');
    const period = searchParams.get('period') || 'day'; // day, week, month, year

    console.log('[Stats Usage] ========== 查询使用统计 ==========');
    console.log('[Stats Usage] 参数:', { userId, startDate, endDate, period });

    // 权限检查
    const userStr = request.cookies.get('user')?.value;
    if (!userStr) {
      return NextResponse.json({ error: '未登录' }, { status: 401 });
    }

    const user = JSON.parse(userStr);

    // 非管理员只能查看自己的数据
    if (userId && userId !== user.id && !hasPermission(user.role, 'canViewStats')) {
      return NextResponse.json({ error: '没有权限查看其他用户数据' }, { status: 403 });
    }

    // 构建时间范围
    let _query = supabase;
    let _dateFilter = '';

    if (startDate && endDate) {
      _dateFilter = `created_at.gte.${startDate},created_at.lte.${endDate}`;
    } else {
      // 默认最近30天
      const end = new Date();
      const start = new Date();
      start.setDate(start.getDate() - 30);
      _dateFilter = `created_at.gte.${start.toISOString()},created_at.lte.${end.toISOString()}`;
    }

    // 并行查询多个统计数据
    const [uploadsResult, quotesResult, knowledgeResult, productsResult, usersResult] =
      await Promise.all([
        // 上传统计
        supabase
          .from('user_uploads')
          .select('*', { count: 'exact', head: true })
          .eq(userId ? 'user_id' : 'user_id', userId || user.id),

        // 报价统计
        supabase
          .from('quotes')
          .select('*', { count: 'exact', head: true })
          .eq(userId ? 'user_id' : 'user_id', userId || user.id),

        // 知识库贡献统计
        supabase
          .from('knowledge_entries')
          .select('*', { count: 'exact', head: true })
          .eq(userId ? 'user_id' : 'user_id', userId || user.id),

        // 产品库贡献统计
        supabase
          .from('products')
          .select('*', { count: 'exact', head: true })
          .eq(userId ? 'created_by' : 'created_by', userId || user.id),

        // 如果是管理员，查询用户总数
        userId ? null : supabase.from('users').select('*', { count: 'exact', head: true }),
      ]);

    // 获取每日趋势数据
    const trendQuery = supabase
      .from('user_uploads')
      .select('created_at, file_size')
      .eq(userId ? 'user_id' : 'user_id', userId || user.id);

    if (startDate && endDate) {
      trendQuery.gte('created_at', startDate).lte('created_at', endDate);
    }

    const { data: trendData, error: trendError } = await trendQuery.order('created_at', {
      ascending: true,
    });

    if (trendError) {
      console.error('[Stats Usage] 获取趋势数据失败:', trendError);
    }

    // 按时间段聚合趋势数据
    const trend = aggregateTrendData(trendData || [], period);

    // 获取存储空间使用情况
    const { data: storageData, error: storageError } = await supabase.storage
      .from('quote-files')
      .list(userId ? `uploads/${userId}` : 'uploads', {
        limit: 1000,
        offset: 0,
      });

    if (storageError) {
      console.error('[Stats Usage] 获取存储数据失败:', storageError);
    }

    const totalStorage = (storageData || []).reduce(
      (sum, file) => sum + (file.metadata?.size || 0),
      0
    );

    const stats = {
      overview: {
        totalUploads: uploadsResult.count || 0,
        totalQuotes: quotesResult.count || 0,
        totalKnowledge: knowledgeResult.count || 0,
        totalProducts: productsResult.count || 0,
        totalUsers: usersResult?.count || 0,
        totalStorage: totalStorage,
        storageFormatted: formatBytes(totalStorage),
      },
      trend: trend,
      period: period,
      dateRange: {
        start:
          startDate || new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString().split('T')[0],
        end: endDate || new Date().toISOString().split('T')[0],
      },
    };

    console.log('[Stats Usage] 统计结果:', stats.overview);

    return NextResponse.json({
      success: true,
      data: stats,
    });
  } catch (error) {
    console.error('[Stats Usage] 统计查询失败:', error);
    return NextResponse.json(
      { error: '统计查询失败', message: error instanceof Error ? error.message : '未知错误' },
      { status: 500 }
    );
  }
}

/**
 * 聚合趋势数据
 */
function aggregateTrendData(data: any[], period: string): any[] {
  const trend: Record<string, { date: string; count: number; size: number }> = {};

  data.forEach((item) => {
    let key = '';
    const date = new Date(item.created_at);

    switch (period) {
      case 'day':
        key = date.toISOString().split('T')[0];
        break;
      case 'week':
        const week = getWeekNumber(date);
        key = `${date.getFullYear()}-W${week}`;
        break;
      case 'month':
        key = `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}`;
        break;
      case 'year':
        key = `${date.getFullYear()}`;
        break;
      default:
        key = date.toISOString().split('T')[0];
    }

    if (!trend[key]) {
      trend[key] = { date: key, count: 0, size: 0 };
    }

    trend[key].count += 1;
    trend[key].size += item.file_size || 0;
  });

  // 转换为数组并排序
  return Object.values(trend).sort((a, b) => a.date.localeCompare(b.date));
}

/**
 * 获取周数
 */
function getWeekNumber(date: Date): number {
  const firstDayOfYear = new Date(date.getFullYear(), 0, 1);
  const pastDaysOfYear = (date.getTime() - firstDayOfYear.getTime()) / 86400000;
  return Math.ceil((pastDaysOfYear + firstDayOfYear.getDay() + 1) / 7);
}

/**
 * 格式化字节数
 */
function formatBytes(bytes: number): string {
  if (bytes === 0) return '0 B';
  const k = 1024;
  const sizes = ['B', 'KB', 'MB', 'GB'];
  const i = Math.floor(Math.log(bytes) / Math.log(k));
  return `${(bytes / Math.pow(k, i)).toFixed(2)} ${sizes[i]}`;
}
