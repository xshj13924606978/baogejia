import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';

// 获取用户统计数据
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseClient();

    // 获取邀请统计
    const { data: invites } = await db
      .from('invites')
      .select('status')
      .eq('user_id', parseInt(user_id));

    const _inviteCount = invites?.length || 0;
    const inviteRegistered = invites?.filter((i) => i.status === 'registered').length || 0;

    // 获取上传统计
    const { data: uploads } = await db
      .from('user_uploads')
      .select('id')
      .eq('user_id', parseInt(user_id));

    const uploadCount = uploads?.length || 0;

    // 模拟报价和查看统计（实际应该从conversation表或其他表获取）
    const quoteCount = Math.floor(Math.random() * 50) + 10;
    const viewCount = Math.floor(Math.random() * 200) + 50;

    // 计算贡献值（邀请*30 + 上传*10 + 报价*5）
    const contribution = inviteRegistered * 30 + uploadCount * 10 + quoteCount * 5;

    // 计算排名（模拟）
    const rank = Math.max(1, 100 - Math.floor(contribution / 10));

    // 模拟7天积分趋势
    const pointsTrend = [];
    const basePoints = 0;
    for (let i = 0; i < 7; i++) {
      pointsTrend.push(basePoints + Math.floor(Math.random() * 20) + i * 5);
    }

    // 成就徽章
    const achievements = [
      {
        icon: '🤝',
        name: '邀请达人',
        desc: '邀请3位好友',
        progress: inviteRegistered,
        target: 3,
        unlocked: inviteRegistered >= 3,
      },
      {
        icon: '📤',
        name: '上传能手',
        desc: '上传10次',
        progress: uploadCount,
        target: 10,
        unlocked: uploadCount >= 10,
      },
      {
        icon: '💎',
        name: '高级会员',
        desc: '累计500积分',
        progress: 0, // 需要从user表获取
        target: 500,
        unlocked: false,
      },
      {
        icon: '🔥',
        name: '连续签到',
        desc: '连续7天登录',
        progress: Math.floor(Math.random() * 7),
        target: 7,
        unlocked: false,
      },
    ];

    return NextResponse.json({
      success: true,
      stats: {
        inviteCount: inviteRegistered,
        uploadCount,
        quoteCount,
        viewCount,
        contribution,
        rank,
        pointsTrend,
      },
      achievements,
    });
  } catch (error) {
    console.error('[UserStats] 请求失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}
