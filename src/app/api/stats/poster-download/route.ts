import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 海报下载统计
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, style } = body;

    if (!user_id || !style) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const db = getSupabaseClient();

    // 检查用户今天是否已有海报记录
    const today = new Date().toISOString().split('T')[0];
    const { data: existingPoster } = await db
      .from('invite_posters')
      .select('*')
      .eq('user_id', parseInt(user_id))
      .eq('style', style)
      .gte('created_at', `${today}T00:00:00Z`)
      .single();

    if (existingPoster) {
      // 更新下载次数
      const { error } = await db
        .from('invite_posters')
        .update({
          download_count: (existingPoster.download_count || 0) + 1,
        })
        .eq('id', existingPoster.id);

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: '下载统计已更新',
      });
    } else {
      // 创建新的海报记录
      const { error } = await db.from('invite_posters').insert({
        user_id: parseInt(user_id),
        style,
        download_count: 1,
      });

      if (error) throw error;

      return NextResponse.json({
        success: true,
        message: '下载统计已创建',
      });
    }
  } catch (error) {
    console.error('[PosterStats] 记录下载失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 获取海报统计数据
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseClient();

    // 获取用户的海报统计
    const { data: userPosters, error } = await db
      .from('invite_posters')
      .select('*')
      .eq('user_id', parseInt(user_id))
      .order('created_at', { ascending: false })
      .limit(30);

    if (error) throw error;

    // 统计各风格下载次数
    const stats = {
      totalDownloads: userPosters?.reduce((sum, p) => sum + (p.download_count || 0), 0) || 0,
      simpleDownloads: userPosters?.filter(p => p.style === 'simple').reduce((sum, p) => sum + (p.download_count || 0), 0) || 0,
      festiveDownloads: userPosters?.filter(p => p.style === 'festive').reduce((sum, p) => sum + (p.download_count || 0), 0) || 0,
      businessDownloads: userPosters?.filter(p => p.style === 'business').reduce((sum, p) => sum + (p.download_count || 0), 0) || 0,
      totalShares: userPosters?.reduce((sum, p) => sum + (p.share_count || 0), 0) || 0,
    };

    // 今日统计
    const today = new Date().toISOString().split('T')[0];
    const todayPosters = userPosters?.filter(p => p.created_at?.startsWith(today)) || [];
    const todayStats = {
      generated: todayPosters.length,
      downloaded: todayPosters.reduce((sum, p) => sum + (p.download_count || 0), 0),
      shared: todayPosters.reduce((sum, p) => sum + (p.share_count || 0), 0),
    };

    // 全局统计（管理员）
    const { data: allPosters } = await db
      .from('invite_posters')
      .select('download_count, share_count')
      .gte('created_at', `${today}T00:00:00Z`);

    const globalStats = {
      todayGenerated: allPosters?.length || 0,
      todayDownloaded: allPosters?.reduce((sum, p) => sum + (p.download_count || 0), 0) || 0,
      todayShared: allPosters?.reduce((sum, p) => sum + (p.share_count || 0), 0) || 0,
    };

    return NextResponse.json({
      success: true,
      data: {
        userStats: stats,
        todayStats,
        globalStats,
        history: userPosters || [],
      },
    });
  } catch (error) {
    console.error('[PosterStats] 获取统计失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 更新分享统计
export async function PATCH(request: NextRequest) {
  try {
    const body = await request.json();
    const { user_id, style } = body;

    if (!user_id || !style) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const db = getSupabaseClient();

    const today = new Date().toISOString().split('T')[0];
    const { data: existingPoster } = await db
      .from('invite_posters')
      .select('*')
      .eq('user_id', parseInt(user_id))
      .eq('style', style)
      .gte('created_at', `${today}T00:00:00Z`)
      .single();

    if (existingPoster) {
      const { error } = await db
        .from('invite_posters')
        .update({
          share_count: (existingPoster.share_count || 0) + 1,
        })
        .eq('id', existingPoster.id);

      if (error) throw error;
    }

    return NextResponse.json({
      success: true,
      message: '分享统计已更新',
    });
  } catch (error) {
    console.error('[PosterStats] 更新分享统计失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
