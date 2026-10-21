import { NextRequest, NextResponse } from 'next/server';
import { getSupabaseClient } from '@/storage/database/supabase-client';
import { pointsService } from '@/lib/points-service';
import { getMultiLevelInviteRewards } from '@/lib/contributor/points-config';

// 多级奖励积分规则（#[20260827-1030]-8）
//   原硬编码常量 MULTI_LEVEL_REWARDS 已删除，由 points_rules 表驱动：
//     - invite_level1 → rule_key 'invite_level1'   (fallback 50)
//     - invite_level2 → rule_key 'invite_level2'   (fallback 10)
//     - invite_level3 → rule_key 'invite_level3'   (fallback 5)
//   DB 不可达时返回 fallback 默认值，保证零停机降级（见 points-config.ts）。
//   本路由每次请求均重新读取，确保管理员后台调整 points_rules 后立即生效
//   （points-config.ts 内部 30s TTL 缓存，避免高频请求打 DB）。

// 处理用户注册时的邀请奖励（多级）
export async function POST(request: NextRequest) {
  try {
    const body = await request.json();
    const { invitee_id, invite_code, channel_type } = body;

    if (!invitee_id || !invite_code) {
      return NextResponse.json({ error: '缺少必要参数' }, { status: 400 });
    }

    const db = getSupabaseClient();

    // 动态读取多级奖励积分（points_rules 驱动）
    const rewards = await getMultiLevelInviteRewards();

    // 验证邀请码
    const { data: codeData, error: codeError } = await db
      .from('invite_codes')
      .select('*')
      .eq('code', invite_code)
      .eq('is_active', true)
      .single();

    if (codeError || !codeData) {
      return NextResponse.json({ error: '邀请码无效' }, { status: 404 });
    }

    const inviterId = codeData.user_id;

    // 检查是否已经有邀请关系（防止重复奖励）
    const { data: existingRelation } = await db
      .from('invite_relations')
      .select('*')
      .eq('invitee_id', parseInt(invitee_id))
      .single();

    if (existingRelation) {
      return NextResponse.json({ error: '已经建立过邀请关系' }, { status: 400 });
    }

    // 创建一级邀请关系
    const { data: _relation1, error: relation1Error } = await db
      .from('invite_relations')
      .insert({
        inviter_id: inviterId,
        invitee_id: parseInt(invitee_id),
        level: 1,
        points_awarded: rewards.level1,
        channel_type,
      })
      .select()
      .single();

    if (relation1Error) throw relation1Error;

    // 一级邀请人奖励
    await pointsService.addPoints(
      inviterId,
      rewards.level1,
      'invite_reward',
      `邀请一级好友注册`,
      `invite_${invitee_id}_level1`
    );

    // 查找一级邀请人的邀请人（二级）
    const { data: level2Relation } = await db
      .from('invite_relations')
      .select('*')
      .eq('invitee_id', inviterId)
      .eq('level', 1)
      .single();

    if (level2Relation) {
      // 创建二级邀请关系
      await db.from('invite_relations').insert({
        inviter_id: level2Relation.inviter_id,
        invitee_id: parseInt(invitee_id),
        level: 2,
        points_awarded: rewards.level2,
        channel_type,
      });

      // 二级邀请人奖励
      await pointsService.addPoints(
        level2Relation.inviter_id,
        rewards.level2,
        'invite_reward',
        `邀请二级好友注册`,
        `invite_${invitee_id}_level2`
      );
    }

    // 查找二级邀请人的邀请人（三级）
    if (level2Relation) {
      const { data: level3Relation } = await db
        .from('invite_relations')
        .select('*')
        .eq('invitee_id', level2Relation.inviter_id)
        .eq('level', 1)
        .single();

      if (level3Relation) {
        // 创建三级邀请关系
        await db.from('invite_relations').insert({
          inviter_id: level3Relation.inviter_id,
          invitee_id: parseInt(invitee_id),
          level: 3,
          points_awarded: rewards.level3,
          channel_type,
        });

        // 三级邀请人奖励
        await pointsService.addPoints(
          level3Relation.inviter_id,
          rewards.level3,
          'invite_reward',
          `邀请三级好友注册`,
          `invite_${invitee_id}_level3`
        );
      }
    }

    // 更新邀请码的注册次数
    await db
      .from('invite_codes')
      .update({ register_count: (codeData.register_count || 0) + 1 })
      .eq('id', codeData.id);

    return NextResponse.json({
      success: true,
      message: '邀请关系建立成功，奖励已发放',
    });
  } catch (error) {
    console.error('[InviteReward] 处理邀请奖励失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}

// 获取用户的邀请关系树
export async function GET(request: NextRequest) {
  try {
    const searchParams = request.nextUrl.searchParams;
    const user_id = searchParams.get('user_id');

    if (!user_id) {
      return NextResponse.json({ error: '缺少用户ID' }, { status: 400 });
    }

    const db = getSupabaseClient();

    // 动态读取多级奖励积分（points_rules 驱动），保证 GET 返回值与 POST 发放值一致
    const rewards = await getMultiLevelInviteRewards();

    // 获取该用户邀请的所有好友（一级）
    const { data: level1Invites, error: level1Error } = await db
      .from('invite_relations')
      .select(
        `
        *,
        invitee:users!invite_relations_invitee_id_fkey (
          id,
          username,
          email,
          avatar
        )
      `
      )
      .eq('inviter_id', parseInt(user_id))
      .eq('level', 1)
      .order('created_at', { ascending: false });

    if (level1Error) throw level1Error;

    // 获取二级好友
    const level2UserIds = level1Invites?.map((i: any) => i.invitee.id) || [];
    let level2Invites: any[] = [];

    if (level2UserIds.length > 0) {
      const { data: level2Data } = await db
        .from('invite_relations')
        .select(
          `
          *,
          invitee:users!invite_relations_invitee_id_fkey (
            id,
            username,
            email,
            avatar
          ),
          inviter:users!invite_relations_inviter_id_fkey (
            id,
            username
          )
        `
        )
        .in('inviter_id', level2UserIds)
        .eq('level', 1);

      if (level2Data) {
        level2Invites = level2Data.filter((i: any) =>
          level1Invites?.some((l1: any) => l1.inviter_id === i.inviter.id)
        );
      }
    }

    // 补充 points_awarded 字段（与 POST 发放值一致：动态 points_rules 读取）
    const level1WithPoints = (level1Invites || []).map((i: any) => ({
      ...i,
      points_awarded: rewards.level1,
    }));
    const level2WithPoints = level2Invites.map((i: any) => ({
      ...i,
      points_awarded: rewards.level2,
    }));

    // 统计各级邀请数量和积分（与发放值一致）
    const stats = {
      level1Count: level1Invites?.length || 0,
      level2Count: level2Invites?.length || 0,
      level1Points: (level1Invites?.length || 0) * rewards.level1,
      level2Points: (level2Invites?.length || 0) * rewards.level2,
      totalPoints:
        (level1Invites?.length || 0) * rewards.level1 +
        (level2Invites?.length || 0) * rewards.level2,
    };

    return NextResponse.json({
      success: true,
      data: {
        level1: level1WithPoints,
        level2: level2WithPoints,
        stats,
      },
    });
  } catch (error) {
    console.error('[InviteReward] 获取邀请关系失败:', error);
    return NextResponse.json({ error: '服务器错误' }, { status: 500 });
  }
}