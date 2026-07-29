import { getSupabaseClient } from './supabase-client';

// 积分奖励规则
const POINTS_RULES = {
  register: 10,
  daily_login: 1,
  upload_price: 5,
  upload_doc: 10,
  upload_case: 20,
  upload_drawing: 15,
  data_adopted: 50,
  invite_friend: 30,
  redeem: -1 // 兑换消耗
};

// 增加积分（原子操作，使用 exec_sql RPC 执行原子 SQL 避免竞态条件）
export async function awardPoints(
  userId: number,
  type: string,
  points: number,
  referenceId?: string,
  description?: string
) {
  const db = getSupabaseClient();

  // 原子更新积分（SQL 表达式 points = points + delta，避免 read-then-write 竞态）
  await db.rpc('exec_sql', {
    sql: `UPDATE users SET points = GREATEST(COALESCE(points, 0) + $1, 0) WHERE id = $2;`,
    params: [points, userId],
  });

  // 读取更新后的值
  const { data: user } = await db
    .from('users')
    .select('points')
    .eq('id', userId)
    .single();

  // 创建积分记录
  const { data: record, error: recordError } = await db
    .from('point_records')
    .insert({
      user_id: userId,
      points,
      type,
      reference_id: referenceId,
      description: description || `积分变动：${type}`
    })
    .select()
    .single();

  if (recordError) {
    throw recordError;
  }

  return { success: true, newPoints: user?.points || 0, record };
}

// 消耗积分（原子操作，同时检查余额是否足够）
export async function consumePoints(
  userId: number,
  points: number,
  type: string,
  referenceId?: string,
  description?: string
) {
  const db = getSupabaseClient();

  // 原子操作：仅当 points >= 需要消耗的值时才扣减
  const absPoints = Math.abs(points);
  const { data: result, error: rpcError } = await db.rpc('exec_sql', {
    sql: `UPDATE users SET points = points - $1 WHERE id = $2 AND points >= $1 RETURNING points;`,
    params: [absPoints, userId],
  });

  if (rpcError || !result || result.length === 0) {
    throw new Error('积分不足');
  }

  // 创建积分记录
  const { data: record, error: recordError } = await db
    .from('point_records')
    .insert({
      user_id: userId,
      points: -absPoints,
      type,
      reference_id: referenceId,
      description: description || `积分消耗：${type}`
    })
    .select()
    .single();

  if (recordError) {
    throw recordError;
  }

  return { success: true, newPoints: (result[0] as any)?.points || 0, record };
}

// 获取用户当前积分
export async function getUserPoints(userId: number) {
  const db = getSupabaseClient();

  const { data: user, error } = await db
    .from('users')
    .select('points')
    .eq('id', userId)
    .single();

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
