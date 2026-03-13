import { getSupabaseClient } from './supabase-client';

// 积分奖励规则
const _POINTS_RULES = {
  register: 10,
  daily_login: 1,
  upload_price: 5,
  upload_doc: 10,
  upload_case: 20,
  upload_drawing: 15,
  data_adopted: 50,
  invite_friend: 30,
  redeem: -1, // 兑换消耗
};

// 增加或减少积分
export async function awardPoints(
  userId: number,
  type: string,
  points: number,
  referenceId?: string,
  description?: string
) {
  const db = getSupabaseClient();

  // 创建积分记录
  const { data: record, error: recordError } = await db
    .from('point_records')
    .insert({
      user_id: userId,
      points,
      type,
      reference_id: referenceId,
      description: description || `积分变动：${type}`,
    })
    .select()
    .single();

  if (recordError) {
    throw recordError;
  }

  // 更新用户总积分
  const { data: user, error: userError } = await db
    .from('users')
    .select('points')
    .eq('id', userId)
    .single();

  if (userError) {
    throw userError;
  }

  const newPoints = (user.points || 0) + points;

  const { error: updateError } = await db
    .from('users')
    .update({ points: newPoints })
    .eq('id', userId);

  if (updateError) {
    throw updateError;
  }

  return { success: true, newPoints, record };
}

// 消耗积分（减少积分）
export async function consumePoints(
  userId: number,
  points: number,
  type: string,
  referenceId?: string,
  description?: string
) {
  const db = getSupabaseClient();

  // 检查用户积分是否足够
  const { data: user, error: userError } = await db
    .from('users')
    .select('points')
    .eq('id', userId)
    .single();

  if (userError) {
    throw userError;
  }

  if ((user.points || 0) < points) {
    throw new Error('积分不足');
  }

  return awardPoints(userId, type, -points, referenceId, description);
}

// 获取用户当前积分
export async function getUserPoints(userId: number) {
  const db = getSupabaseClient();

  const { data: user, error } = await db.from('users').select('points').eq('id', userId).single();

  if (error) {
    throw error;
  }

  return user.points || 0;
}

// 获取用户等级
export async function getUserLevel(userId: number) {
  const points = await getUserPoints(userId);

  let level = 1;
  let nextLevelPoints = 100;

  if (points > 2000) {
    level = 5;
  } else if (points > 1000) {
    level = 4;
    nextLevelPoints = 2000;
  } else if (points > 500) {
    level = 3;
    nextLevelPoints = 1000;
  } else if (points > 100) {
    level = 2;
    nextLevelPoints = 500;
  }

  return { level, points, nextLevelPoints };
}
